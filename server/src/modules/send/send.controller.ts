import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadRequestException, Body, Controller, Get, Headers, Optional, Param, Post, Query, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { sendRequestSchema, type SendRequest } from "@gewehub/contracts";
import { z } from "zod";
import { getBearerToken } from "../delivery/delivery-utils.js";
import { GeweClientService } from "../gewe/gewe-client.service.js";
import { HtmlPagesService, type ResolveHtmlForSendResult } from "../html-pages/html-pages.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { mapSendRequestToGewe } from "./send-utils.js";

const sendRequestStatusSchema = z.enum(["success", "failed", "in_progress", "pending", "sent", "unknown"]);
const DEFAULT_TAKE = 100;
const MAX_TAKE = 200;
const LINK_PREVIEW_MAX_HTML_BYTES = 512 * 1024;
const LINK_PREVIEW_MAX_REDIRECTS = 2;
const sendRequestListSelect = {
  id: true,
  appId: true,
  accountId: true,
  conversationId: true,
  idempotencyKey: true,
  type: true,
  status: true,
  errorMessage: true,
  resultMsgId: true,
  resultNewMsgId: true,
  resultCreateTime: true,
  createdAt: true,
  updatedAt: true,
  conversation: {
    select: {
      id: true,
      peerWxid: true,
      type: true,
      name: true,
      avatarUrl: true,
      platformRemark: true
    }
  },
  app: {
    select: {
      id: true,
      name: true,
      status: true
    }
  }
} satisfies Prisma.SendRequestSelect;

