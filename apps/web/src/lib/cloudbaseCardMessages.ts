import { cloudbaseApp, loadCloudBaseSession } from "./cloudbaseAuth.js";

const MESSAGE_COLLECTION = "card-messages";
const IMAGE_MAX_SIDE = 1280;
const IMAGE_QUALITY = 0.82;

export const CARD_MESSAGE_FUNCTIONS = {
  inbox: "getUserCardMsg",
  image: "downloadCardImg",
} as const;

export interface CardMessageRecord {
  id: string;
  senderOpenid: string;
  receiverOpenid: string;
  msgText: string;
  cardFileID: string;
  sendTime?: string | Date;
  isRead?: boolean;
}

export interface SendCardMessageInput {
  senderOpenid: string;
  receiverOpenid: string;
  msgText: string;
  imageFile: File;
}

type UploadCapableCloudBase = typeof cloudbaseApp & {
  uploadFile(params: {
    cloudPath: string;
    filePath: File | Blob;
    method?: "put" | "post";
    headers?: Record<string, string>;
  }): Promise<{ fileID: string; requestId?: string }>;
  database(): {
    collection(name: string): {
      add(data: Record<string, unknown>): Promise<unknown>;
    };
  };
  callFunction(options: { name: string; data?: Record<string, unknown> }): Promise<{ result: unknown }>;
};

const cloudbaseClient = cloudbaseApp as UploadCapableCloudBase;

export async function sendCardMessage(input: SendCardMessageInput): Promise<string> {
  const senderOpenid = input.senderOpenid.trim();
  const receiverOpenid = input.receiverOpenid.trim();
  const msgText = input.msgText.trim();
  if (!senderOpenid) throw new Error("当前用户标识无效，请重新登录。");
  if (!receiverOpenid) throw new Error("请输入接收方 openid。");
  if (!msgText) throw new Error("请输入要发送的文字。");
  if (!input.imageFile) throw new Error("请选择一张图片。");
  if (!input.imageFile.type.startsWith("image/")) throw new Error("只能发送图片文件。");
  await ensureCardMessageLogin();

  const compressed = await compressImage(input.imageFile);
  const cloudPath = buildCloudPath(senderOpenid, input.imageFile.name);
  const upload = await cloudbaseClient.uploadFile({
    cloudPath,
    filePath: compressed,
    method: "put",
    headers: {
      "content-type": compressed.type || "image/jpeg",
    },
  });
  if (!upload.fileID) throw new Error("图片上传失败，未获取 fileID。");

  // CloudBase 数据库写入逻辑：仅写入已配置的 card-messages 集合，不创建新表。
  await cloudbaseClient.database().collection(MESSAGE_COLLECTION).add({
    senderOpenid,
    receiverOpenid,
    msgText,
    cardFileID: upload.fileID,
    sendTime: new Date(),
    isRead: false,
  });

  return upload.fileID;
}

export async function loadUnreadCardMessages(): Promise<CardMessageRecord[]> {
  await ensureCardMessageLogin();
  const response = await callCardFunction(CARD_MESSAGE_FUNCTIONS.inbox);
  if (!isMessageResult(response.result)) {
    throw new Error("getUserCardMsg 返回结构无法识别，请检查云函数是否返回未读卡牌数组。");
  }
  return normalizeMessages(response.result);
}

export async function downloadCardImage(fileID: string): Promise<string> {
  if (!fileID.trim()) throw new Error("图片 fileID 为空。");
  await ensureCardMessageLogin();
  const response = await callCardFunction(CARD_MESSAGE_FUNCTIONS.image, { fileID });
  const base64 = extractBase64(response.result);
  if (!base64) throw new Error("云函数未返回图片内容。");
  return base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
}

async function ensureCardMessageLogin(): Promise<void> {
  const session = await loadCloudBaseSession().catch(() => undefined);
  if (!session?.user?.uid) {
    throw new Error("CloudBase 登录态无效，请重新登录后再拉取卡牌。");
  }
}

async function callCardFunction(name: string, data?: Record<string, unknown>): Promise<{ result: unknown }> {
  try {
    return await cloudbaseClient.callFunction({ name, data });
  } catch (error) {
    throw new Error(normalizeCardMessageError(error, name));
  }
}

function normalizeCardMessageError(error: unknown, functionName: string): string {
  const source = error as { code?: string; message?: string };
  const raw = `${source?.code ?? ""} ${source?.message ?? ""} ${error instanceof Error ? error.message : ""}`.trim();
  const lower = raw.toLowerCase();
  if (lower.includes("login") || lower.includes("auth") || lower.includes("token") || lower.includes("unauthorized")) {
    return "CloudBase 登录态无效或无权限，请重新登录后重试。";
  }
  if (lower.includes("function") && (lower.includes("not") || lower.includes("exist") || lower.includes("found"))) {
    return `云函数 ${functionName} 不存在或未发布，请检查 CloudBase 云函数配置。`;
  }
  if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("denied")) {
    return `云函数 ${functionName} 权限不足，请检查函数调用权限。`;
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("failed to fetch")) {
    return `云函数 ${functionName} 网络连接失败，请检查网络后重试。`;
  }
  return raw ? `${functionName} 调用失败：${raw}` : `${functionName} 调用失败。`;
}

async function compressImage(file: File): Promise<File> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片压缩失败，无法创建画布。");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("图片压缩失败。"))), "image/jpeg", IMAGE_QUALITY);
    });
    return new File([blob], `${stripExtension(file.name) || "card"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败。"));
    image.src = src;
  });
}

function buildCloudPath(senderOpenid: string, fileName: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseName = stripExtension(fileName).replace(/[^\w.-]+/g, "-").slice(0, 40) || "card";
  return `card-messages/${senderOpenid}/${suffix}-${baseName}.jpg`;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeMessages(result: unknown): CardMessageRecord[] {
  const source = result as {
    data?: unknown;
    messages?: unknown;
    list?: unknown;
  };
  const raw = Array.isArray(result)
    ? result
    : Array.isArray(source?.data)
      ? source.data
      : Array.isArray(source?.messages)
        ? source.messages
        : Array.isArray(source?.list)
          ? source.list
          : [];

  return raw.map((item, index) => {
    const record = item as Partial<CardMessageRecord> & { _id?: string };
    return {
      id: String(record.id ?? record._id ?? `${record.cardFileID ?? "card"}-${index}`),
      senderOpenid: String(record.senderOpenid ?? ""),
      receiverOpenid: String(record.receiverOpenid ?? ""),
      msgText: String(record.msgText ?? ""),
      cardFileID: String(record.cardFileID ?? ""),
      sendTime: record.sendTime,
      isRead: Boolean(record.isRead),
    };
  });
}

function isMessageResult(result: unknown): boolean {
  if (Array.isArray(result)) return true;
  const source = result as {
    data?: unknown;
    messages?: unknown;
    list?: unknown;
  };
  return Array.isArray(source?.data) || Array.isArray(source?.messages) || Array.isArray(source?.list);
}

function extractBase64(result: unknown): string {
  if (typeof result === "string") return result.trim();
  const source = result as {
    base64?: unknown;
    data?: unknown;
    imageBase64?: unknown;
  };
  if (typeof source?.base64 === "string") return source.base64.trim();
  if (typeof source?.imageBase64 === "string") return source.imageBase64.trim();
  if (typeof source?.data === "string") return source.data.trim();
  return "";
}
