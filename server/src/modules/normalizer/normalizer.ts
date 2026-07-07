import { XMLParser } from "fast-xml-parser";
import type { MessageEnvelope, MessageNode } from "@gewehub/contracts";
import { normalizeWebhookPayload } from "../gewe/webhook-utils.js";
import { getMessageParser } from "./parsers/registry.js";
import type { MessageParserContext } from "./parsers/types.js";

const messageTypes = new Set([
  "TEXT",
  "IMAGE",
  "VOICE",
  "VIDEO",
  "FILE",
  "EMOJI",
  "LINK",
  "MINI_PROGRAM",
  "QUOTE",
  "CHAT_RECORD",
  "LOCATION",
  "CARD",
  "TRANSFER",
  "RED_PACKET",
  "SYSTEM",
  "PAT_MSG",
  "APP_MSG",
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

export function shouldSkipStandardMessage(
  payload: Record<string, unknown>,
): boolean {
  const normalized = normalizeWebhookPayload(payload);
  const msgType = asString(normalized.msgType);
  if (!msgType) return true;
  if (
    msgType === "UNKNOWN" ||
    msgType === "MOD_CONTACTS" ||
    msgType === "DEL_CONTACTS" ||
    msgType === "REVOKE_MSG"
  ) {
    return true;
  }
  if (msgType === "APP_MSG") {
    const appType = getAppMsgType(asString(normalized.content));
    return appType === "74";
  }
  return !messageTypes.has(msgType);
}

export function normalizeGewePayload(
  rawPayload: Record<string, unknown>,
): MessageEnvelope | null {
  const payload = normalizeWebhookPayload(rawPayload);
  if (shouldSkipStandardMessage(payload)) return null;

  const msgType = asString(payload.msgType) ?? "UNKNOWN";
  const accountWxid = asString(payload.wxid ?? payload.toUser) ?? "unknown";
  const fromGroup = asString(payload.fromGroup);
  const fromUser = asString(payload.fromUser) ?? "unknown";
  const isSelf = parseBoolean(payload.isSelf);
  const peerWxid =
    fromGroup || (isSelf ? asString(payload.toUser) : fromUser) || "unknown";
  const conversationType = fromGroup?.endsWith("@chatroom")
    ? "group"
    : "private";
  const content = normalizeContent(payload, msgType);
  const sentAt = toIsoString(payload.createTime);
  const isAtMe = detectAtMe(payload);
  const quote =
    msgType === "QUOTE"
      ? normalizeQuote(payload)
      : normalizeExtCommonQuote(payload);

  return {
    schemaVersion: 1,
    eventType: "message.created",
    messageId: `msg_${asString(payload.newMsgId ?? payload.msgId) ?? "unknown"}`,
    status: "normal",
    isSelf,
    isAtMe,
    account: {
      wxid: accountWxid,
    },
    conversation: {
      id: `cvs_${accountWxid}_${peerWxid}`,
      type: conversationType,
      wxid: peerWxid,
    },
    sender: {
      wxid: fromUser,
      name: extractSenderName(asString(payload.pushContent)),
      isOwner: false,
    },
    mentions: extractMentionsForNode(
      content,
      accountWxid,
      isAtMe,
      asString(payload.msgSource),
    ),
    content,
    quote,
    renderedText: renderNode(content, quote),
    sentAt,
    metadata: {
      gewe: buildGeweMetadata(payload),
    },
  };
}

export interface RevokedMessageRef {
  messageId: string | null;
  rawMsgId: string | null;
}

export function extractRevokedMessageRef(
  rawPayload: Record<string, unknown>,
): RevokedMessageRef | null {
  const payload = normalizeWebhookPayload(rawPayload);
  if (asString(payload.msgType) !== "REVOKE_MSG") return null;
  const parsed = safeParseXml(asString(payload.content) ?? "");
  const newMsgId = firstString(parsed?.sysmsg?.revokemsg?.newmsgid);
  const rawMsgId = firstString(parsed?.sysmsg?.revokemsg?.msgid);
  return {
    messageId: newMsgId ? `msg_${newMsgId}` : null,
    rawMsgId: rawMsgId ?? null,
  };
}

function normalizeContent(
  payload: Record<string, unknown>,
  msgType: string,
): MessageNode {
  const rawContent = asString(payload.content) ?? "";
  const context: MessageParserContext = {
    firstString,
    mediaNode,
    msgType,
    normalizeCard,
    normalizeChatRecord,
    normalizeFile,
    normalizeLink,
    normalizeLocation,
    normalizeMiniProgram,
    normalizeRedPacket,
    normalizeTransfer,
    parseAppMsg,
    rawContent,
    stripHtml,
  };
  return getMessageParser(msgType).parse(context);
}

function normalizeFile(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const fileName = firstString(appmsg?.title) || "文件";
  const appattach = appmsg?.appattach;
  return {
    type: "file",
    text: `[文件] ${fileName}`,
    media: {
      status: "failed",
      url: null,
      fileName,
      size: toNumber(appattach?.totallen),
      md5: firstString(appmsg?.md5),
    },
  };
}

function normalizeLink(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const title = firstString(appmsg?.title) || "链接";
  return {
    type: "link",
    text: `[链接] ${title}`,
    link: {
      title,
      desc: firstString(appmsg?.des),
      url: firstString(appmsg?.url),
    },
  };
}

function normalizeMiniProgram(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const title = firstString(appmsg?.title) || "小程序";
  return {
    type: "mini_program",
    text: `[小程序] ${title}`,
    miniProgram: {
      appId: firstString(appmsg?.weappinfo?.username),
      title,
      pagePath: firstString(appmsg?.weappinfo?.pagepath),
      sourceName: firstString(appmsg?.sourcedisplayname),
    },
  };
}

function normalizeLocation(rawContent: string): MessageNode {
  const location = safeParseXml(rawContent)?.msg?.location;
  const label =
    firstString(location?.label) || firstString(location?.poiname) || "位置";
  return {
    type: "location",
    text: `[位置] ${label}`,
    location: {
      label,
      address: firstString(location?.poiname),
      lat: toNumber(location?.x),
      lng: toNumber(location?.y),
    },
  };
}

function normalizeCard(rawContent: string): MessageNode {
  const msg = safeParseXml(rawContent)?.msg;
  const wxid = firstString(msg?.username);
  const nickName = nonBlankString(firstString(msg?.nickname)) ?? wxid ?? "名片";
  return {
    type: "card",
    text: `[名片] ${nickName}`,
    card: {
      wxid,
      nickName,
      avatarUrl: firstString(msg?.smallheadimgurl ?? msg?.bigheadimgurl),
    },
  };
}

function normalizeTransfer(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const title = firstString(appmsg?.title) || "转账";
  return {
    type: "transfer",
    text: `[转账] ${title}`,
    transfer: {
      amount:
        firstString(appmsg?.wcpayinfo?.feedesc) || firstString(appmsg?.title),
      memo:
        firstString(appmsg?.wcpayinfo?.pay_memo) || firstString(appmsg?.des),
      direction: "unknown",
    },
  };
}

function normalizeRedPacket(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const greeting =
    firstString(appmsg?.wcpayinfo?.receivertitle) ||
    firstString(appmsg?.wcpayinfo?.sendertitle) ||
    firstString(appmsg?.des);
  return {
    type: "red_packet",
    text: greeting ? `[红包] ${greeting}` : "[红包]",
    redPacket: {
      greeting,
    },
  };
}

function normalizeQuote(payload: Record<string, unknown>): MessageNode | null {
  const refermsg = parseAppMsg(asString(payload.content) ?? "")?.refermsg;
  if (!refermsg)
    return { type: "unsupported", text: "引用了一条消息，暂未解析内容" };
  return attachQuoteMetadata(
    normalizeReferencedMessageNode(refermsg),
    refermsg,
  );
}

function normalizeExtCommonQuote(
  payload: Record<string, unknown>,
): MessageNode | null {
  const refermsg = safeParseXml(asString(payload.content) ?? "")?.msg
    ?.extcommoninfo?.refermsg;
  if (!refermsg) return null;
  return attachQuoteMetadata(
    { type: "unsupported", text: "引用了一条消息，暂未解析内容" },
    refermsg,
  );
}

function normalizeReferencedMessageNode(
  refermsg: Record<string, unknown>,
): MessageNode {
  const referType = firstString(refermsg.type);
  const rawContent = firstString(refermsg.content);
  const decodedContent = rawContent ? decodeEntities(rawContent) : "";
  const mappedType = mapReferencedMsgType(referType, decodedContent);
  if (mappedType) {
    return normalizeContent({ content: decodedContent }, mappedType);
  }

  const fallbackText = stripXmlTags(
    decodedContent || firstString(refermsg.displayname) || "引用了一条消息",
  );
  if (fallbackText) return { type: "text", text: fallbackText.slice(0, 500) };
  return { type: "unsupported", text: "引用了一条消息，暂未解析内容" };
}

function mapReferencedMsgType(
  referType: string | undefined,
  rawContent: string,
): string | undefined {
  if (referType === "49")
    return mapReferencedAppMsgType(getAppMsgType(rawContent), rawContent);
  if (referType === "1") return "TEXT";
  if (referType === "3") return "IMAGE";
  if (referType === "34") return "VOICE";
  if (referType === "42") return "CARD";
  if (referType === "43") return "VIDEO";
  if (referType === "47") return "EMOJI";
  if (referType === "48") return "LOCATION";
  return undefined;
}

function mapReferencedAppMsgType(
  appMsgType: string | undefined,
  rawContent = "",
): string | undefined {
  if (appMsgType === "5") return "LINK";
  if (appMsgType === "6") return "FILE";
  if (appMsgType === "19") return "CHAT_RECORD";
  if (appMsgType === "40" && getRealInnerType(rawContent) === "19")
    return "CHAT_RECORD";
  if (appMsgType === "33" || appMsgType === "36") return "MINI_PROGRAM";
  if (appMsgType === "57") return "QUOTE";
  if (appMsgType === "2000") return "TRANSFER";
  if (appMsgType === "2001") return "RED_PACKET";
  if (appMsgType === "74") return "APP_MSG";
  return appMsgType ? "APP_MSG" : undefined;
}

function attachQuoteMetadata(
  node: MessageNode,
  refermsg: Record<string, unknown>,
): MessageNode {
  const displayName = firstString(refermsg.displayname);
  const sourceId = firstString(refermsg.svrid);
  const createTime = firstString(refermsg.createtime);
  return {
    ...node,
    senderName: displayName ?? node.senderName,
    sourceMessageId: sourceId ? `msg_${sourceId}` : node.sourceMessageId,
    sentAt: createTime ? secondsToIsoString(createTime) : node.sentAt,
  };
}

function normalizeChatRecord(rawContent: string): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const title = firstString(appmsg?.title) || "聊天记录";
  const recorditem = firstString(appmsg?.recorditem);
  const items = recorditem ? parseRecordItems(recorditem) : [];
  const appMsgType = firstString(appmsg?.type);
  const realInnerType = firstString(appmsg?.realinnertype);
  const summary = stripHtml(firstString(appmsg?.des) || "");
  const isFavoriteChatRecord = appMsgType === "40" && realInnerType === "19";
  const node: MessageNode = {
    type: "chat_record",
    text:
      items.length === 0 && isFavoriteChatRecord && summary
        ? `${title}\n${summary}`
        : title,
    items,
  };
  if (isFavoriteChatRecord) node.rawType = "APP_MSG_TYPE_40_REALINNER_19";
  return node;
}

function parseRecordItems(recorditem: string): MessageNode[] {
  const recordXml = decodeEntities(recorditem).replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;",
  );
  const parsed = safeParseXml(recordXml);
  return parseRecordInfoItems(parsed?.recordinfo);
}