@Controller()
export class SendController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService,
    @Optional() private readonly htmlPages?: HtmlPagesService
  ) {}

  @Post("/api/send")
  async send(@Headers("authorization") authorization: string | undefined, @Body() rawBody: unknown) {
    const appToken = getBearerToken(authorization);
    const app = appToken ? await this.prisma.hubApp.findUnique({ where: { token: appToken } }) : null;
    if (appToken && (!app || app.status !== "active")) {
      throw new UnauthorizedException("应用 token 无效");
    }

    const body = sendRequestSchema.parse(rawBody);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: body.conversationId },
      include: { account: true }
    });
    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey ?? body.requestId);
    if (app?.id && idempotencyKey) {
      const existing = await this.prisma.sendRequest.findFirst({
        where: {
          appId: app.id,
          conversationId: conversation.id,
          idempotencyKey
        },
        orderBy: { createdAt: "desc" }
      });
      if (existing) return sendResponse(existing);
    }
    const htmlInfo = body.type === "html" ? await this.resolveHtmlSend(body, conversation, app?.id ?? null) : undefined;
    const htmlPresentation = resolveHtmlPresentation(body, htmlInfo);
    const requestPayload = buildRequestPayload(body, idempotencyKey, htmlInfo, htmlPresentation);
    const mapped = mapSendRequestToGewe({
      appId: conversation.account.appId,
      peerWxid: conversation.peerWxid,
      type: body.type,
      text: body.text,
      mediaUrl: body.mediaUrl,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      contentBase64: body.contentBase64,
      mimeType: body.mimeType,
      thumbUrl: body.thumbUrl,
      thumbContentBase64: body.thumbContentBase64,
      thumbMimeType: body.thumbMimeType,
      thumbFileName: body.thumbFileName,
      title: htmlPresentation?.title ?? body.title,
      desc: htmlPresentation?.desc ?? body.desc,
      linkUrl: htmlInfo?.htmlPublicUrl ?? body.linkUrl,
      durationMs: body.durationMs,
      mentions: body.mentions
    });

    const sendRequest = await this.prisma.sendRequest.create({
      data: {
        appId: app?.id ?? null,
        accountId: conversation.accountId,
        conversationId: conversation.id,
        idempotencyKey: idempotencyKey ?? null,
        type: body.type,
        requestPayload: requestPayload as Prisma.InputJsonValue,
        geweRequest: mapped as unknown as Prisma.InputJsonValue,
        status: "pending"
      }
    });
    if (htmlInfo?.htmlPageId && htmlInfo.htmlHosted) {
      await this.htmlPages?.bindSendRequest(htmlInfo.htmlPageId, sendRequest.id);
    }
    await this.prisma.outboxTask.create({
      data: {
        taskType: "send",
        refId: sendRequest.id,
        payload: { sendRequestId: sendRequest.id },
        status: "pending",
        priority: 40
      }
    });
    return sendResponse(sendRequest, htmlInfo);
  }

  private async resolveHtmlSend(
    body: SendRequest,
    conversation: { id: string; accountId: string },
    appId: string | null
  ): Promise<ResolveHtmlForSendResult> {
    if (!this.htmlPages) throw new BadRequestException("HTML 页面服务未初始化");
    return this.htmlPages.resolveForSend({
      accountId: conversation.accountId,
      conversationId: conversation.id,
      appId,
      title: body.title,
      desc: body.desc,
      htmlContent: body.htmlContent,
      htmlContentBase64: body.htmlContentBase64,
      htmlFileName: body.htmlFileName,
      linkUrl: body.linkUrl
    });
  }

  @Post("/api/send/:id/revoke")
  async revoke(@Param("id") id: string) {
    const sendRequest = await this.prisma.sendRequest.findUniqueOrThrow({
      where: { id },
      include: {
        conversation: {
          include: { account: true }
        }
      }
    });
    if (sendRequest.status !== "sent") {
      throw new BadRequestException("只能撤回已发送成功的消息");
    }
    if (!sendRequest.resultMsgId || !sendRequest.resultNewMsgId || !sendRequest.resultCreateTime) {
      throw new BadRequestException("发送记录缺少撤回所需三件套");
    }

    const revokeResponse = await this.gewe.revokeMessage({
      appId: sendRequest.conversation.account.appId,
      toWxid: sendRequest.conversation.peerWxid,
      msgId: sendRequest.resultMsgId,
      newMsgId: sendRequest.resultNewMsgId,
      createTime: sendRequest.resultCreateTime
    });
    const revokedAt = new Date();
    await this.prisma.message.updateMany({
      where: { sendRequestId: sendRequest.id },
      data: {
        status: "revoked",
        revokedAt
      }
    });

    return this.prisma.sendRequest.update({
      where: { id },
      data: {
        geweResponse: mergeRevokeResponse(sendRequest.geweResponse, revokeResponse) as Prisma.InputJsonValue
      }
    });
  }

  @Post("/api/send/:id/cancel")
  async cancel(@Param("id") id: string) {
    const sendRequest = await this.prisma.sendRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true }
    });
    if (sendRequest.status === "sent") {
      throw new BadRequestException("已发送成功的消息不能取消，请使用撤回");
    }

    const message = "用户已取消后续发送重试";
    await this.prisma.outboxTask.updateMany({
      where: {
        taskType: "send",
        refId: id,
        status: { in: ["pending", "running", "failed"] }
      },
      data: {
        status: "dead",
        nextRetryAt: null,
        leaseUntil: null,
        lastError: message
      }
    });

    return this.prisma.sendRequest.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: message
      }
    });
  }

  @Get("/api/send-requests")
  async list(
    @Query("status") status: string | undefined,
    @Query("take") rawTake: string | undefined,
    @Query("skip") rawSkip: string | undefined
  ) {
    const where: Prisma.SendRequestWhereInput = {};
    if (status) where.status = mapSendRequestStatus(status);

    return this.prisma.sendRequest.findMany({
      where,
      select: sendRequestListSelect,
      orderBy: { createdAt: "desc" },
      take: parseTake(rawTake),
      skip: parseSkip(rawSkip)
    });
  }

  @Get("/api/send-requests/:id")
  async detail(@Param("id") id: string) {
    return this.prisma.sendRequest.findUniqueOrThrow({
      where: { id },
      include: { conversation: true, app: true }
    });
  }

  @Get("/api/link-preview")
  async linkPreview(@Query("url") rawUrl: string | undefined) {
    const linkUrl = parsePreviewUrl(rawUrl);
    const page = await fetchPreviewHtml(linkUrl);
    const preview = parseHtmlPreview(page.html, page.linkUrl);
    return {
      linkUrl: page.linkUrl,
      ...preview
    };
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildRequestPayload(
  body: SendRequest,
  idempotencyKey: string | undefined,
  htmlInfo: ResolveHtmlForSendResult | undefined,
  htmlPresentation: HtmlPresentation | undefined
): Record<string, unknown> {
  if (body.type !== "html") {
    return idempotencyKey ? { ...body, idempotencyKey } : body;
  }

  return compactUndefined({
    conversationId: body.conversationId,
    type: body.type,
    title: htmlPresentation?.title,
    desc: htmlPresentation?.desc,
    linkUrl: body.linkUrl,
    htmlFileName: body.htmlFileName,
    thumbUrl: body.thumbUrl,
    thumbContentBase64: body.thumbContentBase64,
    thumbMimeType: body.thumbMimeType,
    thumbFileName: body.thumbFileName,
    requestId: body.requestId,
    idempotencyKey,
    htmlPublicUrl: htmlInfo?.htmlPublicUrl,
    htmlPageId: htmlInfo?.htmlPageId,
    htmlHosted: htmlInfo?.htmlHosted
  });
}

interface HtmlPresentation {
  title: string;
  desc: string;
}

function resolveHtmlPresentation(body: SendRequest, htmlInfo: ResolveHtmlForSendResult | undefined): HtmlPresentation | undefined {
  if (body.type !== "html") return undefined;
  const title = normalizeText(body.title) ?? "HTML 页面";
  const desc = normalizeText(body.desc) ?? normalizeText(body.linkUrl) ?? htmlInfo?.htmlPublicUrl ?? "HTML 页面";
  return { title, desc };
}

function sendResponse(
  sendRequest: { id: string; status: string; messageId?: string | null; requestPayload?: Prisma.JsonValue },
  htmlInfo?: ResolveHtmlForSendResult
) {
  const payload = asRecord(sendRequest.requestPayload);
  const htmlPublicUrl = htmlInfo?.htmlPublicUrl ?? asString(payload?.htmlPublicUrl);
  const htmlPageId = htmlInfo ? htmlInfo.htmlPageId : (asString(payload?.htmlPageId) ?? null);
  const htmlHosted = htmlInfo?.htmlHosted ?? asBoolean(payload?.htmlHosted);
  return compactUndefined({
    id: sendRequest.id,
    status: sendRequest.status,
    messageId: sendRequest.messageId ?? undefined,
    htmlPublicUrl,
    htmlPageId: htmlPublicUrl ? htmlPageId : undefined,
    htmlHosted: htmlPublicUrl ? htmlHosted : undefined
  });
}

function compactUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function mapSendRequestStatus(status: string): NonNullable<Prisma.SendRequestWhereInput["status"]> {
  const parsed = sendRequestStatusSchema.parse(status);
  switch (parsed) {
    case "success":
      return "sent";
    case "in_progress":
      return "pending";
    default:
      return parsed;
  }
}

function parseTake(rawTake: string | undefined): number {
  if (!rawTake) return DEFAULT_TAKE;
  const take = Number.parseInt(rawTake, 10);
  if (!Number.isFinite(take) || take < 1) return DEFAULT_TAKE;
  return Math.min(take, MAX_TAKE);
}

function parseSkip(rawSkip: string | undefined): number {
  if (!rawSkip) return 0;
  const skip = Number.parseInt(rawSkip, 10);
  if (!Number.isFinite(skip) || skip < 0) return 0;
  return skip;
}

function mergeRevokeResponse(previous: Prisma.JsonValue, revokeResponse: unknown): Prisma.InputJsonValue {
  if (previous && typeof previous === "object" && !Array.isArray(previous)) {
    return {
      ...previous,
      revoke: revokeResponse
    } as Prisma.InputJsonValue;
  }
  return { revoke: revokeResponse } as Prisma.InputJsonValue;
}

function parsePreviewUrl(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) throw new BadRequestException("链接地址不能为空");
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException("链接地址格式不正确");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException("仅支持 http/https 链接");
  }
  if (url.username || url.password) {
    throw new BadRequestException("链接地址不能包含用户名或密码");
  }
  return url.toString();
}

