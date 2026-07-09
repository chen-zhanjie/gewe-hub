import type { MessageEnvelope, MessageNode } from "@gewehub/contracts";

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function renderMessageSummary(
  content: MessageNode,
  quote?: MessageNode | null,
): string {
  const contentText = renderNodeSummary(content);
  if (!quote) return contentText;
  const quoteText = renderNodeSummary(quote);
  return quoteText ? `${contentText}: ${quoteText}` : contentText;
}

export function renderNodeSummary(node: MessageNode): string {
  if (node.type === "chat_record") return `[聊天记录] ${node.text}`;
  return node.text;
}

export function renderMessageMarkdown(envelope: MessageEnvelope): string {
  const lines: string[] = ["[上下文]"];
  lines.push(`消息ID: ${envelope.messageId}`);
  lines.push(`会话: ${formatConversation(envelope.conversation)}`);
  const sentAt = formatDateTime(envelope.sentAt);
  if (sentAt) lines.push(`时间: ${sentAt}`);
  lines.push(`${envelope.content.type === "chat_record" ? "转发者" : "发送者"}: ${formatIdentity(envelope.sender)}`);
  if (envelope.content.type === "chat_record") lines.push("消息类型: 合并转发");

  const mentioned = envelope.mentions.map(formatMention).filter(Boolean);
  if (mentioned.length > 0) lines.push(`被@对象: ${mentioned.join(", ")}`);

  const mentionable = mentionableIdentities(envelope);
  if (mentionable.length > 0) lines.push(`可@对象: ${mentionable.join(", ")}`);

  if (envelope.quote) {
    lines.push("", "[引用]");
    lines.push(...renderQuoteBlock(envelope.quote));
  }

  lines.push("", "[正文]");
  lines.push(renderNodeMarkdown(envelope.content));

  return trimBlankEdges(lines).join("\n");
}

function renderNodeMarkdown(node: MessageNode, indent = ""): string {
  const body = renderNodeBodyMarkdown(node, indent);
  if (!node.quote) return body;
  return [...renderQuoteBlock(node.quote), "", body].join("\n");
}

function renderNodeBodyMarkdown(node: MessageNode, indent: string): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "image":
      return renderMediaMarkdown(node, "图片");
    case "voice":
      return renderMediaMarkdown(node, formatTimedLabel("语音", node.media?.durationMs));
    case "video":
      return renderMediaMarkdown(node, formatTimedLabel("视频", node.media?.durationMs));
    case "file":
      return renderFileMarkdown(node);
    case "emoji":
      return renderMediaMarkdown(node, "动画表情");
    case "link":
      return renderLinkMarkdown(node);
    case "html":
      return renderLinkMarkdown(node);
    case "mini_program":
      return renderMiniProgramMarkdown(node);
    case "chat_record":
      return renderChatRecordMarkdown(node, indent);
    case "location":
      return renderLocationMarkdown(node);
    case "card":
      return renderCardMarkdown(node);
    case "transfer":
      return renderTransferMarkdown(node);
    case "red_packet":
      return node.redPacket?.greeting ? `[红包] ${node.redPacket.greeting}` : "[红包]";
    case "system":
      return node.text ? `[系统消息] ${node.text}` : "[系统消息]";
    case "unsupported":
      return `[暂不支持的消息类型: ${node.rawType ?? "unknown"}] ${node.text}`.trim();
    default:
      return node.text;
  }
}

function renderChatRecordMarkdown(node: MessageNode, indent: string): string {
  const lines: string[] = [`[聊天记录] ${node.text}`];
  const items = node.items ?? [];
  if (items.length === 0) return lines[0];

  lines.push("");
  items.forEach((item, index) => {
    if (index > 0) lines.push("");
    const nestedIndent = `${indent}   `;
    const header = formatRecordItemHeader(item, index + 1);
    lines.push(`${indent}${index + 1}. ${header}`);
    const rendered = renderNodeMarkdown(item, nestedIndent);
    for (const line of rendered.split("\n")) {
      lines.push(line ? `${nestedIndent}${line}` : "");
    }
  });
  return lines.join("\n");
}

function formatRecordItemHeader(node: MessageNode, index: number): string {
  const parts: string[] = [];
  const identity = formatRecordIdentity(node);
  if (identity) parts.push(identity);
  const sentAt = formatDateTime(node.sentAt);
  if (sentAt) parts.push(sentAt);
  const base = parts.join(" ");
  if (node.sourceMessageId) {
    return `${base || `第 ${index} 条`}（消息ID: ${node.sourceMessageId}）：`;
  }
  if (!base) return `第 ${index} 条：`;
  return `${base}：`;
}

function formatRecordIdentity(node: MessageNode): string | null {
  if (node.senderName && node.senderWxid) return `${node.senderName} <${node.senderWxid}>`;
  if (node.senderName) return node.senderName;
  if (node.senderWxid) return `<${node.senderWxid}>`;
  return null;
}

function renderQuoteBlock(node: MessageNode, indent = ""): string[] {
  const header = `引用${formatQuoteIdentity(node)}：`;
  const lines = [`${indent}> ${header}`];
  const body = renderNodeMarkdown({ ...node, quote: undefined });
  for (const line of body.split("\n")) {
    lines.push(line ? `${indent}> ${line}` : `${indent}>`);
  }
  return lines;
}

