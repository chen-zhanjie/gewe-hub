import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import { Injectable, Optional } from "@nestjs/common";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { MessageEnvelope, MessageNode } from "@gewehub/contracts";
import type { Prisma } from "@prisma/client";
import { loadEnv } from "../../config/env.js";
import { AdminEventsService } from "../admin-events/admin-events.service.js";
import { DeliveryService } from "../delivery/delivery.service.js";
import {
  GeweClientService,
  type DownloadMediaParams,
} from "../gewe/gewe-client.service.js";
import { normalizeWebhookPayload } from "../gewe/webhook-utils.js";
import {
  renderMessageMarkdown,
  renderMessageSummary,
} from "../messages/message-rendering.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AudioTranscodeService } from "./audio-transcode.service.js";
import { signFileUrl, signOutboundFileUrl } from "./media-url.js";

type MediaKind = "image" | "voice" | "video" | "file" | "emoji";
const execFileAsync = promisify(execFile);

const mediaTypes = new Set<string>([
  "image",
  "voice",
  "video",
  "file",
  "emoji",
]);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  cdataPropName: "__cdata",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});
const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  suppressEmptyNode: false,
});

export interface EnqueueMessageMediaInput {
  appId: string;
  message: {
    id: string;
    accountId: string;
    payload: MessageEnvelope | Prisma.JsonValue;
  };
  rawContent: string;
  rawMsgId: string;
}

export interface PrepareOutboundVoiceInput {
  accountId: string;
  conversationId: string;
  contentBase64?: string;
  mediaUrl?: string;
  fileUrl?: string;
  mimeType?: string;
  fileName?: string;
  durationMs?: number;
}

export interface PrepareOutboundFileInput {
  accountId: string;
  conversationId: string;
  kind: Exclude<MediaKind, "voice" | "emoji">;
  purpose?: "media" | "thumbnail";
  contentBase64?: string;
  mediaUrl?: string;
  fileUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export interface PreparedOutboundVoice {
  original: PreparedOutboundFile;
  silk: PreparedOutboundFile;
}

export interface PreparedOutboundFile {
  id: string;
  path: string;
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
}

export interface PrepareOutboundVideoThumbnailInput {
  accountId: string;
  videoPath: string;
  fileName?: string;
}

interface OutboundFileRecord {
  path: string;
  mimeType: string;
  fileName: string;
  expiresAt: number;
}

const outboundFiles = new Map<string, OutboundFileRecord>();

@Injectable()
export class MediaService {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gewe: GeweClientService,
    @Optional() private readonly delivery?: DeliveryService,
    @Optional() private readonly audioTranscode?: AudioTranscodeService,
    @Optional() private readonly adminEvents?: AdminEventsService,
  ) {}

  async enqueueMessageMedia(input: EnqueueMessageMediaInput): Promise<number> {
    const payload = input.message.payload as MessageEnvelope;
    const mediaNodes = collectMediaNodes(payload);
    for (const item of mediaNodes) {
      const sourcePayload = resolveSourcePayload(input, item);
      const asset = await this.prisma.mediaAsset.upsert({
        where: {
          messageId_nodePath: {
            messageId: input.message.id,
            nodePath: item.nodePath,
          },
        },
        create: {
          accountId: input.message.accountId,
          messageId: input.message.id,
          nodePath: item.nodePath,
          kind: item.node.type,
          status: "pending",
          sourcePayload,
          fileName: item.node.media?.fileName,
          size: item.node.media?.size,
        },
        update: {
          kind: item.node.type,
          status: "pending",
          sourcePayload,
          fileName: item.node.media?.fileName,
          size: item.node.media?.size,
          errorMessage: null,
        },
      });

      await this.prisma.outboxTask.create({
        data: {
          taskType: "download_media",
          refId: asset.id,
          payload: { mediaAssetId: asset.id },
          maxRetry: 3,
          priority: 50,
        },
      });
    }
    return mediaNodes.length;
  }

