import {
  AlertCircle,
  Clock3,
  MoreHorizontal,
  SendHorizontal,
} from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { MessageNodeView } from "@/components/message/MessageNodeView";
import { Avatar } from "@/components/ui/Avatar";
import { TimeText } from "@/components/ui/TimeText";
import { buildMessageTimeline } from "@/features/workbench/message-timeline";
import { cn } from "@/lib/utils";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

const longPressDelayMs = 500;

export function MobileMessageList({
  conversation,
  messages,
  messageListRef,
  loading,
  loadingHistory,
  hasMoreHistory,
  historyError,
  newMessageCount,
  dispatchingMessageId,
  onScroll,
  onLoadOlder,
  onJumpToNewMessages,
  onOpenActions,
  onOpenContact,
}: {
  conversation?: ConversationSummary;
  messages: MessageItem[];
  messageListRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingHistory: boolean;
  hasMoreHistory: boolean;
  historyError: string | null;
  newMessageCount: number;
  dispatchingMessageId?: string | null;
  onScroll: () => void;
  onLoadOlder: () => void;
  onJumpToNewMessages: () => void;
  onOpenActions: (message: MessageItem) => void;
  onOpenContact?: (wxid: string) => void;
}) {
  const timeline = buildMessageTimeline(messages);
  return (
    <div className="relative min-h-0 flex-1 bg-muted/30">
      <div
        ref={messageListRef}
        aria-label="消息区"
        onScroll={onScroll}
        className="h-full overflow-y-auto px-3 py-4"
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            正在加载消息
          </div>
        ) : null}
        {!loading && messages.length > 0 && hasMoreHistory ? (
          <div className="pb-3 text-center">
            <button
              type="button"
              disabled={loadingHistory}
              onClick={onLoadOlder}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
            >
              {loadingHistory ? "加载中" : "加载更早消息"}
            </button>
          </div>
        ) : null}
        {historyError ? (
          <div className="pb-3 text-center text-xs text-destructive">
            {historyError}
          </div>
        ) : null}
        {!loading && !conversation ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无会话
          </div>
        ) : null}
        {!loading && conversation && messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无消息
          </div>
        ) : null}
        <div className="space-y-1">
          {timeline.map((item) =>
            item.type === "date" ? (
              <div
                key={item.key}
                className="flex justify-center py-2 text-xs text-muted-foreground"
              >
                <span className="rounded-full bg-background/90 px-3 py-1">
                  {item.label}
                </span>
              </div>
            ) : (
              <MobileMessageBubble
                key={item.key}
                message={item.message}
                startsGroup={item.startsGroup}
                isGroup={conversation?.type === "group"}
                dispatching={dispatchingMessageId === item.message.id}
                onOpenActions={onOpenActions}
                onOpenContact={onOpenContact}
              />
            ),
          )}
        </div>
      </div>
      {newMessageCount > 0 ? (
        <button
          type="button"
          aria-label={`跳到 ${newMessageCount} 条新消息`}
          onClick={onJumpToNewMessages}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium text-primary shadow-md"
        >
          {newMessageCount} 条新消息
        </button>
      ) : null}
    </div>
  );
}

