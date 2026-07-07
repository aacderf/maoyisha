import { ANNOUNCEMENT_BY_VERSION, APP_VERSION } from "../config/appConfig.js";
import { resolveAssetUrl } from "./hotUpdate.js";

export type AppContent = {
  appVersion: string;
  announcementVersion: string;
  announcementTitle: string;
  announcementItems: string[];
};

export const FALLBACK_APP_CONTENT: AppContent = {
  appVersion: APP_VERSION,
  announcementVersion: ANNOUNCEMENT_BY_VERSION.version,
  announcementTitle: ANNOUNCEMENT_BY_VERSION.title,
  announcementItems: ANNOUNCEMENT_BY_VERSION.items,
};

export async function loadHotAppContent(): Promise<AppContent> {
  const response = await fetch(`${resolveAssetUrl("assets/config/app-content.json")}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("app-content.json 不可用。");
  const data = (await response.json()) as Partial<AppContent>;
  return {
    appVersion: String(data.appVersion || FALLBACK_APP_CONTENT.appVersion),
    announcementVersion: String(data.announcementVersion || data.appVersion || FALLBACK_APP_CONTENT.announcementVersion),
    announcementTitle: String(data.announcementTitle || FALLBACK_APP_CONTENT.announcementTitle),
    announcementItems: Array.isArray(data.announcementItems)
      ? data.announcementItems.map(String)
      : FALLBACK_APP_CONTENT.announcementItems,
  };
}