  async downloadMediaAsset(assetId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { message: true },
    });
    if (!asset) throw new Error(`媒体资产不存在: ${assetId}`);

    const source = parseSourcePayload(asset.sourcePayload);
    const download = await this.gewe.downloadMedia(source);
    const fileResponse = await fetch(download.fileUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!fileResponse.ok) {
      throw new Error(`媒体文件下载失败: HTTP ${fileResponse.status}`);
    }

    const downloadedBytes = Buffer.from(await fileResponse.arrayBuffer());
    const downloadedMimeType = normalizeMimeType(
      fileResponse.headers.get("content-type"),
      download.fileUrl,
      asset.kind,
    );
    const normalizedMedia = await this.normalizeDownloadedMedia({
      kind: asset.kind,
      bytes: downloadedBytes,
      mimeType: downloadedMimeType,
      fileName: asset.fileName ?? undefined,
    });
    const localPath = await this.writeLocalFile({
      accountId: asset.accountId,
      fileUrl: download.fileUrl,
      mimeType: normalizedMedia.mimeType,
      fileName: asset.fileName ?? undefined,
      bytes: normalizedMedia.bytes,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const publicUrl = signFileUrl({
      assetId,
      baseUrl: this.env.PUBLIC_BASE_URL,
      expiresAt,
      secret: this.env.SESSION_SECRET,
    });

    const nextPayload = updateNodeMedia(
      asset.message.payload as unknown as MessageEnvelope,
      asset.nodePath,
      {
        status: "ready",
        url: publicUrl,
        mimeType: normalizedMedia.mimeType,
        size: normalizedMedia.bytes.byteLength,
      },
    );

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: "ready",
        localPath,
        publicUrl,
        mimeType: normalizedMedia.mimeType,
        size: normalizedMedia.bytes.byteLength,
        errorMessage: null,
      },
    });
    await this.prisma.message.update({
      where: { id: asset.messageId },
      data: {
        payload: nextPayload as unknown as Prisma.InputJsonValue,
        renderedText: nextPayload.renderedText.slice(0, 500),
      },
    });
    this.publishMessageUpdated(asset.message);
    await this.createDeliveryForMessage(asset.messageId);
  }

  private async normalizeDownloadedMedia(input: {
    kind: string;
    bytes: Buffer;
    mimeType: string;
    fileName?: string;
  }): Promise<{ bytes: Buffer; mimeType: string }> {
    if (input.kind !== "voice") {
      return { bytes: input.bytes, mimeType: input.mimeType };
    }
    const transcode = this.audioTranscode ?? new AudioTranscodeService();
    return {
      bytes: await transcode.transcodeVoiceToMp3(input.bytes, {
        sourceMimeType: input.mimeType,
        sourceFileName: input.fileName,
      }),
      mimeType: "audio/mpeg",
    };
  }

  async markMediaAssetFailedAndDeliver(
    assetId: string,
    errorMessage: string,
  ): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { message: true },
    });
    if (!asset) return;

    const nextPayload = updateNodeMedia(
      asset.message.payload as unknown as MessageEnvelope,
      asset.nodePath,
      {
        status: "failed",
        url: null,
      },
    );
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: "failed",
        errorMessage,
        retryCount: { increment: 1 },
      },
    });
    await this.prisma.message.update({
      where: { id: asset.messageId },
      data: {
        payload: nextPayload as unknown as Prisma.InputJsonValue,
        renderedText: nextPayload.renderedText.slice(0, 500),
      },
    });
    this.publishMessageUpdated(asset.message);
    await this.createDeliveryForMessage(asset.messageId);
  }

  private publishMessageUpdated(message: {
    conversationId?: string | null;
    messageId?: string | null;
  }): void {
    if (!this.adminEvents || !message.conversationId || !message.messageId) return;
    this.adminEvents.publishMessageChanged({
      eventType: "message.updated",
      conversationId: message.conversationId,
      messageId: message.messageId,
    });
  }

  async retryDownload(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: {
        message: {
          include: {
            webhookEvent: true,
          },
        },
      },
    });
    if (!asset) throw new Error(`媒体资产不存在: ${assetId}`);

    const refreshedSourcePayload = refreshSourcePayloadForRetry(asset);
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: "pending",
        errorMessage: null,
        ...(refreshedSourcePayload
          ? { sourcePayload: refreshedSourcePayload }
          : {}),
      },
    });
    return this.prisma.outboxTask.create({
      data: {
        taskType: "download_media",
        refId: assetId,
        payload: { mediaAssetId: assetId, manualRetry: true },
        maxRetry: 3,
        priority: 30,
      },
    });
  }

  async prepareOutboundVoice(input: PrepareOutboundVoiceInput): Promise<PreparedOutboundVoice> {
    const source = await this.loadOutboundVoiceSource(input);
    const original = await this.writeOutboundFile({
      accountId: input.accountId,
      bytes: source.bytes,
      mimeType: source.mimeType,
      fileName: source.fileName,
      durationMs: input.durationMs,
    });
    const silkBytes = isSilkAudio(source.mimeType, source.fileName)
      ? source.bytes
      : await (this.audioTranscode ?? new AudioTranscodeService()).transcodeVoiceToSilk(source.bytes, {
          sourceMimeType: source.mimeType,
          sourceFileName: source.fileName,
        });
    const silk = await this.writeOutboundFile({
      accountId: input.accountId,
      bytes: silkBytes,
      mimeType: "audio/silk",
      fileName: `${stripExtension(source.fileName) || "voice"}.silk`,
      durationMs: input.durationMs,
    });
    return { original, silk };
  }

  async prepareOutboundFile(input: PrepareOutboundFileInput): Promise<PreparedOutboundFile> {
    const source = await this.loadOutboundFileSource(input);
    const outbound = await normalizeOutboundFileSource(input.kind, source, input.purpose ?? "media");
    return this.writeOutboundFile({
      accountId: input.accountId,
      bytes: outbound.bytes,
      mimeType: outbound.mimeType,
      fileName: outbound.fileName,
    });
  }

  async prepareOutboundVideoThumbnail(input: PrepareOutboundVideoThumbnailInput): Promise<PreparedOutboundFile> {
    const fileName = input.fileName ?? basename(input.videoPath);
    const source = await normalizeOutboundVideoThumbnailSource({
      path: input.videoPath,
      fileName,
    });
    return this.writeOutboundFile({
      accountId: input.accountId,
      bytes: source.bytes,
      mimeType: source.mimeType,
      fileName: source.fileName,
    });
  }

  async getOutboundFile(fileId: string): Promise<(OutboundFileRecord & { size: number }) | null> {
    const record =
      outboundFiles.get(fileId) ??
      (await this.readOutboundFileRecord(fileId)) ??
      (await this.findOutboundFileRecord(fileId));
    if (!record) return null;
    if (record.expiresAt < Math.floor(Date.now() / 1000)) {
      outboundFiles.delete(fileId);
      return null;
    }
    const info = await stat(record.path).catch(() => null);
    if (!info?.isFile()) return null;
    return { ...record, size: info.size };
  }

  private async loadOutboundVoiceSource(input: PrepareOutboundVoiceInput): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    if (input.contentBase64) {
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.byteLength === 0) throw new Error("语音文件为空");
      return {
        bytes,
        mimeType: input.mimeType ?? normalizeMimeType(null, input.fileName ?? "", "voice"),
        fileName: input.fileName ?? defaultVoiceFileName(input.mimeType),
      };
    }

    const url = input.fileUrl ?? input.mediaUrl;
    if (!url) throw new Error("语音发送缺少音频内容");
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`语音文件下载失败: HTTP ${response.status}`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: input.mimeType ?? normalizeMimeType(response.headers.get("content-type"), url, "voice"),
      fileName: input.fileName ?? fileNameFromUrl(url) ?? defaultVoiceFileName(response.headers.get("content-type")),
    };
  }

  private async loadOutboundFileSource(input: PrepareOutboundFileInput): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    if (input.contentBase64) {
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.byteLength === 0) throw new Error("媒体文件为空");
      const fileName = input.fileName ?? defaultOutboundFileName(input.kind, input.mimeType);
      return {
        bytes,
        mimeType: input.mimeType ?? normalizeMimeType(null, fileName, input.kind),
        fileName,
      };
    }

    const url = input.fileUrl ?? input.mediaUrl;
    if (!url) throw new Error("媒体发送缺少文件内容");
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`媒体文件下载失败: HTTP ${response.status}`);
    const fileName = input.fileName ?? fileNameFromUrl(url) ?? defaultOutboundFileName(input.kind, response.headers.get("content-type"));
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: input.mimeType ?? normalizeMimeType(response.headers.get("content-type"), url, input.kind),
      fileName,
    };
  }

  private async writeOutboundFile(input: {
    accountId: string;
    bytes: Buffer;
    mimeType: string;
    fileName: string;
    durationMs?: number;
  }): Promise<PreparedOutboundFile> {
    const id = `out_${randomUUID()}`;
    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const directory = join(this.env.FILE_STORAGE_DIR, "outbound", safePathSegment(input.accountId), yyyymmdd);
    await mkdir(directory, { recursive: true });
    const extension = resolveExtension(input.fileName, input.fileName, input.mimeType);
    const fileName = ensureExtension(safeFileName(input.fileName), extension);
    const path = join(directory, `${id}${extension}`);
    await writeFile(path, input.bytes);
    const info = await stat(path);
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    outboundFiles.set(id, {
      path,
      mimeType: input.mimeType,
      fileName,
      expiresAt,
    });
    await this.writeOutboundFileRecord(id, {
      path,
      mimeType: input.mimeType,
      fileName,
      expiresAt,
    });
    return {
      id,
      path,
      url: signOutboundFileUrl({
        assetId: id,
        baseUrl: this.env.PUBLIC_BASE_URL,
        expiresAt,
        secret: this.env.SESSION_SECRET,
      }),
      mimeType: input.mimeType,
      fileName,
      size: info.size,
      durationMs: input.durationMs,
    };
  }

  private async writeOutboundFileRecord(id: string, record: OutboundFileRecord): Promise<void> {
    const manifestPath = outboundFileManifestPath(record.path, id);
    await writeFile(manifestPath, JSON.stringify(record), "utf8");
  }

  private async readOutboundFileRecord(id: string): Promise<OutboundFileRecord | null> {
    const root = join(this.env.FILE_STORAGE_DIR, "outbound");
    const manifestPath = await findFile(root, `${id}.json`);
    if (!manifestPath) return null;
    try {
      const record = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<OutboundFileRecord>;
      if (!record.path || !record.mimeType || !record.fileName || !record.expiresAt) return null;
      return {
        path: record.path,
        mimeType: record.mimeType,
        fileName: record.fileName,
        expiresAt: record.expiresAt,
      };
    } catch {
      return null;
    }
  }

  private async findOutboundFileRecord(id: string): Promise<OutboundFileRecord | null> {
    const root = join(this.env.FILE_STORAGE_DIR, "outbound");
    const filePath = await findFileByStem(root, id);
    if (!filePath) return null;
    const mimeType = guessMimeType(filePath);
    return {
      path: filePath,
      mimeType,
      fileName: basename(filePath),
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
  }

  private async writeLocalFile(input: {
    accountId: string;
    fileUrl: string;
    mimeType: string;
    fileName?: string;
    bytes: Buffer;
  }): Promise<string> {
    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const directory = join(
      this.env.FILE_STORAGE_DIR,
      safePathSegment(input.accountId),
      yyyymmdd,
    );
    await mkdir(directory, { recursive: true });
    const extension = resolveExtension(
      input.fileName,
      input.fileUrl,
      input.mimeType,
    );
    const localPath = join(directory, `${randomUUID()}${extension}`);
    await writeFile(localPath, input.bytes);
    return localPath;
  }

  private async createDeliveryForMessage(messageId: string): Promise<void> {
    if (!this.delivery) return;
    const pendingMediaCount = await this.prisma.mediaAsset.count({
      where: {
        messageId,
        status: "pending",
      },
    });
    if (pendingMediaCount > 0) return;

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { app: true },
        },
      },
    });
    if (message) await this.delivery.createForMessage(message);
  }
}

