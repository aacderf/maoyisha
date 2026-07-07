import cloudbase from "@cloudbase/js-sdk";
import type { AuthSession, UserProfile } from "@cardgame/shared";
import {
  ADMIN_EMAIL,
  CLOUDBASE_ACCESS_KEY,
  CLOUDBASE_ENV_ID as APP_CLOUDBASE_ENV_ID,
  CLOUDBASE_REGION,
} from "../config/appConfig.js";
import { persistentStorage } from "./persistentStorage.js";

export const CLOUDBASE_ENV_ID = APP_CLOUDBASE_ENV_ID;
const REGISTER_PENDING_LOGIN_MESSAGE = "注册已提交，请用刚才账号密码登录。";

type CloudBaseAuth = ReturnType<ReturnType<typeof cloudbase.init>["auth"]>;
type CloudBaseResult = {
  data?: {
    user?: CloudBaseUser;
    session?: {
      access_token?: string;
      accessToken?: string;
      user?: CloudBaseUser;
    };
    verifyOtp?: (params: { token: string; messageId?: string }) => Promise<CloudBaseResult>;
    updateUser?: (attributes: { nonce: string; password: string }) => Promise<CloudBaseResult>;
  };
  error?: {
    code?: string;
    message?: string;
  } | null;
};
type CloudBaseErrorContext = "login" | "register" | "registerAutoLogin" | "reset" | "session";
type CloudBaseRawError = {
  code?: string;
  message?: string;
  error_code?: string | number;
  errorCode?: string | number;
  error_msg?: string;
  errorMessage?: string;
};
type CloudBaseLowLevelAuth = CloudBaseAuth & {
  oauthInstance?: {
    authApi?: {
      signUp?: (params: Record<string, unknown>) => Promise<CloudBaseRawError | Record<string, unknown>>;
    };
  };
};
type CloudBasePasswordAuth = {
  getVerification?: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<CloudBaseVerificationInfo>;
  verify?: (params: Record<string, unknown>) => Promise<CloudBaseVerifyResult>;
  signIn?: (params: Record<string, unknown>) => Promise<CloudBaseResult | undefined>;
  signInWithEmail?: (params: Record<string, unknown>) => Promise<CloudBaseResult | undefined>;
  signInWithOtp?: (params: Record<string, unknown>) => Promise<CloudBaseResult>;
  signInWithPassword?: (params: Record<string, unknown>) => Promise<CloudBaseResult>;
  signInWithEmailAndPassword?: (email: string, password: string) => Promise<CloudBaseResult>;
  signUpWithEmailAndPassword?: (email: string, password: string) => Promise<CloudBaseResult>;
  resetPasswordForEmail?: (emailOrPhone: string, options?: Record<string, unknown>) => Promise<CloudBaseResult>;
  sendPasswordResetEmail?: (email: string) => Promise<CloudBaseResult | void>;
  isUsernameRegistered?: (username: string) => Promise<boolean>;
  updateUserBasicInfo?: (params: Record<string, unknown>) => Promise<void>;
  update?: (params: Record<string, unknown>) => Promise<void>;
};
type CloudBaseVerificationInfo = {
  verification_id: string;
  is_user?: boolean;
  error?: {
    code?: string;
    message?: string;
  } | null;
};
type CloudBaseVerifyResult = {
  verification_token?: string;
  error?: {
    code?: string;
    message?: string;
  } | null;
};

