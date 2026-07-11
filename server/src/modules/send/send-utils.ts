import type { MessageEnvelope, MessageNode, SendRequest } from "@gewehub/contracts";
import {
  renderMessageMarkdown,
  renderMessageSummary,
} from "../messages/message-rendering.js";

export interface SendMappingInput {
  appId: string;
  peerWxid: string;
  type: "text" | "image" | "file" | "voice" | "video" | "link" | "html";
  text?: string;
  mediaUrl?: string;
  fileUrl?: string;
  fileName?: string;
  contentBase64?: string;
  mimeType?: string;
  thumbUrl?: string;
  thumbContentBase64?: string;
  thumbMimeType?: string;
  thumbFileName?: string;
  title?: string;
  desc?: string;
  linkUrl?: string;
  durationMs?: number;
  mentions?: string[];
  quote?: QuotedSendContext;
}

export function mapSendRequestToGewe(input: SendMappingInput) {
  if (input.type === "text") {
    if (input.quote) {
      return {
        path: "/gewe/v2/api/message/postAppMsg",
        body: compactRecord({
          appId: input.appId,
          toWxid: input.peerWxid,
          appmsg: buildQuoteAppMsg(input.text ?? "", input.quote, input.peerWxid),
          ats: formatTextMentions(input.mentions)
        })
      };
    }
    return {
      path: "/gewe/v2/api/message/postText",
      body: compactRecord({
        appId: input.appId,
        toWxid: input.peerWxid,
        content: input.text ?? "",
        ats: formatTextMentions(input.mentions)
      })
    };
  }
  const source = buildMediaSource(input);
  if (input.type === "image") {
    return {
      path: "/gewe/v2/api/message/postImage",
      body: source
        ? {
            appId: input.appId,
            toWxid: input.peerWxid,
            source
          }
        : {
            appId: input.appId,
            toWxid: input.peerWxid,
            imgUrl: input.mediaUrl
          }
    };
  }
  if (input.type === "voice") {
    return {
      path: "/gewe/v2/api/message/postVoice",
      body: {
        appId: input.appId,
        toWxid: input.peerWxid,
        voiceDuration: input.durationMs ?? 1,
        source: compactRecord({
          contentBase64: input.contentBase64,
          mediaUrl: input.mediaUrl,
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          fileName: input.fileName,
        })
      }
    };
  }
  if (input.type === "video") {
    const thumbSource = buildThumbnailSource(input);
    return {
      path: "/gewe/v2/api/message/postVideo",
      body: source
        ? compactRecord({
            appId: input.appId,
            toWxid: input.peerWxid,
            thumbnailUrl: input.thumbUrl,
            thumbSource,
            videoDuration: durationMsToSeconds(input.durationMs),
            source
          })
        : compactRecord({
            appId: input.appId,
            toWxid: input.peerWxid,
            videoUrl: input.mediaUrl ?? input.fileUrl,
            thumbnailUrl: input.thumbUrl,
            thumbSource,
            videoDuration: durationMsToSeconds(input.durationMs)
          })
    };
  }
  if (input.type === "link" || input.type === "html") {
    return {
      path: "/gewe/v2/api/message/postLink",
      body: compactRecord({
        appId: input.appId,
        toWxid: input.peerWxid,
        title: input.title,
        desc: input.desc,
        linkUrl: input.linkUrl,
        thumbUrl: input.thumbUrl,
        thumbSource: buildThumbnailSource(input)
      })
    };
  }
  return {
    path: "/gewe/v2/api/message/postFile",
    body: source
      ? {
          appId: input.appId,
          toWxid: input.peerWxid,
          source
        }
      : {
          appId: input.appId,
          toWxid: input.peerWxid,
          fileUrl: input.fileUrl ?? input.mediaUrl,
          fileName: input.fileName
        }
  };
}

function durationMsToSeconds(durationMs: number | undefined): number {
  if (!durationMs) return 1;
  return Math.max(1, Math.round(durationMs / 1000));
}

function formatTextMentions(mentions: string[] | undefined): string | undefined {
  const ats = mentions?.map((mention) => mention.trim()).filter(Boolean).join(",");
  return ats || undefined;
}