function refreshSourcePayloadForRetry(asset: {
  kind: string;
  nodePath: string;
  sourcePayload: Prisma.JsonValue;
  message: {
    id: string;
    accountId: string;
    platformMsgId: string | null;
    platformNewMsgId: string | null;
    payload: Prisma.JsonValue;
    webhookEvent?: {
      rawPayload: Prisma.JsonValue;
    } | null;
  };
}): DownloadMediaParams | undefined {
  if (!mediaTypes.has(asset.kind)) return undefined;
  const rawPayload = asRecord(asset.message.webhookEvent?.rawPayload);
  if (!rawPayload) return undefined;

  const normalizedPayload = normalizeWebhookPayload(rawPayload);
  const existingSource = asRecord(asset.sourcePayload);
  const rawContent =
    asString(normalizedPayload.content) ?? asString(existingSource?.rawContent);
  if (rawContent === undefined) return undefined;

  return resolveSourcePayload(
    {
      appId:
        asString(normalizedPayload.appid ?? normalizedPayload.appId) ??
        asString(existingSource?.appId) ??
        "unknown",
      message: {
        id: asset.message.id,
        accountId: asset.message.accountId,
        payload: asset.message.payload,
      },
      rawContent,
      rawMsgId:
        asString(normalizedPayload.msgId ?? normalizedPayload.newMsgId) ??
        asset.message.platformMsgId ??
        asset.message.platformNewMsgId ??
        asString(existingSource?.msgId) ??
        asset.message.id,
    },
    {
      nodePath: asset.nodePath,
      node: {
        type: asset.kind as MediaKind,
        text: "",
        media: { status: "pending", url: null },
      },
    },
  );
}

