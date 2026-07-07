import type { AccountSummary, MessageItem } from "@/lib/workspace-data";

export interface LocalTextSend {
  id: string;
  conversationId: string;
  text: string;
  status: "pending" | "failed";
  errorMessage?: string;
  sendRequestId?: string | null;
  createdAtIso: string;
}

export function mergeMessagesById(messages: MessageItem[]): MessageItem[] {
  const seen = new Set<string>();
  const merged: MessageItem[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}

export function buildVisibleMessages(
  serverMessages: MessageItem[],
  localTextSends: LocalTextSend[],
  conversationId: string | null,
  account?: AccountSummary,
): MessageItem[] {
  const serverSendRequestIds = new Set(serverMessages.map((message) => message.sendRequestId).filter(Boolean));
  const localMessages = localTextSends
    .filter((send) => send.conversationId === conversationId)
    .filter((send) => !send.sendRequestId || !serverSendRequestIds.has(send.sendRequestId))
    .map((send) => mapLocalTextSendToMessageItem(send, account));

  return [...serverMessages, ...localMessages].sort(compareMessagesBySentAt);
}

export function mapLocalTextSendToMessageItem(send: LocalTextSend, account?: AccountSummary): MessageItem {
  const senderName = account?.name ?? "我";
  const wxid = account?.wxid ?? "self";
  const standardJson = {
    local: true,
    type: "text",
    text: send.text,
    status: send.status,
    sendRequestId: send.sendRequestId ?? null,
  };

  return {
    id: send.id,
    messageId: send.id,
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
    content: { type: "text", text: send.text },
    standardJson,
    rawPayload: null,
    deliveries: [],
    localSend: {
      conversationId: send.conversationId,
      text: send.text,
      status: send.status,
      errorMessage: send.errorMessage,
      sendRequestId: send.sendRequestId ?? null,
    },
  };
}

export function compareMessagesBySentAt(left: MessageItem, right: MessageItem): number {
  const leftTime = Date.parse(left.sentAtIso);
  const rightTime = Date.parse(right.sentAtIso);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return 0;
}

export function createLocalTextSend(conversationId: string, text: string): LocalTextSend {
  return {
    id: `local_text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    text,
    status: "pending",
    createdAtIso: new Date().toISOString(),
  };
}
