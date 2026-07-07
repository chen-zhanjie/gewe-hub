import type { QueryObserverResult } from "@tanstack/react-query";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type WorkbenchRealtimeMessageDetail,
  workbenchRealtimeMessageEvent,
} from "@/features/workbench/queries";
import {
  buildVisibleMessages,
  compareMessagesBySentAt,
  createLocalTextSend,
  mergeMessagesById,
  type LocalTextSend,
} from "@/features/workbench/workbench-local-sends";
import {
  mapMessageItem,
  type AccountSummary,
  type BackendMessage,
  type ConversationSummary,
  type MessageItem,
} from "@/lib/workspace-data";

interface WorkbenchMessagesControllerOptions {
  account?: AccountSummary;
  effectiveConversationId: string | null;
  selectedConversation?: ConversationSummary;
  messagesQuery: QueryObserverResult<BackendMessage[], Error>;
  messageListRef: RefObject<HTMLDivElement | null>;
  loadOlderMessages: (conversationId: string, beforeMessageId: string) => Promise<BackendMessage[]>;
  refreshMessages: (conversationId: string) => Promise<BackendMessage[]>;
  sendText: (conversationId: string, text: string) => Promise<{ id: string }>;
}

export function useWorkbenchMessagesController({
  account,
  effectiveConversationId,
  selectedConversation,
  messagesQuery,
  messageListRef,
  loadOlderMessages,
  refreshMessages,
  sendText,
}: WorkbenchMessagesControllerOptions) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [localTextSends, setLocalTextSends] = useState<LocalTextSend[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesConversationIdRef = useRef<string | null>(null);

  const visibleMessages = useMemo(
    () => buildVisibleMessages(messages, localTextSends, effectiveConversationId, account),
    [account, effectiveConversationId, localTextSends, messages],
  );

  useEffect(() => {
    const nextMessages = (messagesQuery.data ?? []).map(mapMessageItem).reverse();
    const sameConversation = messagesConversationIdRef.current === effectiveConversationId;
    messagesConversationIdRef.current = effectiveConversationId;
    setMessages((currentMessages) =>
      sameConversation
        ? mergeMessagesById([...nextMessages, ...currentMessages]).sort(compareMessagesBySentAt)
        : nextMessages,
    );
    setHasMoreHistory(nextMessages.length > 0);
    setHistoryError(null);
    if (!sameConversation) setNewMessageCount(0);
  }, [effectiveConversationId, messagesQuery.data]);

  useEffect(() => {
    function handleRealtimeMessage(event: Event) {
      const detail = (event as CustomEvent<WorkbenchRealtimeMessageDetail>).detail;
      if (!detail?.message || detail.conversationId !== effectiveConversationId) return;
      const shouldStickToBottom = isMessageListNearBottom(messageListRef.current);
      const nextMessage = mapMessageItem(detail.message);
      setMessages((currentMessages) =>
        mergeMessagesById([...currentMessages, nextMessage]).sort(compareMessagesBySentAt),
      );
      setHasMoreHistory(true);
      if (shouldStickToBottom) {
        window.requestAnimationFrame(scrollMessageListToBottom);
      } else {
        setNewMessageCount((count) => count + 1);
      }
    }

    window.addEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
    return () => window.removeEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
  }, [effectiveConversationId, messageListRef]);

  useEffect(() => {
    const serverSendRequestIds = new Set(messages.map((message) => message.sendRequestId).filter(Boolean));
    if (serverSendRequestIds.size === 0) return;
    setLocalTextSends((currentSends) =>
      currentSends.filter((send) => !send.sendRequestId || !serverSendRequestIds.has(send.sendRequestId)),
    );
  }, [messages]);

  async function handleLoadOlderMessages() {
    const oldestMessageId = messages[0]?.messageId;
    if (!effectiveConversationId || !oldestMessageId || loadingHistory) return;

    const previousScrollHeight = messageListRef.current?.scrollHeight ?? 0;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const olderMessages = (await loadOlderMessages(effectiveConversationId, oldestMessageId)).map(mapMessageItem).reverse();
      setHasMoreHistory(olderMessages.length > 0);
      setMessages((currentMessages) => mergeMessagesById([...olderMessages, ...currentMessages]));
      window.requestAnimationFrame(() => {
        const list = messageListRef.current;
        if (!list) return;
        list.scrollTop += list.scrollHeight - previousScrollHeight;
      });
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "加载历史消息失败");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSendText(text: string) {
    const trimmedText = text.trim();
    if (!selectedConversation || !trimmedText) return false;

    const localSend = createLocalTextSend(selectedConversation.id, trimmedText);
    setLocalTextSends((currentSends) => [...currentSends, localSend]);
    await submitLocalTextSend(localSend);
    return true;
  }

  async function submitLocalTextSend(localSend: LocalTextSend) {
    try {
      const response = await sendText(localSend.conversationId, localSend.text);
      setLocalTextSends((currentSends) =>
        currentSends.map((send) =>
          send.id === localSend.id
            ? { ...send, status: "pending", errorMessage: undefined, sendRequestId: response.id }
            : send,
        ),
      );
      await refreshMessages(localSend.conversationId);
    } catch (sendError) {
      setLocalTextSends((currentSends) =>
        currentSends.map((send) =>
          send.id === localSend.id
            ? {
                ...send,
                status: "failed",
                errorMessage: sendError instanceof Error ? sendError.message : "发送失败",
              }
            : send,
        ),
      );
    }
  }

  function retryLocalTextSend(message: MessageItem) {
    const localSend = message.localSend;
    if (!localSend) return;
    const nextSend: LocalTextSend = {
      id: message.id,
      conversationId: localSend.conversationId,
      text: localSend.text,
      status: "pending",
      sendRequestId: null,
      createdAtIso: message.sentAtIso || new Date().toISOString(),
    };
    setLocalTextSends((currentSends) =>
      currentSends.map((send) =>
        send.id === nextSend.id
          ? {
              ...send,
              status: "pending",
              errorMessage: undefined,
              sendRequestId: null,
            }
          : send,
      ),
    );
    void submitLocalTextSend(nextSend);
  }

  function deleteLocalTextSend(message: MessageItem) {
    setLocalTextSends((currentSends) => currentSends.filter((send) => send.id !== message.id));
  }

  function scrollMessageListToBottom() {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    setNewMessageCount(0);
  }

  function handleMessageListScroll() {
    if (isMessageListNearBottom(messageListRef.current)) {
      setNewMessageCount(0);
    }
  }

  return {
    messages,
    visibleMessages,
    newMessageCount,
    loadingHistory,
    hasMoreHistory,
    historyError,
    handleLoadOlderMessages,
    handleSendText,
    retryLocalTextSend,
    deleteLocalTextSend,
    scrollMessageListToBottom,
    handleMessageListScroll,
  };
}

function isMessageListNearBottom(list: HTMLDivElement | null): boolean {
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight <= 80;
}
