import {
  AlertCircle,
  Clipboard,
  Clock3,
  Code2,
  FileText,
  Info,
  RotateCw,
  Trash2,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { isFramedMessageNode, MessageNodeView } from "@/components/message/MessageNodeView";
import { Avatar } from "@/components/ui/Avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { TimeText } from "@/components/ui/TimeText";
import { cn } from "@/lib/utils";
import type { MessageItem, WechatEntityProfile } from "@/lib/workspace-data";

export function MessageBubble({
  message,
  startsGroup,
  selected,
  onSelect,
  onContextMenu,
  onShowDetail,
  onCopyText,
  onCopyJson,
  onRetryLocalSend,
  onDeleteLocalSend,
}: {
  message: MessageItem;
  startsGroup: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (event: MouseEvent, message: MessageItem) => void;
  onShowDetail: (message: MessageItem) => void;
  onCopyText: (message: MessageItem) => void;
  onCopyJson: (message: MessageItem) => void;
  onRetryLocalSend: (message: MessageItem) => void;
  onDeleteLocalSend: (message: MessageItem) => void;
}) {
  if (message.status === "revoked" || message.content.type === "system") {
    return (
      <button
        type="button"
        data-message-group-start={startsGroup ? "true" : "false"}
        onClick={() => onSelect(message.id)}
        onContextMenu={(event) => onContextMenu(event, message)}
        className="mx-auto block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
      >
        {message.content.text}
      </button>
    );
  }

  const framedByContent = isFramedMessageNode(message.content);
  const localSend = message.localSend;
  const deliveryStatus = localSend ? null : readDeliveryStatus(message.deliveries);

  return (
    <ContextMenu>
      <article
        data-message-group-start={startsGroup ? "true" : "false"}
        className={cn("group flex gap-3", message.isSelf && "justify-end", !startsGroup && "pt-1")}
      >
        {!message.isSelf ? (
          startsGroup ? (
            <SenderProfilePopover message={message} />
          ) : (
            <div className="w-8 shrink-0" aria-hidden="true" />
          )
        ) : null}
        <div className={cn("message-bubble space-y-1", message.isSelf && "items-end")}>
          {!message.isSelf && startsGroup ? <div className="text-xs text-muted-foreground">{message.senderName}</div> : null}
          <div className="relative">
            <ContextMenuTrigger asChild>
              <div
                data-message-frame-kind={framedByContent ? "bare" : "bubble"}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(message.id)}
                onContextMenu={(event) => onContextMenu(event, message)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(message.id);
                  }
                }}
                className={cn(
                  "block rounded-lg text-left",
                  framedByContent
                    ? "p-0"
                    : cn("px-3 py-2", message.isSelf ? "bg-primary text-primary-foreground" : "border bg-background"),
                  localSend?.status === "pending" && "opacity-70",
                  localSend?.status === "failed" && "border border-destructive/50 bg-destructive/10 text-foreground",
                  selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
              >
                <MessageNodeView node={message.content} />
              </div>
            </ContextMenuTrigger>
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
              "flex items-center gap-2 text-xs text-muted-foreground",
              message.isSelf && "justify-end",
              !startsGroup && "opacity-0 transition-opacity duration-120 group-hover:opacity-100",
            )}
          >
            <TimeText value={message.sentAtIso} />
            <LocalSendMeta message={message} onRetry={onRetryLocalSend} onDelete={onDeleteLocalSend} />
            {!localSend ? (
              <button
                type="button"
                onClick={() => onShowDetail(message)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
              >
                <Info className="size-3" />
                详情
              </button>
            ) : null}
          </div>
        </div>
        {message.isSelf ? <SenderProfilePopover message={message} /> : null}
      </article>
      <ContextMenuContent aria-label="消息操作">
        {!localSend ? (
          <ContextMenuItem onSelect={() => onShowDetail(message)}>
            <Info className="size-4" />
            查看详情
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => onCopyText(message)}>
          <Clipboard className="size-4" />
          复制文本
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyJson(message)}>
          <Code2 className="size-4" />
          复制标准 JSON
        </ContextMenuItem>
        {!localSend ? (
          <ContextMenuItem onSelect={() => onShowDetail(message)}>
            <FileText className="size-4" />
            查看原始 payload
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
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

function SenderProfilePopover({ message }: { message: MessageItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`查看 ${message.senderName} 完整信息`}
          onMouseEnter={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar name={message.senderName} src={message.senderProfile.avatarUrl} size={32} />
        </button>
      </PopoverTrigger>
      <PopoverContent role="dialog" aria-label={`${message.senderName} 完整信息`} align="start" className="w-72">
        <SenderProfileCard name={message.senderName} profile={message.senderProfile} />
      </PopoverContent>
    </Popover>
  );
}

function SenderProfileCard({ name, profile }: { name: string; profile: WechatEntityProfile }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} src={profile.avatarUrl} size={40} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{profile.nickname || profile.displayName || profile.wxid}</div>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <InfoRow label="昵称" value={profile.nickname || "未同步"} />
        <InfoRow label="群内名" value={profile.displayName || "未同步"} />
        <InfoRow label="备注" value={profile.platformRemark || "未设置"} />
        <InfoRow label="wxid" value={<span className="font-mono text-xs">{profile.wxid}</span>} />
        <InfoRow label="状态" value={profile.status || "unknown"} />
      </dl>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function readDeliveryStatus(deliveries: unknown[]): string | null {
  const first = deliveries[0] as { status?: string } | undefined;
  return first?.status ?? null;
}