function isMediaNode(
  node: MessageNode,
): node is MessageNode & {
  type: MediaKind;
  media: NonNullable<MessageNode["media"]>;
} {
  return mediaTypes.has(node.type) && Boolean(node.media);
}

function collectMediaNodes(payload: MessageEnvelope): Array<{
  nodePath: string;
  node: MessageNode & {
    type: MediaKind;
    media: NonNullable<MessageNode["media"]>;
  };
}> {
  const result: Array<{
    nodePath: string;
    node: MessageNode & {
      type: MediaKind;
      media: NonNullable<MessageNode["media"]>;
    };
  }> = [];
  visitNode(payload.content, "content", result);
  if (payload.quote) visitNode(payload.quote, "quote", result);
  return result;
}

function visitNode(
  node: MessageNode,
  nodePath: string,
  result: Array<{
    nodePath: string;
    node: MessageNode & {
      type: MediaKind;
      media: NonNullable<MessageNode["media"]>;
    };
  }>,
) {
  if (isMediaNode(node) && node.media.status === "pending") {
    result.push({
      nodePath: `${nodePath}.media`,
      node,
    });
  }
  node.items?.forEach((item, index) =>
    visitNode(item, `${nodePath}.items[${index}]`, result),
  );
  if (node.quote) visitNode(node.quote, `${nodePath}.quote`, result);
}

function resolveSourcePayload(
  input: EnqueueMessageMediaInput,
  item: {
    nodePath: string;
    node: MessageNode & {
      type: MediaKind;
      media: NonNullable<MessageNode["media"]>;
    };
  },
): DownloadMediaParams {
  const rawContent =
    resolveNodeRawContent(input.rawContent, item.nodePath, item.node.type) ??
    input.rawContent;
  const recordItem = resolveRecordItemForNodePath(input.rawContent, item.nodePath);
  const forwardedCdnPayload = recordItem
    ? buildForwardedCdnPayload(input, item.node.type, recordItem, rawContent)
    : undefined;
  if (forwardedCdnPayload) return forwardedCdnPayload;

  return {
    appId: input.appId,
    kind: item.node.type,
    msgId: input.rawMsgId,
    rawContent,
  };
}

function resolveNodeRawContent(
  rawContent: string,
  nodePath: string,
  kind: MediaKind,
): string | undefined {
  return resolveRawContentBySegments(
    { rawContent },
    parseNodePath(nodePath),
    kind,
  );
}

type RawCursor = {
  rawContent?: string;
  recordItem?: Record<string, unknown>;
};