type CloudBaseUser = {
  id?: string;
  uid?: string;
  email?: string;
  name?: string;
  displayName?: string;
  nickname?: string;
  nickName?: string;
  username?: string;
  user_metadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export interface CloudBaseAuthSession extends AuthSession {
  needsNickname: boolean;
}

export type CloudBaseEmailCodeChallenge = {
  email: string;
  password?: string;
  verificationInfo?: CloudBaseVerificationInfo;
  verifyOtp?: (params: { token: string; messageId?: string }) => Promise<CloudBaseResult>;
};

export type CloudBasePasswordResetChallenge = {
  email: string;
  updateUser?: (attributes: { nonce: string; password: string }) => Promise<CloudBaseResult>;
};

const cloudbaseInitConfig = {
  env: CLOUDBASE_ENV_ID,
  region: CLOUDBASE_REGION,
  timeout: 15000,
  persistence: "local" as const,
  auth: {
    detectSessionInUrl: true,
  },
  ...(CLOUDBASE_ACCESS_KEY ? { accessKey: CLOUDBASE_ACCESS_KEY } : {}),
};

export const cloudbaseApp = cloudbase.init(cloudbaseInitConfig);

const auth = cloudbaseApp.auth({
  persistence: "local",
}) as CloudBaseAuth;
const LOCAL_NICKNAME_PREFIX = "maoyi.nickname.";

export function getCloudBaseConfigWarning(): string | undefined {
  if (!CLOUDBASE_ENV_ID) return "CloudBase 环境 ID 未配置。";
  if (!CLOUDBASE_REGION) return "CloudBase 地域未配置。";
  if (!CLOUDBASE_ACCESS_KEY || CLOUDBASE_ACCESS_KEY.includes("填入")) {
    return "CloudBase 匿名访问令牌未配置，请在 apps/web/.env 填写 VITE_CLOUDBASE_ACCESS_KEY。";
  }
  return undefined;
}

export async function loadCloudBaseSession(): Promise<CloudBaseAuthSession | undefined> {
  const userResult = await auth.getUser().catch(() => undefined) as CloudBaseResult | undefined;
  const user = userResult?.data?.user ?? await auth.getCurrentUser();
  if (!user) return undefined;
  const sessionResult = await auth.getSession().catch(() => undefined) as CloudBaseResult | undefined;
  return sessionFromCloudBaseUser(user as CloudBaseUser, readToken(sessionResult));
}

export async function loginWithCloudBaseEmail(email: string, password: string): Promise<CloudBaseAuthSession> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    const result = await signInWithPasswordCompat(cleanEmail, password);
    assertCloudBaseOk(result, "登录失败。", cleanEmail);
    return await buildRefreshedSession(result);
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "登录失败。", cleanEmail));
  }
}

export async function registerWithCloudBaseEmail(email: string, password: string): Promise<CloudBaseAuthSession> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    const result = await signUpWithPasswordCompat(cleanEmail, password);
    assertCloudBaseOk(result, "注册失败。", cleanEmail, "register");
    const directToken = readToken(result);
    if (directToken || result.data?.session || result.data?.user) {
      return await buildRefreshedSession(result);
    }
    try {
      const loginResult = await signInWithPasswordCompat(cleanEmail, password);
      assertCloudBaseOk(loginResult, "注册成功，但自动登录失败。", cleanEmail, "registerAutoLogin");
      return await buildRefreshedSession(loginResult);
    } catch {
      throw new Error(REGISTER_PENDING_LOGIN_MESSAGE);
    }
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "注册失败。", cleanEmail, "register"));
  }
}

export async function requestCloudBaseEmailLoginCode(email: string): Promise<CloudBaseEmailCodeChallenge> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    const emailAuth = auth as unknown as CloudBasePasswordAuth;
    if (typeof emailAuth.signInWithOtp !== "function") {
      throw new Error("当前 CloudBase SDK 不支持邮箱验证码登录。");
    }
    const result = await emailAuth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });
    assertCloudBaseOk(result, "验证码发送失败。", cleanEmail, "login");
    if (typeof result.data?.verifyOtp !== "function") {
      throw new Error("CloudBase 未返回验证码登录入口，请确认已开启邮箱验证码登录。");
    }
    return { email: cleanEmail, verifyOtp: result.data.verifyOtp };
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "验证码发送失败。", cleanEmail, "login"));
  }
}

