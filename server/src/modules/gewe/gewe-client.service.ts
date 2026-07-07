import { Injectable } from "@nestjs/common";
import { loadEnv } from "../../config/env.js";

type MediaKind = "image" | "voice" | "video" | "file" | "emoji";

export class GeweRequestTimeoutError extends Error {
  constructor(
    public readonly path: string,
    public readonly timeoutMs: number
  ) {
    super(`GeWe 请求超时: ${path} (${timeoutMs}ms)`);
    this.name = "GeweRequestTimeoutError";
  }
}

export type DownloadMediaParams =
  | {
      appId: string;
      kind: MediaKind;
      rawContent: string;
      msgId: string;
      method?: "gewe_xml" | "emoji_md5";
    }
  | {
      appId: string;
      kind: "image" | "video" | "file";
      rawContent: string;
      msgId: string;
      method: "forwarded_cdn";
      aesKey: string;
      fileId: string;
      type: string;
      totalSize: string;
      suffix: string;
    };

@Injectable()
export class GeweClientService {
  private readonly env = loadEnv();

  async setCallback(callbackUrl: string) {
    return this.post("/gewe/v2/api/login/setCallback", { token: this.env.GEWE_TOKEN, callbackUrl });
  }

  async checkOnline(appId?: string) {
    return this.post("/gewe/v2/api/login/checkOnline", appId ? { appId } : {});
  }

  async fetchContactsList(appId: string) {
    return this.post("/gewe/v2/api/contacts/fetchContactsList", { appId });
  }

  async fetchContactsListCache(appId: string) {
    return this.post("/gewe/v2/api/contacts/fetchContactsListCache", { appId });
  }

  async getBriefInfo(appId: string, wxids: string[]) {
    return this.post("/gewe/v2/api/contacts/getBriefInfo", { appId, wxids });
  }

  async getDetailInfo(appId: string, wxids: string[]) {
    return this.post("/gewe/v2/api/contacts/getDetailInfo", { appId, wxids });
  }

  async getChatroomMemberList(appId: string, chatroomId: string) {
    return this.post("/gewe/v2/api/group/getChatroomMemberList", { appId, chatroomId });
  }

  async sendText(params: { appId: string; toWxid: string; content: string; ats?: string[] }) {
    return this.post("/gewe/v2/api/message/postText", params);
  }

  async sendByMappedRequest(request: { path: string; body: unknown }) {
    if (!request.path.startsWith("/gewe/v2/api/message/")) {
      throw new Error(`不允许的 GeWe 发送路径: ${request.path}`);
    }
    const result = await this.post(request.path, request.body, resolveMessageSendTimeoutMs(request.path, this.env.GEWE_SEND_TIMEOUT_MS));
    const businessError = getBusinessError(result);
    if (businessError) throw new Error(`GeWe 发送失败: ${businessError}`);
    return result;
  }

  async revokeMessage(params: {
    appId: string;
    toWxid: string;
    msgId: string;
    newMsgId: string;
    createTime: string;
  }) {
    return this.post("/gewe/v2/api/message/revokeMsg", params, this.env.GEWE_SEND_TIMEOUT_MS);
  }

  async downloadMedia(params: DownloadMediaParams): Promise<{ fileUrl: string }> {
    const result = await this.post(resolveDownloadPath(params), resolveDownloadBody(params), 30_000);
    const businessError = getDownloadBusinessError(result);
    if (businessError && params.kind === "image" && params.method !== "forwarded_cdn") {
      const fallback = buildImageCdnFallbackParams(params);
      if (fallback) return this.downloadMedia(fallback);
    }
    if (businessError) throw new Error(`GeWe ${params.kind} 下载失败: ${businessError}`);
    const fileUrl = extractDownloadUrl(result);
    if (!fileUrl && params.kind === "image" && params.method !== "forwarded_cdn") {
      const fallback = buildImageCdnFallbackParams(params);
      if (fallback) return this.downloadMedia(fallback);
    }
    if (!fileUrl) throw new Error(`GeWe ${params.kind} 下载响应缺少 fileUrl`);
    return { fileUrl };
  }

  private async post(path: string, body: unknown, timeoutMs = this.env.GEWE_REQUEST_TIMEOUT_MS) {
    let response: Response;
    try {
      response = await fetch(`${this.env.GEWE_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GEWE-TOKEN": this.env.GEWE_TOKEN
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (isAbortTimeoutError(error)) throw new GeweRequestTimeoutError(path, timeoutMs);
      throw error;
    }
    if (!response.ok) {
      throw new Error(`GeWe HTTP ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  }
}

function resolveMessageSendTimeoutMs(path: string, timeoutMs: number): number {
  if (path === "/gewe/v2/api/message/postFile") return timeoutMs;
  if (path === "/gewe/v2/api/message/postImage") return timeoutMs;
  if (path === "/gewe/v2/api/message/postVideo") return timeoutMs;
  if (path === "/gewe/v2/api/message/postVoice") return timeoutMs;
  return Math.max(timeoutMs, 30_000);
}

function isAbortTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError" || error.message.toLowerCase().includes("aborted due to timeout");
  }
  return false;
}

