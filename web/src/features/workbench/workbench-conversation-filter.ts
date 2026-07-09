import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

export function filterConversationsForAccount(
  conversations: ConversationSummary[],
  accountId: AccountSummary["id"] | null,
) {
  return conversations.filter((conversation) => {
    if (conversation.raw.isHidden) return false;
    if (!accountId) return true;
    return !conversation.raw.accountId || conversation.raw.accountId === accountId;
  });
}