function formatQuoteIdentity(node: MessageNode): string {
  const name = node.senderName?.trim();
  const wxid = node.senderWxid?.trim();
  const id = node.sourceMessageId?.trim();
  const identity = name && wxid ? `${name} <${wxid}>` : name || (wxid ? `<${wxid}>` : "");
  const suffix = id ? `（消息ID: ${id}）` : "";
  return identity || suffix ? ` ${identity}${suffix}` : "";
}

function renderMediaMarkdown(node: MessageNode, label: string): string {
  const status = node.media?.status;
  const url = node.media?.url;
  if (status === "ready" && url) return `[${label}](${url})`;
  if (status === "failed") return `[${label}]（下载失败）`;
  return `[${label}]（等待下载）`;
}

function renderFileMarkdown(node: MessageNode): string {
  const name = node.media?.fileName || stripPrefix(node.text, "[文件]") || "文件";
  const status = node.media?.status;
  const url = node.media?.url;
  if (status === "ready" && url) return `[${name}](${url})`;
  if (status === "failed") return `[文件] ${name}（下载失败）`;
  return `[文件] ${name}（等待下载）`;
}

function renderLinkMarkdown(node: MessageNode): string {
  const title = node.link?.title || stripPrefix(node.text, "[链接]") || node.text || "链接";
  const url = node.link?.url;
  const firstLine = url ? `[${title}](${url})` : `[链接] ${title}`;
  const desc = node.link?.desc?.trim();
  return desc ? `${firstLine}\n> ${desc}` : firstLine;
}

function renderMiniProgramMarkdown(node: MessageNode): string {
  const title = node.miniProgram?.title || stripPrefix(node.text, "[小程序]") || "小程序";
  const details = [
    node.miniProgram?.sourceName ? `来源：${node.miniProgram.sourceName}` : undefined,
    node.miniProgram?.pagePath ? `路径：${node.miniProgram.pagePath}` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? `[小程序] ${title}（${details.join("，")}）` : `[小程序] ${title}`;
}

function renderLocationMarkdown(node: MessageNode): string {
  const title = node.location?.label || stripPrefix(node.text, "[位置]") || "位置";
  const lines = [`[位置] ${title}`];
  if (node.location?.address) lines.push(node.location.address);
  if (node.location?.lat !== undefined && node.location?.lng !== undefined) {
    lines.push(`${node.location.lat},${node.location.lng}`);
  }
  return lines.join("\n");
}

function renderCardMarkdown(node: MessageNode): string {
  const title = node.card?.nickName || stripPrefix(node.text, "[名片]") || "名片";
  return node.card?.wxid ? `[名片] ${title}\n${node.card.wxid}` : `[名片] ${title}`;
}

function renderTransferMarkdown(node: MessageNode): string {
  const amount = node.transfer?.amount || stripPrefix(node.text, "[转账]") || "转账";
  return node.transfer?.memo ? `[转账] ${amount}：${node.transfer.memo}` : `[转账] ${amount}`;
}

function formatConversation(conversation: MessageEnvelope["conversation"]): string {
  const name = conversation.remark || conversation.name || conversation.wxid;
  return `${name} (${conversation.type}, ${conversation.id})`;
}

function formatIdentity(identity: {
  wxid: string;
  name?: string;
  remark?: string;
}): string {
  const name = identity.remark || identity.name || identity.wxid;
  return `${name} <${identity.wxid}>`;
}

function formatMention(mention: MessageEnvelope["mentions"][number]): string | null {
  if (mention.wxid) return `${mention.name || mention.wxid} <${mention.wxid}>`;
  if (mention.name) return `${mention.name} <未解析>`;
  return null;
}

function mentionableIdentities(envelope: MessageEnvelope): string[] {
  const byWxid = new Map<string, string>();
  addMentionable(byWxid, envelope.sender.wxid, envelope.sender.remark || envelope.sender.name || envelope.sender.wxid);
  for (const mention of envelope.mentions) {
    if (mention.wxid) addMentionable(byWxid, mention.wxid, mention.name || mention.wxid);
  }
  collectMentionableFromNode(byWxid, envelope.quote);
  collectMentionableFromNode(byWxid, envelope.content);
  return [...byWxid.entries()].map(([wxid, name]) => `${name} <${wxid}>`);
}

function collectMentionableFromNode(
  byWxid: Map<string, string>,
  node: MessageNode | null | undefined,
): void {
  if (!node) return;
  if (node.senderWxid) addMentionable(byWxid, node.senderWxid, node.senderName || node.senderWxid);
  if (node.quote) collectMentionableFromNode(byWxid, node.quote);
  for (const item of node.items ?? []) collectMentionableFromNode(byWxid, item);
}

function addMentionable(byWxid: Map<string, string>, wxid: string | undefined, name: string): void {
  if (!wxid || byWxid.has(wxid)) return;
  byWxid.set(wxid, name);
}

function formatDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((record, part) => {
      if (part.type !== "literal") record[part.type] = part.value;
      return record;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatTimedLabel(label: string, durationMs: number | undefined): string {
  if (!durationMs) return label;
  const seconds = durationMs / 1000;
  const rendered = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  return `${label} ${rendered}s`;
}

function stripPrefix(value: string | undefined, prefix: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
}

function trimBlankEdges(lines: string[]): string[] {
  const next = [...lines];
  while (next[0] === "") next.shift();
  while (next[next.length - 1] === "") next.pop();
  return next;
}