async function requestCloudBaseEmailLoginCodeLegacy(email: string): Promise<CloudBaseEmailCodeChallenge> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    const emailAuth = auth as unknown as CloudBasePasswordAuth;
    if (typeof emailAuth.getVerification !== "function") {
      throw new Error("当前 CloudBase SDK 不支持邮箱验证码。");
    }
    const verificationInfo = await emailAuth.getVerification({ email: cleanEmail });
    assertCloudBaseOk(verificationInfo as unknown as CloudBaseResult, "验证码发送失败。", cleanEmail, "login");
    if (!verificationInfo.is_user) {
      throw new Error("该邮箱未注册，请先注册。");
    }
    return { email: cleanEmail, verificationInfo };
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "验证码发送失败。", cleanEmail, "login"));
  }
}

export async function loginWithCloudBaseEmailCode(challenge: CloudBaseEmailCodeChallenge, code: string): Promise<CloudBaseAuthSession> {
  const cleanCode = code.trim();
  try {
    if (!challenge.verifyOtp) throw new Error("请先发送邮箱验证码。");
    const result = await challenge.verifyOtp({ token: cleanCode });
    assertCloudBaseOk(result, "邮箱验证码登录失败。", challenge.email, "login");
    return await buildRefreshedSession(result ?? { data: {}, error: null });
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "邮箱验证码登录失败。", challenge.email, "login"));
  }
}

async function loginWithCloudBaseEmailCodeLegacy(challenge: CloudBaseEmailCodeChallenge, code: string): Promise<CloudBaseAuthSession> {
  const cleanCode = code.trim();
  try {
    if (!challenge.verificationInfo?.verification_id) throw new Error("请先发送邮箱验证码。");
    const emailAuth = auth as unknown as CloudBasePasswordAuth;
    if (typeof emailAuth.signInWithEmail !== "function") {
      throw new Error("当前 CloudBase SDK 不支持邮箱验证码登录。");
    }
    const result = await emailAuth.signInWithEmail({
      verificationInfo: challenge.verificationInfo,
      verificationCode: cleanCode,
      email: challenge.email,
    });
    assertCloudBaseOk(result, "邮箱验证码登录失败。", challenge.email, "login");
    return await buildRefreshedSession(result ?? { data: {}, error: null });
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "邮箱验证码登录失败。", challenge.email, "login"));
  }
}

export async function requestCloudBaseEmailRegisterCode(email: string, password: string): Promise<CloudBaseEmailCodeChallenge> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    if (await isRegisteredEmail(cleanEmail)) {
      throw new Error("邮箱已注册，请直接登录。");
    }
    if (typeof auth.signUp !== "function") {
      throw new Error("当前 CloudBase SDK 不支持邮箱验证码注册。");
    }
    const result = await auth.signUp({ email: cleanEmail, password }) as CloudBaseResult;
    assertCloudBaseOk(result, "验证码发送失败。", cleanEmail, "register");
    if (typeof result.data?.verifyOtp !== "function") {
      throw new Error("CloudBase 未返回验证码提交入口，请确认已开启邮箱验证码注册。");
    }
    return {
      email: cleanEmail,
      password,
      verifyOtp: result.data.verifyOtp,
    };
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "验证码发送失败。", cleanEmail, "register"));
  }
}

export async function registerWithCloudBaseEmailCode(challenge: CloudBaseEmailCodeChallenge, code: string): Promise<CloudBaseAuthSession> {
  const cleanCode = code.trim();
  try {
    if (!challenge.password) throw new Error("注册密码状态已失效，请重新发送验证码。");
    if (!challenge.verifyOtp) throw new Error("请先发送邮箱验证码。");
    const result = await challenge.verifyOtp({ token: cleanCode });
    assertCloudBaseOk(result, "邮箱验证码注册失败。", challenge.email, "register");
    return await buildRefreshedSession(result);
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "邮箱验证码注册失败。", challenge.email, "register"));
  }
}

