import type { MessageNode } from "@gewehub/contracts";

export interface AccountSummary {
  id: string;
  name: string;
  wxid: string;
  status: "online" | "offline" | "unknown";
}

export interface ConversationSummary {
  id: string;
  name: string;
  originalName: string;
  type: "private" | "group";
  lastMessage: string;
  lastAt: string;
  appName?: string;
  unread: number;
  avatarText: string;
  avatarUrl?: string | null;
  status: "active" | "inactive";
  raw: BackendConversation;
}

export interface WechatEntityProfile {
  wxid: string;
  nickname?: string | null;
  displayName?: string | null;
  platformRemark?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

export interface MessageItem {
  id: string;
  messageId: string;
  sendRequestId?: string | null;
  senderName: string;
  senderProfile: WechatEntityProfile;
  isSelf: boolean;
  sentAt: string;
  sentAtIso: string;
  status: "normal" | "revoked";
  content: MessageNode;
  standardJson: unknown;
  rawPayload: unknown;
  deliveries: unknown[];
  localSend?: {
    conversationId: string;
    text: string;
    status: "pending" | "failed";
    errorMessage?: string;
    sendRequestId?: string | null;
  };
}

export interface BackendAccount {
  id: string;
  wxid: string;
  nickname?: string | null;
  platformRemark?: string | null;
  onlineStatus?: "online" | "offline" | "unknown";
}

export interface BackendConversation {
  id: string;
  accountId?: string | null;
  peerWxid: string;
  type: "private" | "group";
  name?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | Date | null;
  pinnedAt?: string | Date | null;
  isHidden?: boolean;
  lastOpenedAt?: string | Date | null;
  unreadCount?: number;
  status?: "active" | "inactive";
  app?: { id: string; name: string } | null;
  deliveryFilter?: "all" | "at_only";
  debounceMs?: number | null;
  maxWaitMs?: number | null;
}

export interface BackendMessage {
  id: string;
  messageId: string;
  sendRequestId?: string | null;
  senderWxid: string;
  isSelf: boolean;
  status: "normal" | "revoked";
  sentAt: string | Date;
  renderedText?: string | null;
  senderProfile?: WechatEntityProfile | null;
  payload: unknown;
  webhookEvent?: { rawPayload?: unknown } | null;
  deliveries?: unknown[];
}

export function mapAccountSummary(account: BackendAccount): AccountSummary {
  return {
    id: account.id,
    name: account.platformRemark || account.nickname || account.wxid,
    wxid: account.wxid,
    status: account.onlineStatus ?? "unknown",
  };
}

export function mapConversationSummary(
  conversation: BackendConversation,
): ConversationSummary {
  const originalName = conversation.name || conversation.peerWxid;
  const name = displayNameWithRemark(conversation.platformRemark, conversation.name || undefined) || originalName;
  return {
    id: conversation.id,
    name,
    originalName,
    type: conversation.type,
    lastMessage: conversation.lastMessageText || "暂无消息",
    lastAt: formatShortTime(conversation.lastMessageAt),
    appName: conversation.app?.name,
    unread: conversation.unreadCount ?? 0,
    avatarText: name.trim().slice(0, 1) || "?",
    avatarUrl: conversation.avatarUrl ?? null,
    status: conversation.status ?? "active",
    raw: conversation,
  };
}

export function mapMessageItem(message: BackendMessage): MessageItem {
  const payload = asRecord(message.payload);
  const sender = asRecord(payload?.sender);
  const content = asMessageNode(payload?.content, message.renderedText);
  const senderProfile = normalizeSenderProfile(message.senderProfile, message.senderWxid);
  return {
    id: message.id,
    messageId: message.messageId,
    sendRequestId: message.sendRequestId ?? null,
    senderName:
      readSenderDisplayName(message.senderProfile ?? null) ||
      asString(sender?.name) ||
      asString(sender?.wxid) ||
      senderProfile.wxid,
    senderProfile,
    isSelf: message.isSelf,
    sentAt: formatShortTime(message.sentAt),
    sentAtIso: formatIsoTime(message.sentAt),
    status: message.status,
    content:
      message.status === "revoked"
        ? { type: "system", text: "[已撤回]" }
        : content,
    standardJson: message.payload,
    rawPayload: message.webhookEvent?.rawPayload ?? null,
    deliveries: message.deliveries ?? [],
  };
}

function asMessageNode(value: unknown, fallbackText?: string | null): MessageNode {
  const record = asRecord(value);
  const type = asString(record?.type);
  const text = asString(record?.text) || fallbackText || "[消息]";
  if (!type) return { type: "unsupported", text, rawType: "unknown" };
  return record as MessageNode;
}

function formatIsoTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatShortTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function displayNameWithRemark(remark: string | null | undefined, originalName: string | undefined): string | undefined {
  const normalizedRemark = remark?.trim();
  if (!normalizedRemark) return originalName;
  if (!originalName || originalName === normalizedRemark) return normalizedRemark;
  return `${normalizedRemark}(${originalName})`;
}

function normalizeSenderProfile(profile: WechatEntityProfile | null | undefined, fallbackWxid: string): WechatEntityProfile {
  return {
    wxid: profile?.wxid || fallbackWxid,
    nickname: profile?.nickname ?? null,
    displayName: profile?.displayName ?? null,
    platformRemark: profile?.platformRemark ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    status: profile?.status ?? "unknown",
  };
}

function readSenderDisplayName(profile: WechatEntityProfile | null | undefined): string | undefined {
  if (!profile) return undefined;
  return profile.platformRemark || profile.displayName || profile.nickname || profile.wxid;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}
