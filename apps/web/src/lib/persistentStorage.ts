export type DesktopBridge = {
  platform?: string;
  mode?: string;
  restart?: () => void;
  quit?: () => void;
  openLogs?: () => Promise<unknown> | unknown;
  canEncryptText?: () => Promise<boolean> | boolean;
  encryptText?: (value: string) => Promise<string> | string;
  decryptText?: (value: string) => Promise<string> | string;
  storageGet?: (key: string) => string | null;
  storageSet?: (key: string, value: string) => boolean;
  storageRemove?: (key: string) => boolean;
  reportNetworkDiagnostic?: (value: unknown) => void;
};

export function getDesktopBridge(): DesktopBridge | undefined {
  return (window as typeof window & { desktopApp?: DesktopBridge }).desktopApp;
}

export function persistentGetItem(key: string): string | null {
  const bridge = getDesktopBridge();
  if (bridge?.storageGet) {
    try {
      const persisted = bridge.storageGet(key);
      if (persisted !== null) return persisted;
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) bridge.storageSet?.(key, legacy);
      return legacy;
    } catch {
      // Fall through to browser storage when the desktop bridge is unavailable.
    }
  }
  return window.localStorage.getItem(key);
}

export function persistentSetItem(key: string, value: string): void {
  const serialized = String(value);
  const bridge = getDesktopBridge();
  if (bridge?.storageSet) {
    try {
      bridge.storageSet(key, serialized);
    } catch {
      // localStorage remains the browser/Android fallback.
    }
  }
  window.localStorage.setItem(key, serialized);
}

export function persistentRemoveItem(key: string): void {
  const bridge = getDesktopBridge();
  if (bridge?.storageRemove) {
    try {
      bridge.storageRemove(key);
    } catch {
      // localStorage remains the browser/Android fallback.
    }
  }
  window.localStorage.removeItem(key);
}

export const persistentStorage = {
  getItem: persistentGetItem,
  setItem: persistentSetItem,
  removeItem: persistentRemoveItem,
};
