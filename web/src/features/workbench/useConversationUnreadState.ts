import { useEffect, useMemo, useState } from "react";
import {
  type WorkbenchRealtimeMessageDetail,
  workbenchRealtimeMessageEvent,
} from "@/features/workbench/queries";
import type { ConversationSummary } from "@/lib/workspace-data";

export function useConversationUnreadState(
  conversations: ConversationSummary[],
  selectedConversationId: string | null,
) {
  const [unreadByConversationId, setUnreadByConversationId] = useState<Record<string, number>>({});

  useEffect(() => {
    function handleRealtimeMessage(event: Event) {
      const detail = (event as CustomEvent<WorkbenchRealtimeMessageDetail>).detail;
      const conversationId = detail?.conversationId;
      if (!conversationId || conversationId === selectedConversationId) return;
      setUnreadByConversationId((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? 0) + 1,
      }));
    }

    window.addEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
    return () => window.removeEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
  }, [selectedConversationId]);

  const conversationsWithUnread = useMemo(
    () =>
      conversations.map((conversation) => ({
        ...conversation,
        unread: unreadByConversationId[conversation.id] ?? conversation.unread,
      })),
    [conversations, unreadByConversationId],
  );

  function clearConversationUnread(conversationId: string | null) {
    if (!conversationId) return;
    setUnreadByConversationId((current) => {
      if (!current[conversationId]) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }

  return {
    conversationsWithUnread,
    clearConversationUnread,
  };
}