export function buildLocalContentFromSendRequest(input: SendRequest, linkUrl?: string): MessageNode {
  switch (input.type) {
    case "text":
      return { type: "text", text: input.text ?? "" };
    case "image":
      return {
        type: "image",
        text: "[图片]",
        media: { status: "pending", url: input.mediaUrl ?? input.fileUrl, fileName: input.fileName, mimeType: input.mimeType }
      };
    case "voice":
      return {
        type: "voice",
        text: "[语音]",
        media: { status: "pending", url: input.mediaUrl ?? input.fileUrl, fileName: input.fileName, mimeType: input.mimeType, durationMs: input.durationMs }
      };
    case "video":
      return {
        type: "video",
        text: "[视频]",
        media: { status: "pending", url: input.mediaUrl ?? input.fileUrl, fileName: input.fileName, mimeType: input.mimeType, durationMs: input.durationMs, thumbnailUrl: input.thumbUrl }
      };
    case "file":
      return {
        type: "file",
        text: input.fileName ? `[文件] ${input.fileName}` : "[文件]",
        media: { status: "pending", url: input.fileUrl ?? input.mediaUrl, fileName: input.fileName, mimeType: input.mimeType }
      };
    case "link":
      return {
        type: "link",
        text: input.title ? `[链接] ${input.title}` : "[链接]",
        link: { title: input.title, desc: input.desc, url: input.linkUrl ?? "", thumbnailUrl: input.thumbUrl }
      };
    case "html":
      return {
        type: "html",
        text: input.title ? `[HTML] ${input.title}` : "[HTML]",
        link: { title: input.title, desc: input.desc, url: linkUrl ?? input.linkUrl ?? "", thumbnailUrl: input.thumbUrl }
      };
  }
}

export interface LocalHubSendInput {
  accountWxid: string;
  conversationId: string;
  conversationWxid: string;
  senderWxid: string;
  text: string;
  messageId: string;
  createTime: string;
  platformMsgId?: string;
  platformNewMsgId?: string;
  platformCreateTime?: string;
  content?: MessageNode;
  mentions?: MessageEnvelope["mentions"];
  quote?: MessageNode | null;
  isSent?: boolean;
  outboundMetadata?: Record<string, unknown>;
}

export function buildLocalHubSendMessage(input: LocalHubSendInput) {
  const sentAt = new Date(normalizeGeweCreateTimeMs(input.createTime)).toISOString();
  const content = input.content ?? {
    type: "text" as const,
    text: input.text
  };
  const renderedText = renderMessageSummary(content, input.quote);
  const payload: MessageEnvelope = {
    schemaVersion: 1,
    eventType: "message.created",
    messageId: input.messageId,
    status: "normal",
    isSelf: true,
    isAtMe: false,
    account: {
      wxid: input.accountWxid
    },
    conversation: {
      id: input.conversationId,
      type: input.conversationWxid.endsWith("@chatroom") ? "group" : "private",
      wxid: input.conversationWxid
    },
    sender: {
      wxid: input.senderWxid,
      isOwner: false
    },
    mentions: input.mentions ?? [],
    content,
    quote: input.quote ?? null,
    renderedText,
    sentAt,
    metadata: input.outboundMetadata
      ? { outbound: input.outboundMetadata }
      : undefined
  };
  payload.renderedMd = renderMessageMarkdown(payload);

  return {
    source: "hub_send" as const,
    messageId: payload.messageId,
    platformMsgId: input.platformMsgId ?? null,
    platformNewMsgId: input.platformNewMsgId ?? null,
    platformCreateTime: input.platformCreateTime ?? null,
    dedupeKey: `hub_send:${payload.messageId}`,
    type: content.type,
    status: "normal" as const,
    senderWxid: input.senderWxid,
    isSelf: true,
    isAtMe: false,
    isSent: input.isSent ?? true,
    sentAt: new Date(sentAt),
    payload,
    renderedText: payload.renderedText,
    payloadVersion: 1
  };
}

export interface QuotedSendContext {
  messageId: string;
  platformNewMsgId: string;
  senderWxid?: string | null;
  senderName?: string | null;
  sentAt?: string | null;
  content: MessageNode;
  rawContent?: string | null;
}