export async function requestCloudBasePasswordResetCode(email: string): Promise<CloudBasePasswordResetChallenge> {
  const cleanEmail = email.trim();
  try {
    assertCloudBaseConfigReady();
    const passwordAuth = auth as unknown as CloudBasePasswordAuth;
    if (typeof passwordAuth.resetPasswordForEmail === "function") {
      const result = await passwordAuth.resetPasswordForEmail(cleanEmail);
      assertCloudBaseOk(result, "密码重置验证码发送失败。", cleanEmail, "reset");
      if (typeof result.data?.updateUser !== "function") {
        throw new Error("CloudBase 未返回密码重置入口，请确认邮箱验证码能力已启用。");
      }
      return { email: cleanEmail, updateUser: result.data.updateUser };
    }
    if (typeof passwordAuth.sendPasswordResetEmail === "function") {
      await passwordAuth.sendPasswordResetEmail(cleanEmail);
      return { email: cleanEmail };
    }
    throw new Error("当前 CloudBase SDK 不支持邮箱密码重置。");
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "密码重置验证码发送失败。", cleanEmail, "reset"));
  }
}

export async function resetCloudBasePasswordWithCode(
  challenge: CloudBasePasswordResetChallenge,
  code: string,
  newPassword: string
): Promise<CloudBaseAuthSession | undefined> {
  const cleanCode = code.trim();
  try {
    if (!challenge.updateUser) {
      throw new Error("密码重置邮件已发送，请按邮件链接完成改密。");
    }
    const result = await challenge.updateUser({ nonce: cleanCode, password: newPassword });
    assertCloudBaseOk(result, "密码重置失败。", challenge.email, "reset");
    return await buildRefreshedSession(result);
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "密码重置失败。", challenge.email, "reset"));
  }
}

export async function sendCloudBasePasswordResetEmail(email: string): Promise<void> {
  try {
    await auth.sendPasswordResetEmail(email.trim());
  } catch (error) {
    throw new Error(cloudBaseErrorMessage(error, "重置邮件发送失败。"));
  }
}

export async function saveCloudBaseNickname(nickname: string): Promise<CloudBaseAuthSession> {
  const cleanName = normalizeNickname(nickname);
  if (!cleanName) throw new Error("昵称不能为空。");
  if (cleanName.length < 2 || cleanName.length > 16) throw new Error("昵称长度需要 2-16 个字符。");

  const currentUser = await getCurrentUserRequired();
  rememberNickname(currentUser as CloudBaseUser, cleanName);

  // CloudBase Auth 云端用户资料存取逻辑：只写 Auth 用户资料字段，禁止使用云数据库、云存储、云函数或任何数据表。
  const result = await updateNicknameWithFallback(cleanName).catch((error) => {
    console.warn("[CloudBase Auth] 云端昵称保存失败，已使用本地缓存兜底。", error);
    return undefined;
  });
  const refreshed = await auth.getUser().catch(() => undefined) as CloudBaseResult | undefined;
  const sessionResult = await auth.getSession().catch(() => undefined) as CloudBaseResult | undefined;
  const user = withNickname(refreshed?.data?.user ?? result?.data?.user ?? currentUser, cleanName);
  rememberNickname(user as CloudBaseUser, cleanName);
  return sessionFromCloudBaseUser(user, readToken(sessionResult));
}

export async function logoutCloudBase(): Promise<void> {
  await auth.signOut().catch(() => undefined);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().replace(/\s+/g, " ");
}

function sessionFromCloudBaseUser(user: CloudBaseUser, token: string): CloudBaseAuthSession {
  const metadata = user.user_metadata ?? user.userMetadata ?? {};
  const email = stringValue(user.email ?? user.username ?? metadata.email) || "";
  const uid = stringValue(user.id ?? user.uid ?? metadata.uid ?? email);
  const nickname = readNickname(user) || readRememberedNickname(uid, email);
  const displayName = nickname || emailPrefix(email) || uid;
  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: uid,
    uid,
    email,
    displayName,
    defaultAvatarKey: "avatar-amber",
    role: email.toLowerCase() === ADMIN_EMAIL ? "admin" : "player",
    createdAt: stringValue(user.created_at) || now,
    updatedAt: stringValue(user.updated_at) || now,
  };
  return {
    token,
    user: profile,
    needsNickname: false,
  };
}

function assertCloudBaseConfigReady(): void {
  const warning = getCloudBaseConfigWarning();
  if (warning) throw new Error(warning);
}

