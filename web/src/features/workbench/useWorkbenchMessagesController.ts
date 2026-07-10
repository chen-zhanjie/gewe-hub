import type { QueryObserverResult } from "@tanstack/react-query";
import type { MessageNode } from "@gewehub/contracts";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type WorkbenchRealtimeMessageDetail,
  type WorkbenchSendResponse,
  workbenchRealtimeMessageEvent,
} from "@/features/workbench/queries";
import {
  attachPayloadToLocalSend,
  buildVisibleMessages,
  compareMessagesBySentAt,
  createLocalMediaSend,
  createLocalMediaPlaceholder,
  createLocalTextSend,
  mergeMessagesById,
  type LocalSend,
} from "@/features/workbench/workbench-local-sends";
import {
  type LocalSendPayload,
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
  sendText: (conversationId: string, text: string, options?: SendTextOptions) => Promise<WorkbenchSendResponse>;
  sendPayload: (conversationId: string, payload: LocalSendPayload) => Promise<WorkbenchSendResponse>;
}

export interface SendTextOptions {
  mentions?: string[];
  replyToMessageId?: string;
  quotePreview?: MessageNode;
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
  sendPayload,
}: WorkbenchMessagesControllerOptions) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [localSends, setLocalSendsState] = useState<LocalSend[]>([]);
  const localSendsRef = useRef<LocalSend[]>([]);
  const scrollFrameIdsRef = useRef<number[]>([]);
  const pendingInitialScrollConversationIdRef = useRef<string | null>(null);
  const userScrolledAwayConversationIdRef = useRef<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesConversationIdRef = useRef<string | null>(null);

  const visibleMessages = useMemo(
    () => buildVisibleMessages(messages, localSends, effectiveConversationId, account),
    [account, effectiveConversationId, localSends, messages],
  );

  useEffect(() => {
    const nextMessages = (messagesQuery.data ?? []).map(mapMessageItem).reverse();
    const sameConversation = messagesConversationIdRef.current === effectiveConversationId;
    if (!sameConversation) {
      pendingInitialScrollConversationIdRef.current =
        userScrolledAwayConversationIdRef.current === effectiveConversationId ? null : effectiveConversationId;
    }
    const pendingInitialScroll = pendingInitialScrollConversationIdRef.current === effectiveConversationId;
    const shouldAutoScroll =
      Boolean(effectiveConversationId) &&
      nextMessages.length > 0 &&
      (pendingInitialScroll || isMessageListNearBottom(messageListRef.current));
    messagesConversationIdRef.current = effectiveConversationId;
    setMessages((currentMessages) =>
      sameConversation
        ? mergeMessagesById([...nextMessages, ...currentMessages]).sort(compareMessagesBySentAt)
        : nextMessages,
    );
    setHasMoreHistory(nextMessages.length > 0);
    setHistoryError(null);
    if (!sameConversation) setNewMessageCount(0);
    if (shouldAutoScroll) {
      pendingInitialScrollConversationIdRef.current = null;
      scheduleScrollMessageListToBottom();
    }
  }, [effectiveConversationId, messageListRef, messagesQuery.data]);

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
        scheduleScrollMessageListToBottom();
      } else {
        setNewMessageCount((count) => count + 1);
      }
    }

    window.addEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
    return () => window.removeEventListener(workbenchRealtimeMessageEvent, handleRealtimeMessage);
  }, [effectiveConversationId, messageListRef]);

  useEffect(() => {
    const serverMessageIds = new Set(messages.map((message) => message.messageId).filter(Boolean));
    const serverSendRequestIds = new Set(messages.map((message) => message.sendRequestId).filter(Boolean));
    if (serverMessageIds.size === 0 && serverSendRequestIds.size === 0) return;
    updateLocalSends((currentSends) =>
      currentSends.filter(
        (send) =>
          (!send.messageId || !serverMessageIds.has(send.messageId)) &&
          (!send.sendRequestId || !serverSendRequestIds.has(send.sendRequestId)),
      ),
    );
  }, [messages]);

  useEffect(() => {
    return () => {
      cancelScheduledScrolls();
    };
  }, []);

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

  async function handleSendText(text: string, options: SendTextOptions = {}) {
    const trimmedText = text.trim();
    if (!selectedConversation || !trimmedText) return false;

    const localSend = createLocalTextSend(selectedConversation.id, trimmedText, {
      mentions: options.mentions?.length ? options.mentions : undefined,
      replyToMessageId: options.replyToMessageId,
      quotePreview: options.quotePreview,
    });
    updateLocalSends((currentSends) => [...currentSends, localSend]);
    scheduleScrollMessageListToBottom();
    void submitLocalSend(localSend);
    return true;
  }

  function handleSendPayload(payload: LocalSendPayload) {
    if (!selectedConversation) return false;

    const localSend = createLocalMediaSend(selectedConversation.id, payload);
    updateLocalSends((currentSends) => [...currentSends, localSend]);
    scheduleScrollMessageListToBottom();
    void submitLocalSend(localSend);
    return true;
  }

  function createLocalSendPlaceholder(payload: Pick<LocalSendPayload, "type" | "fileName" | "mimeType" | "thumbUrl" | "durationMs">) {
    if (!selectedConversation) return null;

    const localSend = createLocalMediaPlaceholder(selectedConversation.id, payload);
    updateLocalSends((currentSends) => [...currentSends, localSend]);
    scheduleScrollMessageListToBottom();
    return localSend.id;
  }

  function submitLocalSendPayload(localSendId: string, payload: LocalSendPayload) {
    const currentSend = localSendsRef.current.find((send) => send.id === localSendId);
    if (!currentSend) return;
    const nextSend = attachPayloadToLocalSend(
      {
        ...currentSend,
        status: "pending",
        errorMessage: undefined,
        sendRequestId: null,
      },
      payload,
    );
    updateLocalSends((currentSends) =>
      currentSends.map((send) => {
        if (send.id !== localSendId) return send;
        return nextSend;
      }),
    );
    void submitLocalSend(nextSend);
  }

  function failLocalSend(localSendId: string, errorMessage: string) {
    updateLocalSends((currentSends) =>
      currentSends.map((send) =>
        send.id === localSendId
          ? {
              ...send,
              status: "failed",
              errorMessage,
            }
          : send,
      ),
    );
  }

  function updateLocalSends(updater: (currentSends: LocalSend[]) => LocalSend[]) {
    const nextSends = updater(localSendsRef.current);
    localSendsRef.current = nextSends;
    setLocalSendsState(nextSends);
  }

  async function submitLocalSend(localSend: LocalSend) {
    let response: WorkbenchSendResponse;
    try {
      response =
        localSend.type === "text"
          ? await sendText(localSend.conversationId, localSend.text, {
              mentions: localSend.mentions,
              replyToMessageId: localSend.replyToMessageId,
            })
          : await sendPayload(localSend.conversationId, readLocalSendPayload(localSend));
      const messageId = readSuccessfulMessageId(response);
      updateLocalSends((currentSends) =>
        currentSends.map((send) =>
          send.id === localSend.id
            ? {
                ...send,
                status: "pending",
                errorMessage: undefined,
                messageId,
                sendRequestId: null,
                sendPayload:
                  response.url && send.type === "html" && send.sendPayload
                    ? { ...send.sendPayload, resolvedUrl: response.url }
                    : send.sendPayload,
              }
            : send,
        ),
      );
    } catch (sendError) {
      updateLocalSends((currentSends) =>
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
      return;
    }

    try {
      await refreshMessages(localSend.conversationId);
    } catch {
      // 发送已经成功；刷新失败时保留本地 pending 气泡，等待后续查询或实时消息按 messageId 替换。
    }
  }

  function retryLocalSend(message: MessageItem) {
    const localSend = message.localSend;
    if (!localSend) return;
    const nextSend: LocalSend = {
      id: message.id,
      conversationId: localSend.conversationId,
      type: localSend.type,
      text: localSend.text,
      mentions: localSend.mentions,
      replyToMessageId: localSend.replyToMessageId,
      quotePreview: localSend.quotePreview,
      label: localSend.label,
      fileName: localSend.sendPayload?.fileName,
      mimeType: localSend.sendPayload?.mimeType,
      thumbUrl: localSend.sendPayload?.thumbUrl,
      durationMs: localSend.sendPayload?.durationMs,
      status: "pending",
      messageId: null,
      sendRequestId: null,
      sendPayload: localSend.sendPayload,
      createdAtIso: message.sentAtIso || new Date().toISOString(),
    };
    updateLocalSends((currentSends) =>
      currentSends.map((send) =>
        send.id === nextSend.id
          ? {
              ...send,
              status: "pending",
              errorMessage: undefined,
              messageId: null,
              sendRequestId: null,
            }
          : send,
      ),
    );
    void submitLocalSend(nextSend);
  }

  function deleteLocalSend(message: MessageItem) {
    updateLocalSends((currentSends) => currentSends.filter((send) => send.id !== message.id));
  }

  function scrollMessageListToBottom() {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    if (userScrolledAwayConversationIdRef.current === effectiveConversationId) {
      userScrolledAwayConversationIdRef.current = null;
    }
    setNewMessageCount(0);
  }

  function scheduleScrollMessageListToBottom() {
    cancelScheduledScrolls();
    const firstFrameId = window.requestAnimationFrame(() => {
      scrollMessageListToBottom();
      const secondFrameId = window.requestAnimationFrame(scrollMessageListToBottom);
      scrollFrameIdsRef.current.push(secondFrameId);
    });
    scrollFrameIdsRef.current.push(firstFrameId);
  }

  function cancelScheduledScrolls() {
    for (const frameId of scrollFrameIdsRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    scrollFrameIdsRef.current = [];
  }

  function handleMessageListScroll() {
    if (isMessageListNearBottom(messageListRef.current)) {
      if (userScrolledAwayConversationIdRef.current === effectiveConversationId) {
        userScrolledAwayConversationIdRef.current = null;
      }
      setNewMessageCount(0);
      return;
    }
    userScrolledAwayConversationIdRef.current = effectiveConversationId;
    pendingInitialScrollConversationIdRef.current = null;
    cancelScheduledScrolls();
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
    handleSendPayload,
    createLocalSendPlaceholder,
    submitLocalSendPayload,
    failLocalSend,
    retryLocalSend,
    deleteLocalSend,
    scrollMessageListToBottom,
    handleMessageListScroll,
  };
}

function readLocalSendPayload(localSend: LocalSend): LocalSendPayload {
  if (localSend.sendPayload) return localSend.sendPayload;
  throw new Error("本地发送缺少重试 payload");
}

function readSuccessfulMessageId(response: WorkbenchSendResponse): string {
  const candidate = response as Partial<WorkbenchSendResponse>;
  if (candidate.success !== true || typeof candidate.messageId !== "string" || !candidate.messageId.trim()) {
    throw new Error("发送结果未知");
  }
  return candidate.messageId;
}

function isMessageListNearBottom(list: HTMLDivElement | null): boolean {
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight <= 80;
}
