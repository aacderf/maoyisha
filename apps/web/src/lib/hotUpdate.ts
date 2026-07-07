import { Capacitor, registerPlugin } from "@capacitor/core";

// 七牛测试域名仅支持 HTTP；正式域名启用 HTTPS 后只需修改这一处。
export const REMOTE_BASE_URL = "http://tgme05dcw.hn-bkt.clouddn.com";

export type HotUpdateState = {
  status: "checking" | "downloading" | "verifying" | "complete" | "none" | "fallback";
  progress: number;
  detail: string;
};

type NativeHotUpdateResult = {
  status: HotUpdateState["status"];
  detail?: string;
  assetRootUri?: string;
  files?: string[];
  manifest?: Record<string, unknown>;
};

type HotUpdatePlugin = {
  checkUpdate(options: { baseUrl: string }): Promise<NativeHotUpdateResult>;
  getActiveManifest(): Promise<NativeHotUpdateResult>;
  addListener(
    eventName: "hotUpdateProgress",
    listener: (state: HotUpdateState) => void
  ): Promise<{ remove(): Promise<void> }>;
};

const NativeHotUpdate = registerPlugin<HotUpdatePlugin>("HotUpdate");
let activeAssetRoot = "";
let activeFiles = new Set<string>();

export async function initializeHotUpdate(
  onProgress: (state: HotUpdateState) => void
): Promise<NativeHotUpdateResult> {
  if (!Capacitor.isNativePlatform()) {
    const result: NativeHotUpdateResult = { status: "none", detail: "使用本地资源。" };
    onProgress({
      status: result.status,
      progress: 100,
      detail: result.detail || "使用本地资源。",
    });
    return result;
  }

  const listener = await NativeHotUpdate.addListener("hotUpdateProgress", onProgress);
  try {
    const result = await NativeHotUpdate.checkUpdate({ baseUrl: REMOTE_BASE_URL });
    applyActiveResult(result);
    return result;
  } catch (error) {
    const fallback = await NativeHotUpdate.getActiveManifest().catch(() => ({
      status: "fallback" as const,
      detail: "热更新不可用，使用 APK 内置资源。",
    }));
    applyActiveResult(fallback);
    return fallback;
  } finally {
    await listener.remove();
  }
}

export function resolveAssetUrl(input: string): string {
  const normalized = normalizeAssetPath(input);
  if (activeAssetRoot && activeFiles.has(normalized)) {
    return Capacitor.convertFileSrc(`${activeAssetRoot}/${normalized}`);
  }
  return `./${normalized}`;
}

export function activeHotUpdateFiles(): ReadonlySet<string> {
  return activeFiles;
}

function applyActiveResult(result: NativeHotUpdateResult): void {
  activeAssetRoot = String(result.assetRootUri || "").replace(/\/+$/, "");
  activeFiles = new Set((result.files || []).map(normalizeAssetPath));
}

function normalizeAssetPath(path: string): string {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "")
    .replace(/^\/+/, "");
}