function resolveRawContentBySegments(
  cursor: RawCursor,
  segments: string[],
  kind: MediaKind,
): string | undefined {
  const [segment, ...rest] = segments;
  if (!segment) return undefined;

  if (segment === "content") {
    return resolveRawContentBySegments(cursor, rest, kind);
  }

  if (segment === "quote") {
    const quoteRawContent = cursor.recordItem
      ? extractRecordItemQuoteRawContent(cursor.recordItem)
      : extractTopLevelQuoteRawContent(cursor.rawContent ?? "");
    if (!quoteRawContent) return undefined;
    return resolveRawContentBySegments(
      { rawContent: quoteRawContent },
      ["content", ...rest],
      kind,
    );
  }

  if (segment.startsWith("items[")) {
    const index = Number(segment.match(/^items\[(\d+)\]$/)?.[1]);
    if (!Number.isInteger(index)) return undefined;
    const item = cursor.recordItem
      ? extractNestedRecordDataItem(cursor.recordItem, index)
      : extractRecordDataItem(cursor.rawContent ?? "", index);
    if (!item) return undefined;
    return resolveRawContentBySegments({ recordItem: item }, rest, kind);
  }

  if (segment === "media") {
    if (cursor.recordItem)
      return buildRecordItemMediaXml(cursor.recordItem, kind);
    return cursor.rawContent;
  }

  return undefined;
}

function parseNodePath(nodePath: string): string[] {
  return nodePath.split(".");
}

function resolveRecordItemForNodePath(
  rawContent: string,
  nodePath: string,
): Record<string, unknown> | undefined {
  return resolveRecordItemBySegments(
    { rawContent },
    parseNodePath(nodePath).filter((segment) => segment !== "media"),
  );
}

function resolveRecordItemBySegments(
  cursor: RawCursor,
  segments: string[],
): Record<string, unknown> | undefined {
  const [segment, ...rest] = segments;
  if (!segment) return cursor.recordItem;

  if (segment === "content") {
    return resolveRecordItemBySegments(cursor, rest);
  }

  if (segment === "quote") return undefined;

  if (segment.startsWith("items[")) {
    const index = Number(segment.match(/^items\[(\d+)\]$/)?.[1]);
    if (!Number.isInteger(index)) return undefined;
    const item = cursor.recordItem
      ? extractNestedRecordDataItem(cursor.recordItem, index)
      : extractRecordDataItem(cursor.rawContent ?? "", index);
    if (!item) return undefined;
    return resolveRecordItemBySegments({ recordItem: item }, rest);
  }

  return undefined;
}

function extractTopLevelQuoteRawContent(
  rawContent: string,
): string | undefined {
  const refermsg =
    parseAppMsg(rawContent)?.refermsg ??
    safeParseXml(rawContent)?.msg?.extcommoninfo?.refermsg;
  return nonEmptyString(decodeEntities(firstXmlString(refermsg?.content) ?? ""));
}

function extractRecordItemQuoteRawContent(
  item: Record<string, unknown>,
): string | undefined {
  const refermsgitem = asRecord(item.refermsgitem);
  return nonEmptyString(
    decodeEntities(firstXmlString(refermsgitem?.content) ?? ""),
  );
}

function extractRecordDataItem(
  rawContent: string,
  index: number,
): Record<string, unknown> | undefined {
  const recorditem = firstString(parseAppMsg(rawContent)?.recorditem);
  if (!recorditem) return undefined;

  const recordXml = decodeEntities(recorditem).replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;",
  );
  return getRecordInfoDataItem(safeParseXml(recordXml)?.recordinfo, index);
}

function extractNestedRecordDataItem(
  item: Record<string, unknown>,
  index: number,
): Record<string, unknown> | undefined {
  const recordxml = item.recordxml;
  const parsedRecordXml = asRecord(recordxml);
  if (parsedRecordXml?.recordinfo)
    return getRecordInfoDataItem(parsedRecordXml.recordinfo, index);

  const rawRecordXml = firstString(recordxml);
  if (!rawRecordXml) return undefined;
  const recordXml = decodeEntities(rawRecordXml).replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;",
  );
  return getRecordInfoDataItem(safeParseXml(recordXml)?.recordinfo, index);
}

function getRecordInfoDataItem(
  recordinfo: unknown,
  index: number,
): Record<string, unknown> | undefined {
  const data = asRecord(asRecord(recordinfo)?.datalist)?.dataitem;
  const items = Array.isArray(data) ? data : data ? [data] : [];
  return asRecord(items[index]);
}

function buildRecordItemMediaXml(
  item: Record<string, unknown>,
  kind: MediaKind,
): string | undefined {
  if (kind === "image") return buildImageXml(item);
  if (kind === "video") return buildVideoXml(item);
  if (kind === "emoji") return buildEmojiXml(item);
  return undefined;
}

function buildImageXml(item: Record<string, unknown>): string | undefined {
  const attributes = xmlAttributes({
    cdnmidimgurl: firstString(item.cdndataurl ?? item.cdnmidimgurl),
    aeskey: firstString(item.cdndatakey ?? item.aeskey),
    cdnthumburl: firstString(item.cdnthumburl),
    cdnthumbaeskey: firstString(item.cdnthumbkey ?? item.cdnthumbaeskey),
    length: firstString(item.datasize ?? item.length),
    cdnthumbwidth: firstString(item.thumbwidth ?? item.cdnthumbwidth),
    cdnthumbheight: firstString(item.thumbheight ?? item.cdnthumbheight),
    md5: firstString(item.fullmd5 ?? item.thumbfullmd5 ?? item.md5),
  });
  if (!attributes) return undefined;
  return `<msg><img ${attributes} /></msg>`;
}