function parseRecordXmlItems(recordxml: unknown): MessageNode[] {
  const parsedRecordXml = asRecord(recordxml);
  if (parsedRecordXml?.recordinfo)
    return parseRecordInfoItems(parsedRecordXml.recordinfo);
  const rawRecordXml = firstString(recordxml);
  if (!rawRecordXml) return [];
  const recordXml = decodeEntities(rawRecordXml).replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;",
  );
  return parseRecordInfoItems(safeParseXml(recordXml)?.recordinfo);
}

function parseRecordInfoItems(recordinfo: unknown): MessageNode[] {
  const data =
    asRecord(recordinfo)?.datalist &&
    asRecord(asRecord(recordinfo)?.datalist)?.dataitem;
  const dataItems = Array.isArray(data) ? data : data ? [data] : [];
  return dataItems.map((item) =>
    normalizeRecordItem(item as Record<string, unknown>),
  );
}

function normalizeRecordItem(item: Record<string, unknown>): MessageNode {
  const datatype = firstString(item.datatype);
  const descText = stripXmlTags(
    decodeEntities(firstString(item.datadesc) || ""),
  );
  const titleText = stripXmlTags(
    decodeEntities(firstString(item.datatitle) || ""),
  );
  const text = descText || titleText;
  const quote = normalizeRecordItemQuote(item);
  const base = {
    senderName: firstString(item.sourcename),
    sourceMessageId: firstString(item.fromnewmsgid)
      ? `msg_${firstString(item.fromnewmsgid)}`
      : undefined,
    sentAt: item.srcMsgCreateTime
      ? secondsToIsoString(item.srcMsgCreateTime)
      : undefined,
    quote,
  };
  if (datatype === "2")
    return {
      type: "image",
      text: text || "[图片]",
      media: recordItemMedia(item),
      ...base,
    } satisfies MessageNode;
  if (datatype === "4")
    return {
      type: "video",
      text: text || "[视频]",
      media: recordItemMedia(item),
      ...base,
    } satisfies MessageNode;
  if (datatype === "8") {
    const fileName = firstString(item.datatitle) || text || "文件";
    return {
      type: "file",
      text: `[文件] ${fileName}`,
      media: {
        status: "failed",
        url: null,
        fileName,
        size: toNumber(item.datasize),
      },
      ...base,
    } satisfies MessageNode;
  }
  if (datatype === "5") {
    const title = titleText || text || "链接";
    return {
      type: "link",
      text: `[链接] ${title}`,
      link: {
        title,
        desc: descText || undefined,
        url: firstString(
          item.streamweburl ?? item.dataurl ?? asRecord(item.weburlitem)?.url,
        ),
      },
      ...base,
    } satisfies MessageNode;
  }
  if (datatype === "17") {
    return {
      type: "chat_record",
      text: titleText || text || "聊天记录",
      items: parseRecordXmlItems(item.recordxml),
      ...base,
    } satisfies MessageNode;
  }
  if (datatype === "37")
    return {
      type: "emoji",
      text: text || "[动画表情]",
      media: recordItemMedia(item),
      ...base,
    } satisfies MessageNode;
  if (datatype === "1" && isVoiceSummaryText(text))
    return {
      type: "voice",
      text: "[语音]",
      media: {
        status: "failed",
        url: null,
        durationMs: parseVoiceSummaryDurationMs(text),
      },
      ...base,
    } satisfies MessageNode;
  return {
    type: "text",
    text: text || "[文本]",
    ...base,
  } satisfies MessageNode;
}