async function getCurrentUserRequired(): Promise<CloudBaseUser> {
  const user = await auth.getCurrentUser();
  if (!user) throw new Error("CloudBase 登录态无效，请重新登录。");
  return user as CloudBaseUser;
}

function readNickname(user: CloudBaseUser): string {
  const metadata = user.user_metadata ?? user.userMetadata ?? {};
  return normalizeNickname(
    stringValue(
      user.nickname ??
        user.nickName ??
        metadata.nickname ??
        metadata.nickName ??
        metadata.name ??
        user.displayName ??
        user.name
    )
  );
}

function withNickname(user: CloudBaseUser, nickname: string): CloudBaseUser {
  return {
    ...user,
    nickname,
    nickName: nickname,
    name: nickname,
    displayName: nickname,
  };
}

async function updateNicknameWithFallback(nickname: string): Promise<CloudBaseResult | undefined> {
  const passwordAuth = auth as unknown as CloudBasePasswordAuth;
  try {
    const result = await auth.updateUser({ nickname }) as CloudBaseResult;
    if (!result?.error) return result;
  } catch {
    // Fall through to the older profile API below.
  }

  if (typeof passwordAuth.updateUserBasicInfo === "function") {
    await passwordAuth.updateUserBasicInfo({ nickname });
    const refreshed = await auth.getUser().catch(() => undefined) as CloudBaseResult | undefined;
    if (refreshed?.data?.user) return refreshed;
  }

  if (typeof passwordAuth.update === "function") {
    await passwordAuth.update({ nickName: nickname });
    const refreshed = await auth.getUser().catch(() => undefined) as CloudBaseResult | undefined;
    return refreshed;
  }

  throw new Error("昵称云端保存失败。");
}

function rememberNickname(user: CloudBaseUser, nickname: string): void {
  const metadata = user.user_metadata ?? user.userMetadata ?? {};
  const email = stringValue(user.email ?? user.username ?? metadata.email) || "";
  const uid = stringValue(user.id ?? user.uid ?? metadata.uid ?? email);
  const cleanName = normalizeNickname(nickname);
  if (!uid && !email) return;
  try {
    if (uid) persistentStorage.setItem(`${LOCAL_NICKNAME_PREFIX}${uid}`, cleanName);
    if (email) persistentStorage.setItem(`${LOCAL_NICKNAME_PREFIX}${email.toLowerCase()}`, cleanName);
  } catch {
    // 本地缓存只是兜底，失败不影响 CloudBase Auth 昵称保存。
  }
}

function readRememberedNickname(uid: string, email: string): string {
  try {
    return normalizeNickname(
      persistentStorage.getItem(`${LOCAL_NICKNAME_PREFIX}${uid}`) ||
        persistentStorage.getItem(`${LOCAL_NICKNAME_PREFIX}${email.toLowerCase()}`) ||
        ""
    );
  } catch {
    return "";
  }
}

function emailPrefix(email: string): string {
  return email.includes("@") ? email.split("@")[0] || "" : email;
}

async function signInWithPasswordCompat(email: string, password: string): Promise<CloudBaseResult> {
  const account = email.trim();
  const passwordAuth = auth as unknown as CloudBasePasswordAuth;
  let firstError: unknown;
  if (typeof passwordAuth.signIn === "function") {
    try {
      const usernameResult = await passwordAuth.signIn({ username: account, password }) as CloudBaseResult;
      if (!usernameResult?.error) return usernameResult;
      firstError = usernameResult.error;
    } catch (error) {
      firstError = error;
    }
  }
  if (typeof passwordAuth.signInWithPassword === "function") {
    try {
      const emailResult = await passwordAuth.signInWithPassword({ email: account, password }) as CloudBaseResult;
      if (!emailResult?.error) return emailResult;
      const usernameResult = await passwordAuth.signInWithPassword({ username: account, password }) as CloudBaseResult;
      return usernameResult?.error ? emailResult : usernameResult;
    } catch (error) {
      firstError = firstError ?? error;
    }
  }
  if (typeof passwordAuth.signInWithEmailAndPassword === "function") {
    try {
      return await passwordAuth.signInWithEmailAndPassword(account, password) as CloudBaseResult;
    } catch (error) {
      firstError = firstError ?? error;
    }
  }
  if (firstError) throw firstError;
  throw new Error("当前 CloudBase SDK 不支持邮箱密码登录。");
}

