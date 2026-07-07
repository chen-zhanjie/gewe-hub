import {
  AlertCircle,
  Clock3,
  Info,
  RotateCw,
  Trash2,
} from "lucide-react";
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
}: {
  message: MessageItem;
  startsGroup: boolean;
  onShowDetail: (message: MessageItem) => void;
  onOpenContact: (wxid: string) => void;
  onRetryLocalSend: (message: MessageItem) => void;
  onDeleteLocalSend: (message: MessageItem) => void;
}) {
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
  const metaAlwaysVisible = message.status === "revoked" || localSend?.status === "failed";

  return (
    <article
      data-message-group-start={startsGroup ? "true" : "false"}
      data-message-status={message.status}
      className={cn(
        "group flex gap-3 rounded-md px-2 py-1",
        message.isSelf && "justify-end",
        !startsGroup && "pt-1",
        message.status === "revoked" && "bg-destructive/5",
      )}
    >
      {!message.isSelf ? (
        startsGroup ? (
          <SenderAvatarButton message={message} onOpenContact={onOpenContact} />
        ) : (
          <div className="w-8 shrink-0" aria-hidden="true" />
        )
      ) : null}
      <div className={cn("message-bubble space-y-1", message.isSelf && "items-end")}>
        {!message.isSelf && startsGroup ? <div className="text-xs text-muted-foreground">{message.senderName}</div> : null}
        <div className="relative">
          <div
            data-message-frame-kind={framedByContent ? "bare" : "bubble"}
            className={cn(
              "block rounded-lg text-left",
              framedByContent
                ? "p-0"
                : cn("px-3 py-2", message.isSelf ? "bg-primary text-primary-foreground" : "border bg-background"),
              localSend?.status === "pending" && "opacity-70",
              localSend?.status === "failed" && "border border-destructive/50 bg-destructive/10 text-foreground",
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
        </div>
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground transition-opacity duration-120",
            message.isSelf && "justify-end",
            metaAlwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <TimeText value={message.sentAtIso} />
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
              aria-label={`查看消息详情 ${message.messageId}`}
              onClick={() => onShowDetail(message)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
            >
              <Info className="size-3" />
              详情
            </button>
          ) : null}
        </div>
      </div>
      {message.isSelf ? <SenderAvatarButton message={message} onOpenContact={onOpenContact} /> : null}
    </article>
  );
}

function SenderAvatarButton({
  message,
  onOpenContact,
}: {
  message: MessageItem;
  onOpenContact: (wxid: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`查看联系人 ${message.senderName}`}
      onClick={() => onOpenContact(message.senderProfile.wxid)}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          aria-label={`删除未发送消息 ${localSend.text}`}
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
        aria-label={`重试发送 ${localSend.text}`}
        onClick={() => onRetry(message)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"
      >
        <RotateCw className="size-3" />
        重试
      </button>
      <button
        type="button"
        aria-label={`删除未发送消息 ${localSend.text}`}
        onClick={() => onDelete(message)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
      >
        <Trash2 className="size-3" />
        删除
      </button>
    </>
  );
}

function readDeliveryStatus(deliveries: unknown[]): string | null {
  const first = deliveries[0] as { status?: string } | undefined;
  return first?.status ?? null;
}