async function fetchPreviewHtml(linkUrl: string, redirectsLeft = LINK_PREVIEW_MAX_REDIRECTS): Promise<{ linkUrl: string; html: string }> {
  await assertPublicPreviewUrl(linkUrl);
  const response = await fetch(linkUrl, {
    headers: {
      "User-Agent": "GeWeHub/0.1 link-preview"
    },
    redirect: "manual",
    signal: AbortSignal.timeout(8000)
  });

  if (isRedirectResponse(response)) {
    const location = response.headers.get("location");
    if (!location) throw new BadRequestException("链接解析重定向缺少 Location");
    if (redirectsLeft <= 0) throw new BadRequestException("链接解析重定向次数过多");
    const redirectedUrl = parsePreviewUrl(new URL(location, linkUrl).toString());
    return fetchPreviewHtml(redirectedUrl, redirectsLeft - 1);
  }

  if (!response.ok) {
    throw new BadRequestException(`链接解析失败: HTTP ${response.status}`);
  }
  assertHtmlPreviewResponse(response);
  return {
    linkUrl,
    html: await readLimitedPreviewHtml(response)
  };
}

async function assertPublicPreviewUrl(linkUrl: string): Promise<void> {
  const url = new URL(linkUrl);
  const hostname = normalizeUrlHostname(url.hostname);
  if (isBlockedPreviewHostname(hostname)) {
    throw new BadRequestException("不允许解析内网或本机链接");
  }
  if (isIP(hostname)) {
    if (isBlockedPreviewAddress(hostname)) throw new BadRequestException("不允许解析内网或本机链接");
    return;
  }

  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException("链接域名无法解析");
  }
  if (addresses.length === 0 || addresses.some((item) => isBlockedPreviewAddress(item.address))) {
    throw new BadRequestException("不允许解析内网或本机链接");
  }
}