function isVoiceSummaryText(value: string): boolean {
  return /^\[语音\]\s*\d+(?:\.\d+)?["”]?$/.test(value.trim());
}

function parseVoiceSummaryDurationMs(value: string): number | undefined {
  const match = value.trim().match(/^\[语音\]\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 1000);
}

function normalizeRecordItemQuote(
  item: Record<string, unknown>,
): MessageNode | undefined {
  const refermsgitem = asRecord(item.refermsgitem);
  if (!refermsgitem) return undefined;
  return attachQuoteMetadata(
    normalizeReferencedMessageNode(refermsgitem),
    refermsgitem,
  );
}

function mediaNode(
  type: MessageNode["type"],
  text: string,
  rawContent: string,
): MessageNode {
  const appmsg = parseAppMsg(rawContent);
  const nativeMedia = parseNativeMedia(type, rawContent);
  return {
    type,
    text,
    media: {
      status: "pending",
      url: null,
      fileName: firstString(appmsg?.title),
      size: toNumber(appmsg?.appattach?.totallen),
      ...nativeMedia,
    },
  };
}

function parseNativeMedia(type: MessageNode["type"], rawContent: string) {
  if (type === "emoji") {
    const compactMd5 = extractCompactEmojiMd5(rawContent);
    if (compactMd5) return { md5: compactMd5 };
  }
  const msg = safeParseXml(rawContent)?.msg;
  if (!msg) return {};
  if (type === "image") {
    const img = msg.img;
    return {
      size: toNumber(img?.length ?? img?.hdlength),
      width: toNumber(img?.cdnthumbwidth),
      height: toNumber(img?.cdnthumbheight),
      md5: firstString(img?.md5),
    };
  }
  if (type === "voice") {
    const voice = msg.voicemsg;
    return {
      size: toNumber(voice?.length),
      durationMs: toNumber(voice?.voicelength),
      md5: firstString(voice?.md5),
    };
  }
  if (type === "video") {
    const video = msg.videomsg;
    const durationSeconds = toNumber(video?.playlength ?? video?.duration);
    return {
      size: toNumber(video?.length),
      durationMs:
        durationSeconds === undefined ? undefined : durationSeconds * 1000,
      width: toNumber(video?.cdnthumbwidth),
      height: toNumber(video?.cdnthumbheight),
      md5: firstString(video?.md5),
    };
  }
  if (type === "emoji") {
    const emoji = msg.emoji;
    return {
      size: toNumber(emoji?.len),
      width: toNumber(emoji?.width),
      height: toNumber(emoji?.height),
      md5: firstString(emoji?.md5) ?? extractCompactEmojiMd5(rawContent),
    };
  }
  return {};
}

function extractCompactEmojiMd5(rawContent: string): string | undefined {
  const compact = rawContent.trim().match(/^[^:\s]+:\d+:0:([a-fA-F0-9]{32})::0$/);
  return compact?.[1];
}

function recordItemMedia(item: Record<string, unknown>) {
  const emoji = asRecord(item.emojiitem);
  const md5 = firstString(item.fullmd5 ?? item.thumbfullmd5 ?? emoji?.md5);
  const hasDownloadHint = Boolean(
    firstString(
      item.cdndataurl ??
        item.cdnthumburl ??
        item.dataurl ??
        item.cdnvideourl ??
        emoji?.cdnurlstring ??
        emoji?.encrypturlstring ??
        emoji?.externurl ??
        md5,
    ),
  );
  return {
    status: hasDownloadHint ? ("pending" as const) : ("failed" as const),
    url: null,
    size: toNumber(item.datasize),
    width: toNumber(item.thumbwidth ?? emoji?.uiemoticonwidth),
    height: toNumber(item.thumbheight ?? emoji?.uiemoticonheight),
    durationMs: toNumber(item.duration)
      ? Number(item.duration) * 1000
      : undefined,
    md5,
  };
}

function parseAppMsg(
  rawContent: string | undefined,
): Record<string, any> | undefined {
  if (!rawContent) return undefined;
  const parsed = safeParseXml(rawContent);
  return parsed?.msg?.appmsg;
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

function getAppMsgType(rawContent: string | undefined): string | undefined {
  return firstString(parseAppMsg(rawContent)?.type);
}

function getRealInnerType(rawContent: string | undefined): string | undefined {
  return firstString(parseAppMsg(rawContent)?.realinnertype);
}

function buildGeweMetadata(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = definedEntries({
    appid: asString(payload.appid),
    msgType: asString(payload.msgType),
    rawMsgType: asString(payload.rawMsgType ?? payload.msgType),
    appMsgType: asString(payload.appMsgType),
    realInnerType: asString(payload.realInnerType),
    rawMessageId: asString(payload.newMsgId),
  });
  const appattach = parseAppMsg(asString(payload.content))?.appattach;
  const overwriteNewMsgId = firstString(appattach?.overwrite_newmsgid);
  if (overwriteNewMsgId) metadata.overwriteNewMsgId = overwriteNewMsgId;
  return metadata;
}

function definedEntries(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function detectAtMe(payload: Record<string, unknown>): boolean {
  const pushContent = asString(payload.pushContent) ?? "";
  return (
    pushContent.includes("在群聊中@了你") || pushContent.includes("@了所有人")
  );
}

function extractMentions(
  content: string | undefined,
  accountWxid: string,
  isAtMe: boolean,
  msgSource: string | undefined,
) {
  const names = [...(content ?? "").matchAll(/@([^\s\u2005]+)\u2005?/g)]
    .map((match) => match[1])
    .filter(Boolean);
  const wxids = extractAtUserList(msgSource);
  if (names.length === 0 && isAtMe) {
    return [{ wxid: accountWxid, isMe: true, resolved: true }];
  }
  return names.map((name, index) => {
    const wxid = wxids[index];
    if (!wxid) return { name, resolved: false };
    return {
      name,
      wxid,
      isMe: wxid === accountWxid,
      resolved: true,
    };
  });
}

function extractAtUserList(msgSource: string | undefined): string[] {
  const atuserlist = firstString(
    safeParseXml(msgSource ?? "")?.msgsource?.atuserlist,
  );
  return (atuserlist ?? "")
    .split(",")
    .map((wxid) => wxid.trim())
    .filter(Boolean);
}

function extractMentionsForNode(
  node: MessageNode,
  accountWxid: string,
  isAtMe: boolean,
  msgSource: string | undefined,
) {
  if (node.type !== "text") {
    return isAtMe ? [{ wxid: accountWxid, isMe: true, resolved: true }] : [];
  }
  return extractMentions(node.text, accountWxid, isAtMe, msgSource);
}

function extractSenderName(
  pushContent: string | undefined,
): string | undefined {
  if (!pushContent) return undefined;
  const match = pushContent.match(/^(.+?)\s:\s/);
  const name = match?.[1];
  return name?.trim() || undefined;
}

function renderNode(node: MessageNode, quote?: MessageNode | null): string {
  if (quote) {
    const quoteText = renderNode(quote);
    return quoteText ? `${node.text}: ${quoteText}` : node.text;
  }
  if (node.type === "chat_record") return `[聊天记录] ${node.text}`;
  return node.text;
}

function toIsoString(value: unknown): string {
  const ms = Number(value);
  if (Number.isFinite(ms))
    return new Date(ms < 1_000_000_000_000 ? ms * 1000 : ms).toISOString();
  return new Date(0).toISOString();
}

function secondsToIsoString(value: unknown): string {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  return new Date(0).toISOString();
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
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

function nonBlankString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toNumber(value: unknown): number | undefined {
  const numeric = Number(firstString(value));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, "")).trim();
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
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
