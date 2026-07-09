import {
  AlertCircle,
  Clock3,
  Info,
  MessageSquareQuote,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { isFramedMessageNode, MessageNodeView } from "@/components/message/MessageNodeView";
import { Avatar } from "@/components/ui/Avatar";
import { TimeText } from "@/components/ui/TimeText";
import { cn } from "@/lib/utils";
import type { MessageItem } from "@/lib/workspace-data";

export function MessageBubble({
  message,
  startsGroup,
  onShowDetail,
  onOpenContact,
  onRetryLocalSend,
  onDeleteLocalSend,
  onRequestRevoke,
  onQuoteMessage,
}: {
  message: MessageItem;
  startsGroup: boolean;
  onShowDetail: (message: MessageItem) => void;
  onOpenContact: (wxid: string) => void;
  onRetryLocalSend: (message: MessageItem) => void;
  onDeleteLocalSend: (message: MessageItem) => void;
  onRequestRevoke: (message: MessageItem) => void;
  onQuoteMessage: (message: MessageItem) => void;
}) {
  const revokable = useMessageRevokable(message);

  if (message.content.type === "system") {
    return (
      <div
        data-message-group-start={startsGroup ? "true" : "false"}
        className="mx-auto block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
      >
        {message.content.text}
      </div>
    );
  }

  const framedByContent = isFramedMessageNode(message.content);
  const localSend = message.localSend;
  const deliveryStatus = localSend ? null : readDeliveryStatus(message.deliveries);
  const metaAlwaysVisible = Boolean(localSend);
  const showSenderName = !message.isSelf && startsGroup;
  const messageMeta = (
    <div
      data-message-meta={metaAlwaysVisible ? "inline" : "hover-overlay"}
      className={cn(
        "z-10 flex items-center gap-2 whitespace-nowrap rounded-md bg-background/95 text-xs text-muted-foreground transition-opacity duration-120",
        message.isSelf && "justify-end",
        metaAlwaysVisible
          ? "opacity-100"
          : cn(
              "absolute bottom-0 border px-2 py-1 shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              message.isSelf ? "right-full mr-2" : "left-full ml-2",
            ),
      )}
    >
      <TimeText value={message.sentAtIso} className="shrink-0" />
      {message.status === "revoked" ? (
        <span
          title={message.revokedAtIso || undefined}
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          已撤回
        </span>
      ) : null}
      <LocalSendMeta message={message} onRetry={onRetryLocalSend} onDelete={onDeleteLocalSend} />
      {!localSend ? (
        <button
          type="button"
          aria-label={`引用消息 ${message.messageId}`}
          onClick={() => onQuoteMessage(message)}
          className="inline-flex min-w-[56px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 hover:bg-muted"
        >
          <MessageSquareQuote className="size-3" />
          引用
        </button>
      ) : null}
      {!localSend ? (
        <button
          type="button"
          aria-label={`查看消息详情 ${message.messageId}`}
          onClick={() => onShowDetail(message)}
          className="inline-flex min-w-[56px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 hover:bg-muted"
        >
          <Info className="size-3" />
          详情
        </button>
      ) : null}
      {revokable ? (
        <button
          type="button"
          aria-label={`撤回消息 ${message.messageId}`}
          onClick={() => onRequestRevoke(message)}
          className="inline-flex min-w-[56px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"
        >
          <Undo2 className="size-3" />
          撤回
        </button>
      ) : null}
    </div>
  );

  return (
    <article
      data-message-group-start={startsGroup ? "true" : "false"}
      data-message-status={message.status}
      data-local-send-status={localSend?.status}
      className={cn(
        "group relative flex items-start gap-3 rounded-md px-2",
        startsGroup ? "py-1" : "py-0.5",
        message.isSelf && "justify-end",
        message.status === "revoked" && "bg-destructive/5",
      )}
    >
      {!message.isSelf ? (
        startsGroup ? (
          <SenderAvatarButton message={message} alignWithContent={showSenderName} onOpenContact={onOpenContact} />
        ) : (
          <div className="w-8 shrink-0" aria-hidden="true" />
        )
      ) : null}
      <div className={cn("message-bubble flex max-w-[calc(100%_-_200px)] min-w-0 flex-col gap-1", message.isSelf && "items-end")}>
        {showSenderName ? <div className="text-xs text-muted-foreground">{message.senderName}</div> : null}
        <div data-message-content-shell="true" className="relative inline-block max-w-full">
          {localSend?.status === "failed" ? (
            <LocalSendFailureRetry message={message} onRetry={onRetryLocalSend} />
          ) : null}
          <div
            data-message-frame-kind={framedByContent ? "bare" : "bubble"}
            className={cn(
              "block rounded-lg text-left",
              framedByContent
                ? "p-0"
                : cn("px-3 py-2", message.isSelf ? "bg-primary text-primary-foreground" : "border bg-background"),
              localSend?.status === "pending" && "opacity-70",
              localSend?.status === "failed" && !framedByContent && "border border-destructive/50 bg-destructive/10 text-foreground",
            )}
          >
            <MessageNodeView node={message.content} />
          </div>
          {deliveryStatus ? (
            <DeliveryStatusDot
              status={deliveryStatus}
              align={message.isSelf ? "left" : "right"}
              onClick={() => onShowDetail(message)}
            />
          ) : null}
          {!metaAlwaysVisible ? messageMeta : null}
        </div>
        {metaAlwaysVisible ? messageMeta : null}
      </div>
      {message.isSelf ? <SenderAvatarButton message={message} onOpenContact={onOpenContact} /> : null}
    </article>
  );
}

function SenderAvatarButton({
  message,
  alignWithContent = false,
  onOpenContact,
}: {
  message: MessageItem;
  alignWithContent?: boolean;
  onOpenContact: (wxid: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`查看联系人 ${message.senderName}`}
      onClick={() => onOpenContact(message.senderProfile.wxid)}
      className={cn(
        "shrink-0 self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        alignWithContent && "mt-5",
      )}
    >
      <Avatar name={message.senderName} src={message.senderProfile.avatarUrl} size={32} />
    </button>
  );
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
      <span className="rounded-full bg-background px-3 py-1 shadow-sm">{label}</span>
    </div>
  );
}

