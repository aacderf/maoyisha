import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { ScreenOrientation } from "@capacitor/screen-orientation";

export const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const NativeMobilePlatform = registerPlugin<{
  ensureMicrophonePermission(): Promise<{ granted: boolean }>;
  enterImmersiveMode(): Promise<void>;
  refreshSafeArea(): Promise<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
}>("MobilePlatform");

export type ViewportProfile = {
  width: number;
  height: number;
  aspectRatio: number;
  compact: boolean;
  wide: boolean;
  cutout: boolean;
};

export type MobileLifecycleHandlers = {
  onBack?: () => boolean | void;
  onPause?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
  onNetworkChange?: (connected: boolean) => void;
};

export function prepareMobilePlatform(): void {
  if (!isAndroidNative) return;
  document.documentElement.classList.add("native-android");
  updateViewportProfile();
}

export async function enterImmersiveMode(): Promise<void> {
  if (!isAndroidNative) return;
  await NativeMobilePlatform.enterImmersiveMode().catch(() => undefined);
}

export async function refreshSafeArea(): Promise<void> {
  if (!isAndroidNative) return;
  const insets = await NativeMobilePlatform.refreshSafeArea().catch(() => undefined);
  if (insets) {
    const root = document.documentElement.style;
    root.setProperty("--safe-area-inset-top", `${insets.top}px`);
    root.setProperty("--safe-area-inset-right", `${insets.right}px`);
    root.setProperty("--safe-area-inset-bottom", `${insets.bottom}px`);
    root.setProperty("--safe-area-inset-left", `${insets.left}px`);
  }
  updateViewportProfile();
}

export function getViewportProfile(): ViewportProfile {
  const viewport = window.visualViewport;
  const width = Math.round(viewport?.width ?? window.innerWidth);
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const aspectRatio = width / Math.max(1, height);
  const styles = getComputedStyle(document.documentElement);
  const cutout = ["top", "right", "bottom", "left"].some(
    (edge) => Number.parseFloat(styles.getPropertyValue(`--safe-area-inset-${edge}`)) > 0
  );
  return {
    width,
    height,
    aspectRatio,
    compact: height <= 720 || width <= 1280,
    wide: aspectRatio >= 2.15,
    cutout,
  };
}

function updateViewportProfile(): void {
  if (!isAndroidNative) return;
  const profile = getViewportProfile();
  const root = document.documentElement;
  root.style.setProperty("--app-width", `${profile.width}px`);
  root.style.setProperty("--app-height", `${profile.height}px`);
  root.classList.toggle("native-compact", profile.compact);
  root.classList.toggle("native-wide", profile.wide);
  root.classList.toggle("native-cutout", profile.cutout);
}

export async function initializeMobilePlatform(
  handlers: MobileLifecycleHandlers
): Promise<() => Promise<void>> {
  if (!isAndroidNative) return async () => undefined;

  prepareMobilePlatform();
  await enterImmersiveMode();
  await refreshSafeArea();
  await ScreenOrientation.lock({ orientation: "landscape" }).catch(() => undefined);

  const listeners: Array<{ remove(): Promise<void> }> = [];
  const refreshViewport = () => {
    window.requestAnimationFrame(() => {
      void refreshSafeArea();
    });
  };
  window.addEventListener("resize", refreshViewport);
  window.visualViewport?.addEventListener("resize", refreshViewport);
  window.visualViewport?.addEventListener("scroll", refreshViewport);
  listeners.push(
    await CapacitorApp.addListener("backButton", () => {
      const handled = handlers.onBack?.();
      if (handled === false) void CapacitorApp.exitApp();
    })
  );
  listeners.push(
    await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void enterImmersiveMode();
        void refreshSafeArea();
        void handlers.onResume?.();
      } else {
        void handlers.onPause?.();
      }
    })
  );
  listeners.push(
    await Network.addListener("networkStatusChange", ({ connected }) => {
      handlers.onNetworkChange?.(connected);
    })
  );

  return async () => {
    window.removeEventListener("resize", refreshViewport);
    window.visualViewport?.removeEventListener("resize", refreshViewport);
    window.visualViewport?.removeEventListener("scroll", refreshViewport);
    await Promise.all(listeners.map((listener) => listener.remove()));
  };
}

export async function ensureMicrophonePermission(): Promise<void> {
  if (!isAndroidNative) return;
  const result = await NativeMobilePlatform.ensureMicrophonePermission();
  if (!result.granted) {
    throw new Error("麦克风权限被拒绝，请在系统设置中允许茂一杀使用麦克风。");
  }
}
