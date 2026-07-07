import { beforeEach, describe, expect, it } from "vitest";
import { REMEMBER_KEY } from "../config/uiConfig.js";
import {
  loadRememberedCredentials,
  saveRememberedCredentials,
} from "./rememberedCredentials.js";
import type { DesktopBridge } from "./persistentStorage.js";

const browserValues = new Map<string, string>();
const desktopValues = new Map<string, string>();
const testWindow = {
  localStorage: {
    getItem: (key: string) => browserValues.get(key) ?? null,
    setItem: (key: string, value: string) => browserValues.set(key, value),
    removeItem: (key: string) => browserValues.delete(key),
  },
  desktopApp: undefined as DesktopBridge | undefined,
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: testWindow,
});

describe("remembered credentials", () => {
  beforeEach(() => {
    browserValues.clear();
    desktopValues.clear();
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
      canEncryptText: () => true,
      encryptText: (value) => `cipher:${value}`,
      decryptText: (value) => value.replace(/^cipher:/, ""),
    };
  });

  it("persists an encrypted password and restores it through safe storage", async () => {
    const warning = await saveRememberedCredentials({
      rememberEmail: true,
      rememberPassword: true,
      email: "player@example.com",
      password: "secret123",
    });
    const remembered = loadRememberedCredentials();

    expect(warning).toBeUndefined();
    expect(remembered.rememberPassword).toBe(true);
    expect(remembered.passwordCipher).toBe("cipher:secret123");
    expect(await testWindow.desktopApp?.decryptText?.(remembered.passwordCipher!)).toBe("secret123");
    expect(desktopValues.has(REMEMBER_KEY)).toBe(true);
  });

  it("keeps the email and reports when Windows encryption is unavailable", async () => {
    testWindow.desktopApp = {
      ...testWindow.desktopApp,
      canEncryptText: () => false,
    };
    const warning = await saveRememberedCredentials({
      rememberEmail: true,
      rememberPassword: true,
      email: "player@example.com",
      password: "secret123",
    });

    expect(warning).toContain("安全存储");
    expect(loadRememberedCredentials()).toMatchObject({
      rememberEmail: true,
      rememberPassword: false,
      email: "player@example.com",
    });
  });
});