function DeliveryStatusDot({
  status,
  align,
  onClick,
}: {
  status: string;
  align: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`查看投递状态 ${status}`}
      data-delivery-status={status}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute -top-1 z-10 size-3 rounded-full border border-background shadow-sm ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        align === "right" ? "-right-1" : "-left-1",
        readDeliveryStatusDotClass(status),
      )}
    >
      <span className="sr-only">{status}</span>
    </button>
  );
}

function readDeliveryStatusDotClass(status: string): string {
  const normalizedStatus = status.toLowerCase();
  if (["failed", "dead", "error"].includes(normalizedStatus)) return "bg-destructive";
  if (["delivered", "acked", "success"].includes(normalizedStatus)) return "bg-green-500";
  if (["queued", "pending", "running"].includes(normalizedStatus)) return "bg-blue-500";
  return "bg-muted-foreground";
}

function LocalSendMeta({
  message,
  onRetry,
  onDelete,
}: {
  message: MessageItem;
  onRetry: (message: MessageItem) => void;
  onDelete: (message: MessageItem) => void;
}) {
  const localSend = message.localSend;
  if (!localSend) return null;

  if (localSend.status === "pending") {
    return (
      <>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Clock3 className="size-3" />
          发送中
        </span>
        <button
          type="button"
          aria-label={`删除未发送消息 ${localSend.label}`}
          onClick={() => onDelete(message)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      </>
    );
  }

  return (
    <>
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertCircle className="size-3" />
        发送失败
      </span>
      {localSend.errorMessage ? <span className="max-w-48 truncate text-destructive">{localSend.errorMessage}</span> : null}
      <button
        type="button"
        aria-label={`删除未发送消息 ${localSend.label}`}
        onClick={() => onDelete(message)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
      >
        <Trash2 className="size-3" />
        删除
      </button>
    </>
  );
}

function LocalSendFailureRetry({
  message,
  onRetry,
}: {
  message: MessageItem;
  onRetry: (message: MessageItem) => void;
}) {
  const localSend = message.localSend;
  if (!localSend) return null;

  return (
    <button
      type="button"
      aria-label={`重试发送 ${localSend.label}`}
      title="重试发送"
      data-local-send-retry-position="left"
      onClick={(event) => {
        event.stopPropagation();
        onRetry(message);
      }}
      className="absolute left-0 top-1/2 z-10 flex size-6 -translate-x-[calc(100%+8px)] -translate-y-1/2 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AlertCircle className="size-4" />
    </button>
  );
}

function readDeliveryStatus(deliveries: unknown[]): string | null {
  const first = deliveries[0] as { status?: string } | undefined;
  return first?.status ?? null;
}

function useMessageRevokable(message: MessageItem): boolean {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sentAtMs = readMessageSentAtMs(message);
  const expiresAtMs = sentAtMs + 2 * 60 * 1000;
  const eligible = Boolean(message.isSelf && !message.localSend && message.status === "normal" && message.sendRequestId);

  useEffect(() => {
    if (!eligible || !Number.isFinite(sentAtMs)) return;
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      setNowMs(Date.now());
      return;
    }
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, remainingMs + 250);
    return () => window.clearTimeout(timer);
  }, [eligible, expiresAtMs, sentAtMs]);

  return eligible && nowMs >= sentAtMs && nowMs <= expiresAtMs;
}

function readMessageSentAtMs(message: MessageItem): number {
  if (!message.isSelf || message.localSend || message.status !== "normal" || !message.sendRequestId) return Number.NaN;
  return new Date(message.sentAtIso).getTime();
}
