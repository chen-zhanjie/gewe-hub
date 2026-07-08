import type { MessageEnvelope, MessageNode } from "@gewehub/contracts";

export interface SendMappingInput {
  appId: string;
  peerWxid: string;
  type: "text" | "image" | "file" | "voice" | "video" | "link";
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
}

export function mapSendRequestToGewe(input: SendMappingInput) {
  if (input.type === "text") {
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
            thumbUrl: input.thumbUrl,
            thumbSource,
            videoDuration: durationMsToSeconds(input.durationMs),
            source
          })
        : compactRecord({
            appId: input.appId,
            toWxid: input.peerWxid,
            videoUrl: input.mediaUrl ?? input.fileUrl,
            thumbUrl: input.thumbUrl,
            thumbSource,
            videoDuration: durationMsToSeconds(input.durationMs)
          })
    };
  }
  if (input.type === "link") {
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

export interface LocalHubSendInput {
  accountWxid: string;
  conversationId: string;
  conversationWxid: string;
  senderWxid: string;
  text: string;
  newMsgId: string;
  createTime: string;
  content?: MessageNode;
}

export function buildLocalHubSendMessage(input: LocalHubSendInput) {
  const sentAt = new Date(normalizeGeweCreateTimeMs(input.createTime)).toISOString();
  const content = input.content ?? {
    type: "text" as const,
    text: input.text
  };
  const payload: MessageEnvelope = {
    schemaVersion: 1,
    eventType: "message.created",
    messageId: `msg_${input.newMsgId}`,
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
    mentions: [],
    content,
    quote: null,
    renderedText: input.text,
    sentAt
  };

  return {
    source: "hub_send" as const,
    messageId: payload.messageId,
    rawMessageId: input.newMsgId,
    dedupeKey: `hub_send:${input.newMsgId}`,
    type: content.type,
    status: "normal" as const,
    senderWxid: input.senderWxid,
    isSelf: true,
    isAtMe: false,
    sentAt: new Date(sentAt),
    payload,
    renderedText: input.text,
    payloadVersion: 1
  };
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