function buildVideoXml(item: Record<string, unknown>): string | undefined {
  const attributes = xmlAttributes({
    cdnvideourl: firstString(item.cdnvideourl ?? item.cdndataurl),
    aeskey: firstString(item.cdndatakey ?? item.aeskey),
    cdnthumburl: firstString(item.cdnthumburl),
    cdnthumbaeskey: firstString(item.cdnthumbkey ?? item.cdnthumbaeskey),
    length: firstString(item.datasize ?? item.length),
    playlength: firstString(item.duration ?? item.playlength),
    cdnthumbwidth: firstString(item.thumbwidth ?? item.cdnthumbwidth),
    cdnthumbheight: firstString(item.thumbheight ?? item.cdnthumbheight),
    md5: firstString(item.fullmd5 ?? item.thumbfullmd5 ?? item.md5),
  });
  if (!attributes) return undefined;
  return `<msg><videomsg ${attributes} /></msg>`;
}

function buildEmojiXml(item: Record<string, unknown>): string | undefined {
  const emoji = asRecord(item.emojiitem);
  const md5 = firstString(
    item.fullmd5 ?? item.thumbfullmd5 ?? item.md5 ?? emoji?.md5,
  );
  if (!md5) return undefined;
  return `<msg><emoji md5="${escapeXmlAttribute(md5)}" /></msg>`;
}

function buildForwardedCdnPayload(
  input: EnqueueMessageMediaInput,
  kind: MediaKind,
  item: Record<string, unknown>,
  rawContent: string,
): DownloadMediaParams | undefined {
  if (kind !== "image" && kind !== "video" && kind !== "file") {
    return undefined;
  }
  const aesKey = firstString(item.cdndatakey ?? item.aeskey);
  const fileId = firstString(item.cdndataurl ?? item.cdnmidimgurl);
  const totalSize = firstString(item.datasize ?? item.length);
  if (!aesKey || !fileId || !totalSize) return undefined;
  return {
    appId: input.appId,
    kind,
    msgId: input.rawMsgId,
    method: "forwarded_cdn",
    rawContent,
    aesKey,
    fileId,
    type: forwardedCdnType(kind),
    totalSize,
    suffix: forwardedCdnSuffix(kind, item),
  };
}

function forwardedCdnType(kind: "image" | "video" | "file"): string {
  if (kind === "image") return "1";
  if (kind === "video") return "4";
  return "5";
}

function forwardedCdnSuffix(
  kind: "image" | "video" | "file",
  item: Record<string, unknown>,
): string {
  const datafmt = firstString(item.datafmt);
  if (datafmt) return datafmt.replace(/^\./, "");
  if (kind === "image") return "jpg";
  if (kind === "video") return "mp4";
  const fileName = firstString(item.datatitle);
  const extension = fileName ? extname(fileName).replace(/^\./, "") : "";
  return extension;
}

function parseSourcePayload(value: Prisma.JsonValue): DownloadMediaParams {
  const record = value as Record<string, unknown>;
  const appId = asString(record.appId);
  const kind = asString(record.kind);
  const msgId = asString(record.msgId);
  const rawContent = asString(record.rawContent);
  if (
    !appId ||
    !kind ||
    !mediaTypes.has(kind) ||
    !msgId ||
    rawContent === undefined
  ) {
    throw new Error("媒体资产 sourcePayload 不完整");
  }
  if (record.method === "forwarded_cdn") {
    const aesKey = asString(record.aesKey);
    const fileId = asString(record.fileId);
    const type = asString(record.type);
    const totalSize = asString(record.totalSize);
    const suffix = asString(record.suffix) ?? "";
    if (
      (kind !== "image" && kind !== "video" && kind !== "file") ||
      !aesKey ||
      !fileId ||
      !type ||
      !totalSize
    ) {
      throw new Error("媒体资产 forwarded_cdn sourcePayload 不完整");
    }
    return {
      appId,
      kind,
      msgId,
      rawContent,
      method: "forwarded_cdn",
      aesKey,
      fileId,
      type,
      totalSize,
      suffix,
    };
  }
  return {
    appId,
    kind: kind as MediaKind,
    msgId,
    rawContent,
  };
}

function updateNodeMedia(
  payload: MessageEnvelope,
  nodePath: string,
  patch: NonNullable<MessageNode["media"]>,
): MessageEnvelope {
  const content = updateNodeMediaAtPath(
    payload.content,
    "content",
    nodePath,
    patch,
  );
  const quote = payload.quote
    ? updateNodeMediaAtPath(payload.quote, "quote", nodePath, patch)
    : payload.quote;
  return {
    ...payload,
    content,
    quote,
    renderedText: renderMessageSummary(content, quote),
    renderedMd: renderMessageMarkdown({
      ...payload,
      content,
      quote,
      renderedText: renderMessageSummary(content, quote),
    }),
  };
}

