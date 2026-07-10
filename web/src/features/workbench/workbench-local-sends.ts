import type { MessageNode } from "@gewehub/contracts";
import type { AccountSummary, LocalSendPayload, MessageItem } from "@/lib/workspace-data";

export type LocalSendType = "text" | "image" | "file" | "voice" | "video" | "link" | "html";

export interface LocalSend {
  id: string;
  conversationId: string;
  type: LocalSendType;
  text: string;
  mentions?: string[];
  replyToMessageId?: string;
  quotePreview?: MessageNode;
  label?: string;
  fileName?: string;
  mimeType?: string;
  thumbUrl?: string;
  durationMs?: number;
  status: "pending" | "failed";
  errorMessage?: string;
  messageId?: string | null;
  sendRequestId?: string | null;
  sendPayload?: LocalSendPayload;
  createdAtIso: string;
}

export type LocalTextSend = LocalSend;

export function mergeMessagesById(messages: MessageItem[]): MessageItem[] {
  const seenIds = new Set<string>();
  const seenMessageIds = new Set<string>();
  const merged: MessageItem[] = [];
  for (const message of messages) {
    if (seenIds.has(message.id) || seenMessageIds.has(message.messageId)) continue;
    seenIds.add(message.id);
    seenMessageIds.add(message.messageId);
    merged.push(message);
  }
  return merged;
}

export function buildVisibleMessages(
  serverMessages: MessageItem[],
  localSends: LocalSend[],
  conversationId: string | null,
  account?: AccountSummary,
): MessageItem[] {
  const serverMessageIds = new Set(serverMessages.map((message) => message.messageId).filter(Boolean));
  const serverSendRequestIds = new Set(serverMessages.map((message) => message.sendRequestId).filter(Boolean));
  const localMessages = localSends
    .filter((send) => send.conversationId === conversationId)
    .filter((send) => !send.messageId || !serverMessageIds.has(send.messageId))
    .filter((send) => !send.sendRequestId || !serverSendRequestIds.has(send.sendRequestId))
    .map((send) => mapLocalSendToMessageItem(send, account));

  return [...serverMessages, ...localMessages].sort(compareMessagesBySentAt);
}

export function mapLocalSendToMessageItem(send: LocalSend, account?: AccountSummary): MessageItem {
  const senderName = account?.name ?? "我";
  const wxid = account?.wxid ?? "self";
  const label = send.label ?? send.text;
  const standardJson = {
    local: true,
    type: send.type,
    text: send.text,
    status: send.status,
    messageId: send.messageId ?? null,
    sendRequestId: send.sendRequestId ?? null,
    sendPayload: send.sendPayload,
    mentions: send.mentions,
    replyToMessageId: send.replyToMessageId,
    quotePreview: send.quotePreview,
  };

  return {
    id: send.id,
    messageId: send.messageId ?? send.id,
    sendRequestId: send.sendRequestId ?? null,
    senderName,
    senderProfile: {
      wxid,
      nickname: senderName,
      displayName: senderName,
      platformRemark: null,
      avatarUrl: null,
      status: "local",
    },
    isSelf: true,
    sentAt: send.createdAtIso,
    sentAtIso: send.createdAtIso,
    status: "normal",
    content: localSendContent(send),
    standardJson,
    rawPayload: null,
    deliveries: [],
    localSend: {
      conversationId: send.conversationId,
      type: send.type,
      text: send.text,
      label,
      mentions: send.mentions,
      replyToMessageId: send.replyToMessageId,
      quotePreview: send.quotePreview,
      status: send.status,
      errorMessage: send.errorMessage,
      sendRequestId: send.sendRequestId ?? null,
      sendPayload: send.sendPayload,
    },
  };
}

export const mapLocalTextSendToMessageItem = mapLocalSendToMessageItem;