function MobileMessageBubble({
  message,
  startsGroup,
  isGroup,
  dispatching,
  onOpenActions,
  onOpenContact,
}: {
  message: MessageItem;
  startsGroup: boolean;
  isGroup: boolean;
  dispatching: boolean;
  onOpenActions: (message: MessageItem) => void;
  onOpenContact?: (wxid: string) => void;
}) {
  const timerRef = useRef<number | null>(null);
  const [longPressed, setLongPressed] = useState(false);
  const localSend = message.localSend;
  const unsent = !localSend && message.isSent === false;
  const held = unsent && message.sendRequest?.status === "held";
  const dispatchPending = unsent && message.sendRequest?.status === "pending";
  const showSender = isGroup && !message.isSelf && startsGroup;
  const actionLabel =
    message.localSend?.label || message.content.text || message.messageId;
  if (message.content.type === "system")
    return (
      <div className="flex justify-center py-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-3 py-1">
          {message.content.text}
        </span>
      </div>
    );
  function clearLongPress() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  function startLongPress() {
    setLongPressed(false);
    clearLongPress();
    timerRef.current = window.setTimeout(() => {
      setLongPressed(true);
      onOpenActions(message);
    }, longPressDelayMs);
  }
  return (
    <article
      data-message-direction={message.isSelf ? "outgoing" : "incoming"}
      data-message-group-start={startsGroup ? "true" : "false"}
      className={cn(
        "flex items-start gap-2",
        message.isSelf && "flex-row-reverse",
        startsGroup ? "pt-2" : "pt-0.5",
        unsent && "opacity-70",
      )}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerMove={clearLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenActions(message);
      }}
      onClick={(event) => {
        if (longPressed) event.preventDefault();
      }}
    >
      {startsGroup ? (
        <button
          type="button"
          aria-label={`查看联系人 ${message.senderName}`}
          onClick={() => onOpenContact?.(message.senderProfile.wxid)}
          className="shrink-0 rounded-full"
        >
          <Avatar
            name={message.senderName}
            src={message.senderProfile.avatarUrl}
            size={32}
          />
        </button>
      ) : (
        <div className="w-8 shrink-0" aria-hidden="true" />
      )}
      <div
        className={cn(
          "min-w-0 max-w-[78%]",
          message.isSelf && "items-end text-right",
        )}
      >
        {showSender ? (
          <div className="mb-1 px-1 text-xs text-muted-foreground">
            {message.senderName}
          </div>
        ) : null}
        <div className="flex items-end gap-1">
          {message.isSelf ? (
            <MessageStatus message={message} dispatching={dispatching} />
          ) : null}
          <div
            className={cn(
              "min-w-0 rounded-xl px-3 py-2 text-left",
              message.isSelf
                ? "bg-primary text-primary-foreground"
                : "border bg-background",
              localSend?.status === "failed" &&
                "border-destructive/50 bg-destructive/10 text-foreground",
              held &&
                "border border-dashed border-amber-400 bg-amber-50 text-amber-950",
              unsent && !held && "border-dashed bg-muted text-muted-foreground",
            )}
          >
            {message.status === "revoked" ? (
              <span className="text-sm text-muted-foreground">消息已撤回</span>
            ) : (
              <MessageNodeView node={message.content} />
            )}
          </div>
          <button
            type="button"
            aria-label={`${actionLabel} 更多操作`}
            onClick={() => onOpenActions(message)}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
        <div
          className={cn(
            "mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground",
            message.isSelf && "justify-end",
          )}
        >
          <TimeText value={message.sentAtIso} />
          {localSend?.status === "failed" ? (
            <span className="text-destructive">发送失败</span>
          ) : null}
          {localSend?.status === "pending" ? <span>发送中</span> : null}
          {held ? (
            <span>
              {message.sendRequest?.deliveryMode === "discard"
                ? "未发送"
                : "待确认"}
            </span>
          ) : null}
          {dispatchPending || dispatching ? <span>发送中</span> : null}
        </div>
      </div>
    </article>
  );
}

function MessageStatus({
  message,
  dispatching,
}: {
  message: MessageItem;
  dispatching: boolean;
}) {
  if (message.localSend?.status === "failed")
    return (
      <AlertCircle
        aria-hidden="true"
        className="mb-2 size-4 text-destructive"
      />
    );
  if (message.localSend?.status === "pending")
    return (
      <Clock3
        aria-hidden="true"
        className="mb-2 size-4 text-muted-foreground"
      />
    );
  if (
    dispatching ||
    (message.isSent === false && message.sendRequest?.status === "pending")
  )
    return (
      <SendHorizontal
        aria-hidden="true"
        className="mb-2 size-4 text-muted-foreground"
      />
    );
  return null;
}