function updateNodeMediaAtPath(
  node: MessageNode,
  currentPath: string,
  targetPath: string,
  patch: NonNullable<MessageNode["media"]>,
): MessageNode {
  if (`${currentPath}.media` === targetPath) {
    const media = {
      ...(node.media ?? {}),
      ...patch,
    };
    return {
      ...node,
      text:
        patch.status === "failed"
          ? failedMediaText(node)
          : restoredMediaText(node),
      media,
    };
  }

  let next = node;
  if (node.items) {
    const items = node.items.map((item, index) =>
      updateNodeMediaAtPath(
        item,
        `${currentPath}.items[${index}]`,
        targetPath,
        patch,
      ),
    );
    next = { ...next, items };
  }
  if (node.quote) {
    next = {
      ...next,
      quote: updateNodeMediaAtPath(
        node.quote,
        `${currentPath}.quote`,
        targetPath,
        patch,
      ),
    };
  }
  return next;
}

function failedMediaText(node: MessageNode): string {
  const fileName = node.media?.fileName;
  if (node.type === "file") return fileName ? `[文件: ${fileName}] 下载失败` : "[文件] 下载失败";
  if (node.type === "image") return "[图片] 下载失败";
  if (node.type === "voice") return "[语音] 下载失败";
  if (node.type === "video") return "[视频] 下载失败";
  if (node.type === "emoji") return "[动画表情] 下载失败";
  return `${node.text || "[媒体]"} 下载失败`;
}

function restoredMediaText(node: MessageNode): string {
  const fileName = node.media?.fileName;
  if (node.type === "file") return fileName ? `[文件] ${fileName}` : "[文件]";
  if (node.type === "image") return "[图片]";
  if (node.type === "voice") return "[语音]";
  if (node.type === "video") return "[视频]";
  if (node.type === "emoji") return "[动画表情]";
  return node.text;
}

async function normalizeOutboundFileSource(
  kind: "image" | "file" | "video",
  source: {
    bytes: Buffer;
    mimeType: string;
    fileName: string;
  },
  purpose: "media" | "thumbnail",
): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
  if (kind !== "image") return source;
  if (purpose === "thumbnail") {
    return normalizeOutboundThumbnailSource(source);
  }
  const mimeType = source.mimeType.toLowerCase();
  if (mimeType.includes("gif") || source.fileName.toLowerCase().endsWith(".gif")) {
    return source;
  }

  const usePng = mimeType.includes("png") || source.fileName.toLowerCase().endsWith(".png");
  const directory = await mkdtemp(join(tmpdir(), "gewehub-outbound-image-"));
  const inputPath = join(directory, safeFileName(source.fileName));
  const outputPath = join(directory, usePng ? "image.png" : "image.jpg");
  try {
    await writeFile(inputPath, source.bytes);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-frames:v",
      "1",
      ...(usePng
        ? [outputPath]
        : ["-vf", "format=yuv420p", "-q:v", "3", outputPath]),
    ]);
    return {
      bytes: await readFile(outputPath),
      mimeType: usePng ? "image/png" : "image/jpeg",
      fileName: ensureExtension(stripExtension(source.fileName) || "image", usePng ? ".png" : ".jpg"),
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function normalizeOutboundThumbnailSource(source: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
  const directory = await mkdtemp(join(tmpdir(), "gewehub-outbound-thumb-"));
  const inputPath = join(directory, safeFileName(source.fileName));
  const outputStem = stripExtension(source.fileName) || "thumbnail";
  try {
    await writeFile(inputPath, source.bytes);
    let fallback: Buffer | undefined;
    for (const size of [320, 240, 160, 96]) {
      for (const quality of [5, 8, 12, 16, 20, 24, 28, 31]) {
        const outputPath = join(directory, `thumbnail-${size}-${quality}.jpg`);
        await execFileAsync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inputPath,
          "-map_metadata",
          "-1",
          "-frames:v",
          "1",
          "-vf",
          `scale=${size}:${size}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
          "-q:v",
          String(quality),
          outputPath,
        ]);
        const bytes = await readFile(outputPath);
        fallback = bytes;
        if (bytes.byteLength <= 51_200) {
          return {
            bytes,
            mimeType: "image/jpeg",
            fileName: ensureExtension(outputStem, ".jpg"),
          };
        }
      }
    }
    if (fallback) {
      return {
        bytes: fallback,
        mimeType: "image/jpeg",
        fileName: ensureExtension(outputStem, ".jpg"),
      };
    }
    throw new Error("缩略图压缩失败");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function normalizeOutboundVideoThumbnailSource(source: {
  path: string;
  fileName: string;
}): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
  const directory = await mkdtemp(join(tmpdir(), "gewehub-outbound-video-thumb-"));
  const outputStem = stripExtension(source.fileName) || "thumbnail";
  try {
    let fallback: Buffer | undefined;
    for (const size of [320, 240, 160, 96]) {
      for (const quality of [5, 8, 12, 16, 20, 24, 28, 31]) {
        const outputPath = join(directory, `thumbnail-${size}-${quality}.jpg`);
        await execFileAsync("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          "0",
          "-i",
          source.path,
          "-map_metadata",
          "-1",
          "-frames:v",
          "1",
          "-vf",
          `scale=${size}:${size}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
          "-q:v",
          String(quality),
          outputPath,
        ]);
        const bytes = await readFile(outputPath);
        fallback = bytes;
        if (bytes.byteLength <= 51_200) {
          return {
            bytes,
            mimeType: "image/jpeg",
            fileName: ensureExtension(outputStem, ".jpg"),
          };
        }
      }
    }
    if (fallback) {
      return {
        bytes: fallback,
        mimeType: "image/jpeg",
        fileName: ensureExtension(outputStem, ".jpg"),
      };
    }
    throw new Error("视频缩略图生成失败");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function outboundFileManifestPath(filePath: string, id: string): string {
  return join(dirname(filePath), `${id}.json`);
}

async function findFile(root: string, fileName: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return path;
    if (entry.isDirectory()) {
      const found = await findFile(path, fileName);
      if (found) return found;
    }
  }
  return null;
}