function resolveDownloadPath(params: DownloadMediaParams): string {
  if (params.method === "forwarded_cdn") return "/gewe/v2/api/message/downloadCdn";
  if (params.kind === "image") return "/gewe/v2/api/message/downloadImage";
  if (params.kind === "voice") return "/gewe/v2/api/message/downloadVoice";
  if (params.kind === "video") return "/gewe/v2/api/message/downloadVideo";
  if (params.kind === "file") return "/gewe/v2/api/message/downloadFile";
  return "/gewe/v2/api/message/downloadEmojiMd5";
}

function resolveDownloadBody(params: DownloadMediaParams) {
  if (params.method === "forwarded_cdn") {
    return {
      appId: params.appId,
      aesKey: params.aesKey,
      fileId: params.fileId,
      type: params.type,
      totalSize: params.totalSize,
      suffix: params.suffix,
    };
  }
  if (params.kind === "image") {
    return { appId: params.appId, xml: params.rawContent, type: 2 };
  }
  if (params.kind === "voice") {
    return { appId: params.appId, xml: params.rawContent, msgId: Number(params.msgId) };
  }
  if (params.kind === "video" || params.kind === "file") {
    return { appId: params.appId, xml: params.rawContent };
  }
  return { appId: params.appId, emojiMd5: extractEmojiMd5(params.rawContent) };
}

function extractDownloadUrl(result: unknown): string | undefined {
  const record = result as { data?: { fileUrl?: unknown; url?: unknown } };
  const url = record.data?.fileUrl ?? record.data?.url;
  return typeof url === "string" && url ? url : undefined;
}

function buildImageCdnFallbackParams(
  params: Extract<DownloadMediaParams, { kind: MediaKind }>,
): DownloadMediaParams | undefined {
  const img = params.rawContent.match(/<img\b([^>]*)>/i)?.[1];
  if (!img) return undefined;
  const aesKey = xmlAttribute(img, "aeskey");
  const fileId =
    xmlAttribute(img, "cdnmidimgurl") ??
    xmlAttribute(img, "cdnbigimgurl") ??
    xmlAttribute(img, "cdnthumburl");
  const totalSize =
    xmlAttribute(img, "length") ??
    xmlAttribute(img, "hdlength") ??
    xmlAttribute(img, "cdnthumblength");
  if (!aesKey || !fileId || !totalSize) return undefined;
  return {
    appId: params.appId,
    kind: "image",
    msgId: params.msgId,
    rawContent: params.rawContent,
    method: "forwarded_cdn",
    aesKey,
    fileId,
    type: "1",
    totalSize,
    suffix: "jpg",
  };
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  return match?.[2] || undefined;
}

function getDownloadBusinessError(result: unknown): string | undefined {
  return getBusinessError(result);
}

function getBusinessError(result: unknown): string | undefined {
  const record = result as { ret?: unknown; msg?: unknown; data?: { msg?: unknown; detail?: unknown } };
  const ret = Number(record.ret);
  if (!Number.isFinite(ret) || ret === 200 || ret === 0) return undefined;
  return extractBusinessErrorMessage(record) ?? `ret=${record.ret}`;
}

function extractBusinessErrorMessage(record: {
  msg?: unknown;
  data?: {
    msg?: unknown;
    detail?: unknown;
  };
}): string | undefined {
  const dataMsg = asString(record.data?.msg);
  if (dataMsg) return dataMsg;
  const detail = asString(record.data?.detail);
  const detailMsg = detail ? parseDetailBusinessMessage(detail) : undefined;
  if (detailMsg) return detailMsg;
  return asString(record.msg);
}

function parseDetailBusinessMessage(detail: string): string | undefined {
  try {
    const parsed = JSON.parse(detail) as { msg_err?: unknown; msg?: unknown };
    return asString(parsed.msg_err ?? parsed.msg);
  } catch {
    return detail;
  }
}

function extractEmojiMd5(rawContent: string): string {
  const match =
    rawContent.match(/md5="([^"]+)"/) ??
    rawContent.match(/<md5>([^<]+)<\/md5>/) ??
    rawContent.trim().match(/^[^:\s]+:\d+:0:([a-fA-F0-9]{32})::0$/);
  if (!match?.[1]) throw new Error("emoji 下载缺少 md5");
  return match[1];
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}
