import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import type { MessageItem } from "@/lib/workspace-data";

export function MessageRevokeConfirmDialog({
  message,
  revokingMessageId,
  onClose,
  onConfirm,
}: {
  message: MessageItem | null;
  revokingMessageId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>撤回消息</AlertDialogTitle>
          <AlertDialogDescription>撤回后将调用 GeWe 撤回接口，微信侧消息会尝试显示为已撤回。</AlertDialogDescription>
        </AlertDialogHeader>
        {message ? (
          <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-[88px_1fr]">
            <dt className="text-xs text-muted-foreground">消息 ID</dt>
            <dd className="font-mono text-xs">{message.messageId}</dd>
            <dt className="text-xs text-muted-foreground">发送请求</dt>
            <dd className="font-mono text-xs">{message.sendRequestId}</dd>
            <dt className="text-xs text-muted-foreground">内容</dt>
            <dd className="line-clamp-2">{readMessagePreview(message)}</dd>
          </dl>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(revokingMessageId)}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={!message || revokingMessageId === message.id}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {revokingMessageId === message?.id ? "撤回中" : "确认撤回"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function readMessagePreview(message: MessageItem): string {
  if ("text" in message.content && typeof message.content.text === "string") return message.content.text;
  return message.messageId;
}