export function compareMessagesBySentAt(left: MessageItem, right: MessageItem): number {
  const leftTime = Date.parse(left.sentAtIso);
  const rightTime = Date.parse(right.sentAtIso);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return 0;
}

export function createLocalTextSend(
  conversationId: string,
  text: string,
  options: {
    mentions?: string[];
    replyToMessageId?: string;
    quotePreview?: MessageNode;
  } = {},
): LocalTextSend {
  return {
    id: createLocalSendId("text"),
    conversationId,
    type: "text",
    text,
    mentions: options.mentions,
    replyToMessageId: options.replyToMessageId,
    quotePreview: options.quotePreview,
    label: text,
    status: "pending",
    createdAtIso: new Date().toISOString(),
  };
}

export function createLocalMediaSend(conversationId: string, payload: LocalSendPayload): LocalSend {
  const text = localSendText(payload);
  return {
    id: createLocalSendId(payload.type),
    conversationId,
    type: payload.type,
    text,
    label: text,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    thumbUrl: payload.thumbUrl,
    durationMs: payload.durationMs,
    status: "pending",
    sendPayload: payload,
    createdAtIso: new Date().toISOString(),
  };
}

export function createLocalMediaPlaceholder(
  conversationId: string,
  payload: Pick<LocalSendPayload, "type" | "fileName" | "mimeType" | "thumbUrl" | "durationMs" | "title" | "desc" | "linkUrl">,
): LocalSend {
  const text = localSendText(payload);
  return {
    id: createLocalSendId(payload.type),
    conversationId,
    type: payload.type,
    text,
    label: text,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    thumbUrl: payload.thumbUrl,
    durationMs: payload.durationMs,
    status: "pending",
    createdAtIso: new Date().toISOString(),
  };
}

export function attachPayloadToLocalSend(send: LocalSend, payload: LocalSendPayload): LocalSend {
  const text = localSendText(payload);
  return {
    ...send,
    type: payload.type,
    text,
    label: text,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    thumbUrl: payload.thumbUrl,
    durationMs: payload.durationMs,
    sendPayload: payload,
  };
}

function localSendContent(send: LocalSend): MessageNode {
  if (send.type === "text") {
    return {
      type: "text",
      text: send.text,
      ...(send.quotePreview ? { quote: send.quotePreview } : {}),
    };
  }
  if (send.type === "link") {
    return {
      type: "link",
      text: send.text,
      link: {
        title: send.sendPayload?.title,
        desc: send.sendPayload?.desc,
        url: send.sendPayload?.linkUrl,
        thumbnailUrl: send.sendPayload?.thumbUrl,
      },
    };
  }
  if (send.type === "html") {
    return {
      type: "html",
      text: send.text,
      link: {
        title: send.sendPayload?.title,
        desc: send.sendPayload?.desc,
        url: send.sendPayload?.resolvedUrl ?? send.sendPayload?.linkUrl,
        thumbnailUrl: send.sendPayload?.thumbUrl,
      },
    };
  }
  return {
    type: send.type,
    text: send.text,
    media: {
      status: send.status === "failed" ? "failed" : "pending",
      fileName: send.fileName,
      mimeType: send.mimeType,
      durationMs: send.durationMs,
      thumbnailUrl: send.thumbUrl,
    },
  };
}

function localSendText(payload: LocalSendPayload): string {
  if (payload.type === "image") return payload.fileName ? `[图片] ${payload.fileName}` : "[图片]";
  if (payload.type === "voice") return "[语音]";
  if (payload.type === "video") return payload.fileName ? `[视频] ${payload.fileName}` : "[视频]";
  if (payload.type === "link") return payload.title ? `[链接] ${payload.title}` : "[链接]";
  if (payload.type === "html") return payload.title ? `[HTML] ${payload.title}` : "[HTML]";
  return payload.fileName ? `[文件] ${payload.fileName}` : "[文件]";
}

function createLocalSendId(type: LocalSendType): string {
  return `local_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