async function isRegisteredEmail(email: string): Promise<boolean> {
  const passwordAuth = auth as unknown as CloudBasePasswordAuth;
  if (typeof passwordAuth.isUsernameRegistered !== "function") return false;
  try {
    return await passwordAuth.isUsernameRegistered(email);
  } catch {
    return false;
  }
}

async function signUpWithPasswordCompat(email: string, password: string): Promise<CloudBaseResult> {
  const account = email.trim();
  if (typeof auth.signUp === "function") {
    const emailResult = await auth.signUp({ email: account, password }) as CloudBaseResult;
    if (emailResult.data?.verifyOtp && !emailResult.data?.session) {
      throw new Error("当前 CloudBase SDK 进入了邮箱验证码注册流程；请确认已开启账号密码注册，或改用控制台创建账号。");
    }
    return emailResult;
  }

  const passwordAuth = auth as unknown as CloudBasePasswordAuth;
  if (typeof passwordAuth.signUpWithEmailAndPassword === "function") {
    return await passwordAuth.signUpWithEmailAndPassword(account, password) as CloudBaseResult;
  }

  const lowLevelAuth = auth as CloudBaseLowLevelAuth;
  const signUp = lowLevelAuth.oauthInstance?.authApi?.signUp;
  if (typeof signUp === "function") {
    const result = await signUp({ email: account, password });
    const errorCode = readRawErrorCode(result);
    if (errorCode) {
      return {
        data: {},
        error: {
          code: errorCode,
          message: readRawErrorMessage(result),
        },
      };
    }
    return { data: {}, error: null };
  }

  throw new Error("当前 CloudBase SDK 不支持账号密码注册。");
}

async function buildRefreshedSession(result: CloudBaseResult): Promise<CloudBaseAuthSession> {
  const sessionResult = await auth.getSession().catch(() => undefined) as CloudBaseResult | undefined;
  const userResult = await auth.getUser().catch(() => undefined) as CloudBaseResult | undefined;
  assertCloudBaseOk(sessionResult, "CloudBase 会话刷新失败。");
  assertCloudBaseOk(userResult, "CloudBase 用户信息刷新失败。");
  const user = userResult?.data?.user ?? result.data?.user ?? await getCurrentUserRequired();
  return sessionFromCloudBaseUser(user, readToken(sessionResult) || readToken(result));
}

function readToken(result?: CloudBaseResult): string {
  return result?.data?.session?.access_token ?? result?.data?.session?.accessToken ?? "";
}

function assertCloudBaseOk(result: CloudBaseResult | undefined, fallback: string, email?: string, context: CloudBaseErrorContext = "login"): void {
  if (result?.error) {
    throw new Error(cloudBaseErrorMessage(result.error, fallback, email, context));
  }
}

