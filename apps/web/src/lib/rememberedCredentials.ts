import { REMEMBER_KEY } from "../config/uiConfig.js";
import { getDesktopBridge, persistentStorage } from "./persistentStorage.js";

export type RememberedCredentials = {
  version: 2;
  rememberEmail: boolean;
  rememberPassword: boolean;
  email: string;
  passwordCipher?: string;
};

type LegacyRememberedCredentials = {
  remember?: boolean;
  email?: string;
};

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function loadRememberedCredentials(): RememberedCredentials {
  const raw = persistentStorage.getItem(REMEMBER_KEY);
  if (!raw) return { version: 2, rememberEmail: false, rememberPassword: false, email: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedCredentials> & LegacyRememberedCredentials;
    if (parsed.version === 2) {
      return {
        version: 2,
        rememberEmail: Boolean(parsed.rememberEmail),
        rememberPassword: Boolean(parsed.rememberPassword && parsed.passwordCipher),
        email: parsed.email || "",
        passwordCipher: parsed.passwordCipher,
      };
    }
    return {
      version: 2,
      rememberEmail: Boolean(parsed.remember),
      rememberPassword: false,
      email: parsed.email || "",
    };
  } catch {
    const fallbackEmail = raw.trim();
    if (looksLikeEmail(fallbackEmail)) {
      return { version: 2, rememberEmail: true, rememberPassword: false, email: fallbackEmail };
    }
    return { version: 2, rememberEmail: false, rememberPassword: false, email: "" };
  }
}

export function rememberEmailOnly(email: string): void {
  const cleanEmail = email.trim();
  if (!looksLikeEmail(cleanEmail)) return;
  const existing = loadRememberedCredentials();
  const sameEmail = existing.email.trim().toLowerCase() === cleanEmail.toLowerCase();
  const record: RememberedCredentials = {
    version: 2,
    rememberEmail: true,
    rememberPassword: sameEmail ? existing.rememberPassword : false,
    email: cleanEmail,
    passwordCipher: sameEmail ? existing.passwordCipher : undefined,
  };
  persistentStorage.setItem(REMEMBER_KEY, JSON.stringify(record));
}

export function forgetRememberedPassword(): void {
  const existing = loadRememberedCredentials();
  if (!existing.rememberEmail || !existing.email) {
    persistentStorage.removeItem(REMEMBER_KEY);
    return;
  }
  const record: RememberedCredentials = {
    version: 2,
    rememberEmail: true,
    rememberPassword: false,
    email: existing.email,
  };
  persistentStorage.setItem(REMEMBER_KEY, JSON.stringify(record));
}

export async function saveRememberedCredentials(value: {
  rememberEmail: boolean;
  rememberPassword: boolean;
  email: string;
  password: string;
  previousPasswordCipher?: string;
}): Promise<string | undefined> {
  if (!value.rememberEmail) {
    persistentStorage.removeItem(REMEMBER_KEY);
    return undefined;
  }
  const record: RememberedCredentials = {
    version: 2,
    rememberEmail: true,
    rememberPassword: false,
    email: value.email.trim(),
  };
  let warning: string | undefined;
  if (value.rememberPassword) {
    const desktopApp = getDesktopBridge();
    const encryptionAvailable =
      desktopApp?.canEncryptText
        ? await Promise.resolve(desktopApp.canEncryptText()).catch(() => false)
        : false;
    if (desktopApp?.encryptText && encryptionAvailable) {
      if (value.password) {
        try {
          record.passwordCipher = await Promise.resolve(desktopApp.encryptText(value.password));
          record.rememberPassword = Boolean(record.passwordCipher);
        } catch (error) {
          warning = error instanceof Error
            ? `密码安全保存失败：${error.message}`
            : "密码安全保存失败，本次仅记住邮箱。";
        }
      } else if (value.previousPasswordCipher) {
        record.passwordCipher = value.previousPasswordCipher;
        record.rememberPassword = true;
      }
    } else {
      warning = "Windows 安全存储当前不可用，本次仅记住邮箱。";
    }
  }
  persistentStorage.setItem(REMEMBER_KEY, JSON.stringify(record));
  return warning;
}

export function clearRememberedCredentials(): void {
  persistentStorage.removeItem(REMEMBER_KEY);
}