function buildQuoteAppMsg(text: string, quote: QuotedSendContext, conversationWxid: string): string {
  const referType = quoteReferType(quote.content, quote.rawContent);
  const platformNewMsgId = quote.platformNewMsgId;
  const displayName = quote.senderName || quote.senderWxid || "";
  const referContent = quote.rawContent || fallbackReferContent(quote.content);
  const createTime = quote.sentAt ? Math.floor(new Date(quote.sentAt).getTime() / 1000) : undefined;
  return [
    '<appmsg appid="" sdkver="0">',
    `  <title>${escapeXml(text)}</title>`,
    "  <des />",
    "  <action />",
    "  <type>57</type>",
    "  <showtype>0</showtype>",
    "  <soundtype>0</soundtype>",
    "  <mediatagname />",
    "  <messageext />",
    "  <messageaction />",
    "  <content />",
    "  <contentattr>0</contentattr>",
    "  <url />",
    "  <lowurl />",
    "  <dataurl />",
    "  <lowdataurl />",
    "  <appattach>",
    "    <totallen>0</totallen>",
    "    <attachid />",
    "    <emoticonmd5 />",
    "    <fileext />",
    "  </appattach>",
    "  <extinfo />",
    "  <sourceusername />",
    "  <sourcedisplayname />",
    "  <thumburl />",
    "  <md5 />",
    "  <statextstr />",
    "  <refermsg>",
    `    <type>${escapeXml(referType)}</type>`,
    `    <svrid>${escapeXml(platformNewMsgId)}</svrid>`,
    `    <fromusr>${escapeXml(conversationWxid)}</fromusr>`,
    quote.senderWxid ? `    <chatusr>${escapeXml(quote.senderWxid)}</chatusr>` : undefined,
    `    <displayname>${escapeXml(displayName)}</displayname>`,
    createTime ? `    <createtime>${createTime}</createtime>` : undefined,
    `    <content>${escapeXml(referContent)}</content>`,
    "  </refermsg>",
    "</appmsg>"
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function quoteReferType(content: MessageNode, rawContent?: string | null): string {
  if (rawContent && /<appmsg[\s>]/.test(rawContent)) return "49";
  switch (content.type) {
    case "text":
      return "1";
    case "image":
      return "3";
    case "voice":
      return "34";
    case "card":
      return "42";
    case "video":
      return "43";
    case "emoji":
      return "47";
    case "location":
      return "48";
    case "file":
    case "link":
    case "html":
    case "mini_program":
    case "chat_record":
    case "transfer":
    case "red_packet":
      return "49";
    default:
      return "1";
  }
}

function fallbackReferContent(content: MessageNode): string {
  const appType = fallbackAppMsgType(content);
  if (!appType) return content.text || "[消息]";
  return `<msg><appmsg><title>${escapeXml(content.text || "[消息]")}</title><type>${appType}</type></appmsg></msg>`;
}

function fallbackAppMsgType(content: MessageNode): string | undefined {
  switch (content.type) {
    case "file":
      return "6";
    case "link":
    case "html":
      return "5";
    case "mini_program":
      return "33";
    case "chat_record":
      return "19";
    case "transfer":
      return "2000";
    case "red_packet":
      return "2001";
    default:
      return undefined;
  }
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeGeweCreateTimeMs(createTime: string): number {
  const timestamp = Number(createTime);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Date.now();
  if (timestamp < 10_000_000_000) return timestamp * 1000;
  return timestamp;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""));
}

function buildMediaSource(input: SendMappingInput): Record<string, unknown> | undefined {
  if (!input.contentBase64) return undefined;
  return compactRecord({
    contentBase64: input.contentBase64,
    mediaUrl: input.mediaUrl,
    fileUrl: input.fileUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
}

function buildThumbnailSource(input: SendMappingInput): Record<string, unknown> | undefined {
  if (!input.thumbContentBase64) return undefined;
  return compactRecord({
    contentBase64: input.thumbContentBase64,
    mimeType: input.thumbMimeType,
    fileName: input.thumbFileName,
  });
}
