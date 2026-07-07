import { observeElementRect, type Rect, type Virtualizer, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import type { DragEvent, ReactNode, RefObject } from "react";
import { DateSeparator, MessageBubble } from "@/features/workbench/MessageFlow";
import { buildMessageTimeline, type MessageTimelineItem } from "@/features/workbench/message-timeline";
import { cn } from "@/lib/utils";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

interface MessagePanelProps {
  selectedConversation: ConversationSummary | undefined;
  messages: MessageItem[];
  visibleMessages: MessageItem[];
  newMessageCount: number;
  attachmentDragActive: boolean;
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  historyError: string | null;
  messageListRef: RefObject<HTMLDivElement | null>;
  onAttachmentDragEnter: (event: DragEvent<HTMLElement>) => void;
  onAttachmentDragOver: (event: DragEvent<HTMLElement>) => void;
  onAttachmentDragLeave: (event: DragEvent<HTMLElement>) => void;
  onAttachmentDrop: (event: DragEvent<HTMLElement>) => void;
  onMessageListScroll: () => void;
  onJumpToNewMessages: () => void;
  onLoadOlderMessages: () => void;
  onShowMessageDetail: (message: MessageItem) => void;
  onOpenContactProfile: (wxid: string) => void;
  onRetryLocalSend: (message: MessageItem) => void;
  onDeleteLocalSend: (message: MessageItem) => void;
  children: ReactNode;
}

export function MessagePanel({
  selectedConversation,
  messages,
  visibleMessages,
  newMessageCount,
  attachmentDragActive,
  hasMoreHistory,
  loadingHistory,
  historyError,
  messageListRef,
  onAttachmentDragEnter,
  onAttachmentDragOver,
  onAttachmentDragLeave,
  onAttachmentDrop,
  onMessageListScroll,
  onJumpToNewMessages,
  onLoadOlderMessages,
  onShowMessageDetail,
  onOpenContactProfile,
  onRetryLocalSend,
  onDeleteLocalSend,
  children,
}: MessagePanelProps) {
  const messageTimeline = buildMessageTimeline(visibleMessages);
  const messageVirtualizer = useVirtualizer({
    count: messageTimeline.length,
    getScrollElement: () => messageListRef.current,
    estimateSize: (index) => estimateMessageTimelineItemSize(messageTimeline[index]),
    overscan: 6,
    initialRect: { width: 720, height: 640 },
    observeElementRect: observeMessageListRect,
  });

  return (
    <section
      aria-label="消息区"
      className="relative flex min-w-0 flex-1 flex-col bg-muted/30"
      onDragEnter={onAttachmentDragEnter}
      onDragOver={onAttachmentDragOver}
      onDragLeave={onAttachmentDragLeave}
      onDrop={onAttachmentDrop}
    >
      {attachmentDragActive && selectedConversation ? (
        <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-lg border border-dashed border-primary bg-background/90 text-sm font-medium text-primary">
          松开发送给 {selectedConversation.name}
        </div>
      ) : null}
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
        <div>
          <h2 className="text-sm font-medium">{selectedConversation?.name ?? "未选择会话"}</h2>
          <p className="text-xs text-muted-foreground">
            {selectedConversation?.appName ? `已绑定 ${selectedConversation.appName}` : "未绑定应用"}
          </p>
        </div>
      </div>
      <div ref={messageListRef} onScroll={onMessageListScroll} className="min-h-0 flex-1 overflow-y-auto p-6">
        {messages.length > 0 && hasMoreHistory ? (
          <div className="mb-4 text-center">
            <button
              type="button"
              disabled={loadingHistory}
              onClick={onLoadOlderMessages}
              className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingHistory ? "加载中" : "加载更早消息"}
            </button>
          </div>
        ) : null}
        {historyError ? <div className="mb-4 text-center text-xs text-destructive">{historyError}</div> : null}
        {!selectedConversation ? <div className="text-center text-sm text-muted-foreground">暂无会话</div> : null}
        {selectedConversation && visibleMessages.length === 0 ? <div className="text-center text-sm text-muted-foreground">暂无消息</div> : null}
        {visibleMessages.length > 0 ? (
          <div className="relative mt-4 w-full" style={{ height: `${messageVirtualizer.getTotalSize()}px` }}>
            {messageVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = messageTimeline[virtualItem.index];
              if (!item) return null;
              return (
                <div
                  key={item.key}
                  ref={messageVirtualizer.measureElement}
                  data-index={virtualItem.index}
                  data-message-timeline-spacing={
                    item.type === "message" && !item.startsGroup ? "compact" : "normal"
                  }
                  className={cn(
                    "absolute left-0 top-0 w-full",
                    item.type === "message" && !item.startsGroup ? "py-0.5" : "py-2",
                  )}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {item.type === "date" ? (
                    <DateSeparator label={item.label} />
                  ) : (
                    <MessageBubble
                      message={item.message}
                      startsGroup={item.startsGroup}
                      onShowDetail={onShowMessageDetail}
                      onOpenContact={onOpenContactProfile}
                      onRetryLocalSend={onRetryLocalSend}
                      onDeleteLocalSend={onDeleteLocalSend}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {newMessageCount > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 z-10 flex justify-center">
          <button
            type="button"
            aria-label={`跳到 ${newMessageCount} 条新消息`}
            onClick={onJumpToNewMessages}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-sm font-medium text-primary shadow-md"
          >
            <ArrowDown className="size-4" />
            {newMessageCount} 条新消息
          </button>
        </div>
      ) : null}
      {children}
    </section>
  );
}

function observeElementRectWithFallback(fallback: Rect) {
  return <TScrollElement extends Element, TItemElement extends Element>(
    instance: Virtualizer<TScrollElement, TItemElement>,
    callback: (rect: Rect) => void,
  ) => {
    const unsubscribe = observeElementRect(instance, (rect) => {
      callback(rect.width > 0 && rect.height > 0 ? rect : fallback);
    });
    callback(fallback);
    return unsubscribe;
  };
}

const observeMessageListRect = observeElementRectWithFallback({ width: 720, height: 640 });

function estimateMessageTimelineItemSize(item: MessageTimelineItem | undefined): number {
  if (!item) return 96;
  if (item.type === "date") return 40;
  if (item.message.content.type === "system") return 48;
  if (["image", "video"].includes(item.message.content.type)) return 220;
  if (["file", "link", "mini_program", "chat_record", "quote", "card", "location", "transfer", "red_packet"].includes(item.message.content.type)) {
    return 120;
  }
  return 64;
}