function normalizeUrlHostname(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function isBlockedPreviewHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal";
}

function isBlockedPreviewAddress(address: string): boolean {
  const normalized = normalizeUrlHostname(address);
  const ipv4 = readIpv4Address(normalized);
  if (ipv4) {
    const [first = 0, second = 0] = ipv4;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19))
    );
  }
  const compact = normalized.toLowerCase();
  return (
    compact === "::" ||
    compact === "::1" ||
    compact.startsWith("fc") ||
    compact.startsWith("fd") ||
    compact.startsWith("fe80") ||
    compact.startsWith("ff")
  );
}

function readIpv4Address(address: string): number[] | undefined {
  const match = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  const value = match?.[1] ?? (isIP(address) === 4 ? address : undefined);
  if (!value) return undefined;
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : undefined;
}

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function assertHtmlPreviewResponse(response: Response): void {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    throw new BadRequestException("链接解析仅支持 HTML 页面");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > LINK_PREVIEW_MAX_HTML_BYTES) {
    throw new BadRequestException("链接页面过大");
  }
}

async function readLimitedPreviewHtml(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > LINK_PREVIEW_MAX_HTML_BYTES) throw new BadRequestException("链接页面过大");
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > LINK_PREVIEW_MAX_HTML_BYTES) {
      await reader.cancel();
      throw new BadRequestException("链接页面过大");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseHtmlPreview(html: string, baseUrl: string): { title?: string; desc?: string; thumbUrl?: string } {
  const title =
    readMetaContent(html, "property", "og:title") ??
    readMetaContent(html, "name", "twitter:title") ??
    readTitle(html);
  const desc =
    readMetaContent(html, "property", "og:description") ??
    readMetaContent(html, "name", "description") ??
    readMetaContent(html, "name", "twitter:description");
  const rawThumbUrl =
    readMetaContent(html, "property", "og:image") ??
    readMetaContent(html, "name", "twitter:image");
  const thumbUrl = rawThumbUrl ? resolvePreviewUrl(rawThumbUrl, baseUrl) : undefined;
  return compactPreview({
    title: normalizePreviewText(title),
    desc: normalizePreviewText(desc),
    thumbUrl,
  });
}

function readMetaContent(html: string, key: "name" | "property", value: string): string | undefined {
  const tagPattern = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0] ?? "";
    if (readHtmlAttribute(tag, key)?.toLowerCase() !== value.toLowerCase()) continue;
    const content = readHtmlAttribute(tag, "content");
    if (content) return decodeHtmlEntities(content);
  }
  return undefined;
}

function readTitle(html: string): string | undefined {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/<[^>]+>/g, "");
  return title ? decodeHtmlEntities(title) : undefined;
}

function readHtmlAttribute(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4];
}

function resolvePreviewUrl(value: string, baseUrl: string): string | undefined {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizePreviewText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function compactPreview(input: { title?: string; desc?: string; thumbUrl?: string }) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value))) as {
    title?: string;
    desc?: string;
    thumbUrl?: string;
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