async function findFileByStem(root: string, stem: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.startsWith(`${stem}.`) && !entry.name.endsWith(".json")) {
      return path;
    }
    if (entry.isDirectory()) {
      const found = await findFileByStem(path, stem);
      if (found) return found;
    }
  }
  return null;
}

function resolveExtension(
  fileName: string | undefined,
  fileUrl: string,
  mimeType: string,
): string {
  if (mimeType.includes("silk")) return ".silk";
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("wav")) return ".wav";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("mp4")) return ".mp4";
  const fromName = fileName ? extname(fileName) : "";
  if (fromName) return fromName;
  const pathname = safeUrlPathname(fileUrl);
  const fromUrl = pathname ? extname(pathname) : "";
  if (fromUrl) return fromUrl;
  if (mimeType.includes("jpeg")) return ".jpg";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("gif")) return ".gif";
  return ".bin";
}

function normalizeMimeType(
  value: string | null,
  fileUrl: string,
  kind: MediaKind,
): string {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  if (
    normalized &&
    normalized !== "application/octet-stream" &&
    normalized !== "application/octst-stream"
  ) {
    return normalized;
  }
  const guessed = guessMimeType(fileUrl);
  if (guessed !== "application/octet-stream") return guessed;
  if (kind === "image") return "image/jpeg";
  if (kind === "voice") return "audio/silk";
  if (kind === "video") return "video/mp4";
  if (kind === "emoji") return "image/gif";
  return "application/octet-stream";
}

function guessMimeType(fileUrl: string): string {
  const pathname = safeUrlPathname(fileUrl).toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg"))
    return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".silk")) return "audio/silk";
  if (pathname.endsWith(".webm")) return "audio/webm";
  if (pathname.endsWith(".wav")) return "audio/wav";
  if (pathname.endsWith(".mp3")) return "audio/mpeg";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function safeUrlPathname(fileUrl: string): string {
  try {
    return new URL(fileUrl).pathname;
  } catch {
    return "";
  }
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function safeFileName(value: string): string {
  const normalized = value.split(/[\\/]/).pop()?.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_") ?? "";
  return normalized || "voice";
}

function ensureExtension(fileName: string, extension: string): string {
  return extname(fileName) ? fileName : `${fileName}${extension}`;
}

function stripExtension(fileName: string): string {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function fileNameFromUrl(fileUrl: string): string | undefined {
  const pathname = safeUrlPathname(fileUrl);
  const name = pathname.split("/").filter(Boolean).at(-1);
  return name ? decodeURIComponent(name) : undefined;
}

function defaultVoiceFileName(mimeType: string | null | undefined): string {
  if (mimeType?.includes("silk")) return "voice.silk";
  if (mimeType?.includes("webm")) return "voice.webm";
  if (mimeType?.includes("wav")) return "voice.wav";
  if (mimeType?.includes("mpeg")) return "voice.mp3";
  return "voice.audio";
}

function defaultOutboundFileName(kind: Exclude<MediaKind, "voice" | "emoji">, mimeType: string | null | undefined): string {
  if (kind === "image") {
    if (mimeType?.includes("png")) return "image.png";
    if (mimeType?.includes("gif")) return "image.gif";
    return "image.jpg";
  }
  if (kind === "video") return "video.mp4";
  return "file.bin";
}

function isSilkAudio(mimeType: string, fileName: string): boolean {
  return mimeType.toLowerCase().includes("silk") || fileName.toLowerCase().endsWith(".silk");
}

function parseAppMsg(
  rawContent: string | undefined,
): Record<string, any> | undefined {
  if (!rawContent) return undefined;
  return safeParseXml(rawContent)?.msg?.appmsg;
}

function safeParseXml(rawXml: string): any | undefined {
  try {
    return xmlParser.parse(rawXml);
  } catch {
    try {
      return xmlParser.parse(
        rawXml.replace(
          /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
          "&amp;",
        ),
      );
    } catch {
      return undefined;
    }
  }
}

function firstString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === "object" &&
    "__cdata" in (value as Record<string, unknown>)
  ) {
    return firstString((value as Record<string, unknown>).__cdata);
  }
  if (
    typeof value === "object" &&
    "string" in (value as Record<string, unknown>)
  ) {
    return firstString((value as Record<string, unknown>).string);
  }
  return String(value);
}

function firstXmlString(value: unknown): string | undefined {
  const text = firstString(value);
  if (text && text !== "[object Object]") return text;
  const record = asRecord(value);
  if (!record) return text;
  return xmlBuilder.build(record);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function nonEmptyString(value: string): string | undefined {
  return value ? value : undefined;
}

function xmlAttributes(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}="${escapeXmlAttribute(value)}"`)
    .join(" ");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}
