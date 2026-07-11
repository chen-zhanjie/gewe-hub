import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

const messageRevokeWindowMs = 2 * 60 * 1000;

export interface MessageActionCapabilities {
  canQuote: boolean;
  canShowDetail: boolean;
  canDispatchHeld: boolean;
  canRevoke: boolean;
  canRetryLocalSend: boolean;
  canDeleteLocalSend: boolean;
}

export interface ConversationActionCapabilities {
  canTogglePinned: boolean;
  pinned: boolean;
  canHide: boolean;
  canMarkRead: boolean;
  canEditRemark: boolean;
  canManage: boolean;
}

export function getMessageActionCapabilities(
  message: MessageItem,
  nowMs = Date.now(),
): MessageActionCapabilities {
  const localSend = message.localSend;
  if (localSend) {
    const failed = localSend.status === "failed";
    return {
      canQuote: false,
      canShowDetail: false,
      canDispatchHeld: false,
      canRevoke: false,
      canRetryLocalSend: failed,
      canDeleteLocalSend: failed,
    };
  }

  const unsent = message.isSent === false;
  const sentAtMs = new Date(message.sentAtIso).getTime();
  const revokeEligible = Boolean(
    message.isSelf &&
      !unsent &&
      message.status === "normal" &&
      message.sendRequest?.status !== "held" &&
      message.sendRequestId &&
      Number.isFinite(sentAtMs) &&
      nowMs >= sentAtMs &&
      nowMs <= sentAtMs + messageRevokeWindowMs,
  );

  return {
    canQuote: true,
    canShowDetail: true,
    canDispatchHeld: Boolean(unsent && message.sendRequest?.status === "held"),
    canRevoke: revokeEligible,
    canRetryLocalSend: false,
    canDeleteLocalSend: false,
  };
}

export function getConversationActionCapabilities(
  conversation: ConversationSummary,
): ConversationActionCapabilities {
  return {
    canTogglePinned: true,
    pinned: Boolean(conversation.raw.pinnedAt),
    canHide: true,
    canMarkRead: conversation.unread > 0,
    canEditRemark: true,
    canManage: true,
  };
}
