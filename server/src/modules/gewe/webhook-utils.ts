import { createHash } from "node:crypto";

export type WebhookEventKind = "message" | "contact" | "status" | "unknown";

const contactTypes = new Set(["MOD_CONTACTS", "DEL_CONTACTS", "FRIEND_VERIFY", "FRIEND_CONFIRM"]);
const statusTypes = new Set([
  "LOGIN_SUCCESS",
  "LOGOUT",
  "LOGIN_ERROR",
  "Offline",
  "RECONNECT_START",
  "RECONNECT_SUCCESS",
  "RECONNECT_FAILED",
  "LONG_CONNECTED",
  "LONG_DISCONNECTED"
]);

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

export function parseWebhookJsonBody(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  return JSON.parse(preserveLargeIntegerFields(body)) as Record<string, unknown>;
}

export function preserveLargeIntegerFields(body: string): string {
  return body.replace(
    /"((?:newMsgId|NewMsgId|newmsgid|msgId|MsgId|msgid|createTime|CreateTime|createtime|fromnewmsgid|FromNewMsgId|svrid|SvrId))"\s*:\s*(-?\d{15,})/g,
    (_match, key: string, value: string) => `"${key}":"${value}"`
  );
}

export function buildWebhookDedupeKey(payload: Record<string, unknown>): string {
  const normalized = normalizeWebhookPayload(payload);
  const appid = asString(normalized.appid ?? normalized.appId);
  const newMsgId = asString(normalized.newMsgId ?? normalized.newmsgid);
  if (appid && newMsgId && !isPseudoMessageId(newMsgId)) {
    return `${appid}:${newMsgId}`;
  }

  const account = asString(normalized.wxid ?? normalized.toUser ?? normalized.fromUser) ?? "unknown";
  const digest = createHash("sha1").update(stableJsonStringify(payload)).digest("hex");
  return `fallback:${account}:${digest}`;
}

export function classifyWebhookPayload(payload: Record<string, unknown>): WebhookEventKind {
  const normalized = normalizeWebhookPayload(payload);
  const msgType = asString(normalized.msgType);
  if (!msgType) return "unknown";
  if (contactTypes.has(msgType)) return "contact";
  if (statusTypes.has(msgType)) return "status";
  if (msgType === "UNKNOWN") return "unknown";
  return "message";
}

export function normalizeWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.Data);
  if (!data) return payload;

  const rawMsgType = asString(data.MsgType ?? data.msgType);
  const rawContent = unwrapString(data.Content);
  const appMsgType = getAppMsgType(rawContent);
  const realInnerType = getRealInnerType(rawContent);
  const { fromUser, fromGroup, content } = normalizeParticipants({
    accountWxid: unwrapString(payload.Wxid ?? payload.wxid),
    fromUserName: unwrapString(data.FromUserName ?? data.fromUserName),
    toUserName: unwrapString(data.ToUserName ?? data.toUserName),
    content: rawContent
  });

  return {
    ...payload,
    appid: unwrapString(payload.Appid ?? payload.appid ?? payload.appId),
    wxid: unwrapString(payload.Wxid ?? payload.wxid),
    msgType: mapAddMsgType(rawMsgType, appMsgType, realInnerType),
    rawMsgType,
    appMsgType,
    realInnerType,
    msgId: unwrapString(data.MsgId ?? data.msgId),
    newMsgId: unwrapString(data.NewMsgId ?? data.newMsgId ?? data.newmsgid),
    createTime: data.CreateTime ?? data.createTime,
    content,
    rawContent,
    pushContent: unwrapString(data.PushContent ?? data.pushContent),
    msgSource: unwrapString(data.MsgSource ?? data.msgSource),
    fromUser,
    fromGroup,
    toUser: unwrapString(data.ToUserName ?? data.toUserName),
    isSelf: computeIsSelf(payload, data)
  };
}

function normalizeParticipants(input: {
  accountWxid: string | undefined;
  fromUserName: string | undefined;
  toUserName: string | undefined;
  content: string | undefined;
}) {
  if (input.fromUserName?.endsWith("@chatroom")) {
    const parsed = splitGroupSenderPrefix(input.content);
    return {
      fromGroup: input.fromUserName,
      fromUser: parsed.senderWxid ?? input.fromUserName,
      content: parsed.content
    };
  }
  return {
    fromGroup: undefined,
    fromUser: input.fromUserName,
    content: input.content
  };
}

function splitGroupSenderPrefix(content: string | undefined) {
  const match = content?.match(/^([^:\n]+):\n([\s\S]*)$/);
  if (!match) return { senderWxid: undefined, content };
  return {
    senderWxid: match[1],
    content: match[2]
  };
}

function mapAddMsgType(
  rawMsgType: string | undefined,
  appMsgType: string | undefined,
  realInnerType: string | undefined
): string | undefined {
  switch (rawMsgType) {
    case "1":
      return "TEXT";
    case "3":
      return "IMAGE";
    case "34":
      return "VOICE";
    case "42":
      return "CARD";
    case "43":
      return "VIDEO";
    case "47":
      return "EMOJI";
    case "48":
      return "LOCATION";
    case "49":
      return mapAppMsgType(appMsgType, realInnerType);
    case "10002":
      return "REVOKE_MSG";
    default:
      return rawMsgType;
  }
}

function mapAppMsgType(
  appMsgType: string | undefined,
  realInnerType: string | undefined
): string {
  switch (appMsgType) {
    case "5":
      return "LINK";
    case "6":
      return "FILE";
    case "19":
      return "CHAT_RECORD";
    case "40":
      return realInnerType === "19" ? "CHAT_RECORD" : "APP_MSG";
    case "33":
    case "36":
      return "MINI_PROGRAM";
    case "57":
      return "QUOTE";
    case "74":
      return "APP_MSG";
    case "2000":
      return "TRANSFER";
    case "2001":
      return "RED_PACKET";
    default:
      return "APP_MSG";
  }
}

function computeIsSelf(payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  const explicit = payload.isSelf ?? payload.IsSelf ?? data.isSelf ?? data.IsSelf;
  if (explicit !== undefined) return parseBoolean(explicit);
  const accountWxid = unwrapString(payload.Wxid ?? payload.wxid);
  const fromUserName = unwrapString(data.FromUserName ?? data.fromUserName);
  return Boolean(accountWxid && fromUserName && accountWxid === fromUserName);
}

function parseBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  return false;
}

function getAppMsgType(rawContent: string | undefined): string | undefined {
  return rawContent?.match(/<type>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/type>/)?.[1]?.trim();
}

function getRealInnerType(rawContent: string | undefined): string | undefined {
  return rawContent
    ?.match(/<realinnertype>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/realinnertype>/)?.[1]
    ?.trim();
}

function unwrapString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("string" in record) return unwrapString(record.string);
    if ("__cdata" in record) return unwrapString(record.__cdata);
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function isPseudoMessageId(value: string): boolean {
  return /^\d{10}$/.test(value);
}