function cloudBaseErrorMessage(error: unknown, fallback: string, email?: string, context: CloudBaseErrorContext = "login"): string {
  if (error instanceof Error && error.message && !error.message.includes("[object Object]")) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("注册已提交")) return error.message;
    if (normalized.includes("验证码注册流程")) return error.message;
  }
  const source = error as CloudBaseRawError;
  const raw = `${readRawErrorCode(source)} ${readRawErrorMessage(source)} ${error instanceof Error ? error.message : ""}`.trim();
  const lower = raw.toLowerCase();
  const isAdmin = email?.trim().toLowerCase() === ADMIN_EMAIL;
  if (lower.includes("cannot read properties of undefined") && lower.includes("config")) {
    return "CloudBase Auth 初始化配置不完整。请按控制台 React(Vite) 接入指引填写 VITE_CLOUDBASE_ENV_ID、VITE_CLOUDBASE_REGION、VITE_CLOUDBASE_ACCESS_KEY。";
  }
  const looksLikeAccessKeyError =
    lower.includes("accesskey") ||
    lower.includes("access key") ||
    lower.includes("invalid_access_token") ||
    lower.includes("invalid access token") ||
    lower.includes("access token is required") ||
    lower.includes("publishablekey") ||
    lower.includes("setaccesskey");
  if (looksLikeAccessKeyError) {
    return "CloudBase accessKey 校验失败。请确认 Token 属于当前环境、登录页配置已保存生效，并使用本次重新打包的 EXE。";
  }
  if (looksLikeAccessKeyError) {
    return "CloudBase 匿名访问令牌不可用。请在控制台生成 accessKey，并填入 VITE_CLOUDBASE_ACCESS_KEY 后重新打包。";
  }
  if (lower.includes("go-jose") || lower.includes("cryptographic primitive")) {
    return "验证码或访问令牌校验失败。请重新发送验证码后再提交，并确认 accessKey 属于当前 CloudBase 环境。";
  }
  if (lower.includes("verification") || lower.includes("otp") || lower.includes("code")) {
    return context === "register"
      ? "邮箱验证码注册失败。请重新发送验证码，并填写邮箱收到的最新验证码。"
      : "邮箱验证码登录失败。请重新发送验证码，并填写邮箱收到的最新验证码。";
  }
  if (lower.includes("provider_not_enabled") || lower.includes("not enabled") || lower.includes("disabled")) {
    return "CloudBase 邮箱密码登录未开启或配置不完整，请在身份认证中启用账号密码登录。";
  }
  if (lower.includes("not found") || lower.includes("not_found") || lower.includes("not registered") || lower.includes("unregistered")) {
    if (context === "register" || context === "registerAutoLogin") return REGISTER_PENDING_LOGIN_MESSAGE;
    return isAdmin
      ? "管理员账号尚未在 CloudBase Auth 创建。请先在注册页注册 944358575@qq.com，或到 CloudBase 控制台创建该邮箱账号。"
      : "该邮箱未注册，请先注册。";
  }
  if (lower.includes("exist") || lower.includes("registered") || lower.includes("already")) {
    return "邮箱已注册，请直接登录。";
  }
  if (lower.includes("verify") || lower.includes("confirm")) {
    return context === "register"
      ? "当前 CloudBase 返回验证码注册流程；请确认控制台开启的是账号密码注册。"
      : "请先完成邮箱验证后再登录。";
  }
  if (lower.includes("weak") || lower.includes("format") || lower.includes("length")) {
    return "密码不符合 CloudBase 要求，请至少使用 6 位字符。";
  }
  if (lower.includes("provide either an email or phone")) {
    return "CloudBase 请求缺少邮箱字段。请重新打开新版 EXE，再用邮箱发送验证码。";
  }
  if (lower.includes("invalid_username_or_password") || lower.includes("password") || lower.includes("invalid") || lower.includes("credentials")) {
    if (context === "register") return "账号或密码格式不符合 CloudBase 要求，请确认邮箱格式和密码长度。";
    return "账号不存在、密码不正确，或该邮箱是验证码注册但尚未设置密码。请先用“验证码登录”，或点“忘记密码”设置新密码后再用密码登录。";
  }
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("timeout")) {
    return "CloudBase 网络连接失败，请检查网络或环境 ID。";
  }
  if (lower.includes("origin") || lower.includes("domain") || lower.includes("cors")) {
    return "CloudBase 当前来源不可用，请使用 localhost 运行或检查身份认证安全来源。";
  }
  return readRawErrorMessage(source) || (error instanceof Error ? error.message : fallback);
}

function readRawErrorCode(error: unknown): string {
  const source = error as CloudBaseRawError;
  const value = source?.code ?? source?.error_code ?? source?.errorCode;
  return value === undefined || value === null ? "" : String(value);
}

function readRawErrorMessage(error: unknown): string {
  const source = error as CloudBaseRawError;
  return stringValue(source?.message) || stringValue(source?.error_msg) || stringValue(source?.errorMessage);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
