import { beforeEach, describe, expect, it } from "vitest";
import {
  persistentGetItem,
  persistentRemoveItem,
  persistentSetItem,
  type DesktopBridge,
} from "./persistentStorage.js";

const browserValues = new Map<string, string>();
const desktopValues = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => browserValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    browserValues.set(key, value);
  },
  removeItem: (key: string) => {
    browserValues.delete(key);
  },
};
const testWindow = {
  localStorage: localStorageMock,
  desktopApp: undefined as DesktopBridge | undefined,
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: testWindow,
});

describe("persistent storage", () => {
  beforeEach(() => {
    browserValues.clear();
    desktopValues.clear();
    testWindow.desktopApp = undefined;
  });

  it("uses localStorage in the browser", () => {
    persistentSetItem("setting", "one");
    expect(persistentGetItem("setting")).toBe("one");
    persistentRemoveItem("setting");
    expect(persistentGetItem("setting")).toBeNull();
  });

  it("uses the desktop bridge and migrates an existing browser value", () => {
    browserValues.set("setting", "legacy");
    testWindow.desktopApp = {
      storageGet: (key) => desktopValues.get(key) ?? null,
      storageSet: (key, value) => {
        desktopValues.set(key, value);
        return true;
      },
      storageRemove: (key) => {
        desktopValues.delete(key);
        return true;
      },
    };

    expect(persistentGetItem("setting")).toBe("legacy");
    expect(desktopValues.get("setting")).toBe("legacy");
    persistentSetItem("setting", "desktop");
    expect(persistentGetItem("setting")).toBe("desktop");
    persistentRemoveItem("setting");
    expect(desktopValues.has("setting")).toBe(false);
    expect(browserValues.has("setting")).toBe(false);
  });
});
