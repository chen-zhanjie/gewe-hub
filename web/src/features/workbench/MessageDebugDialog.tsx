import { ArrowDown, ArrowUp, ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { TimeText } from "@/components/ui/TimeText";
import type { MessageItem } from "@/lib/workspace-data";

export function MessageDebugDialog({
  message,
  messages = message ? [message] : [],
  open,
  onOpenChange,
  onSelectMessage,
  onOpenDeliveryLog,
}: {
  message: MessageItem | null;
  messages?: MessageItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMessage?: (message: MessageItem) => void;
  onOpenDeliveryLog?: (messageId: string) => void;
}) {
  if (!message) {
    return null;
  }
  const currentIndex = messages.findIndex((item) => item.id === message.id);
  const previousMessage = currentIndex > 0 ? messages[currentIndex - 1] : null;
  const nextMessage = currentIndex >= 0 && currentIndex < messages.length - 1 ? messages[currentIndex + 1] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <DialogHeader className="border-b px-6 py-4 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>消息调试详情</DialogTitle>
              <DialogDescription>{message.messageId}</DialogDescription>
            </div>
            {onSelectMessage && messages.length > 1 ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="上一条消息"
                  title="上一条消息"
                  disabled={!previousMessage}
                  onClick={() => {
                    if (previousMessage) onSelectMessage(previousMessage);
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="下一条消息"
                  title="下一条消息"
                  disabled={!nextMessage}
                  onClick={() => {
                    if (nextMessage) onSelectMessage(nextMessage);
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton value={JSON.stringify(message.standardJson, null, 2)} label="复制标准 JSON" />
            <CopyButton value={JSON.stringify(message.rawPayload, null, 2)} label="复制原始 payload" />
            <CopyButton value={JSON.stringify(message.deliveries, null, 2)} label="复制投递记录" />
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 pb-6">
          <MessageDebugContent message={message} onOpenDeliveryLog={onOpenDeliveryLog} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DebugPanel({ message }: { message: MessageItem | null }) {
  if (!message) {
    return <div className="text-sm text-muted-foreground">请选择消息查看调试信息</div>;
  }

  return <MessageDebugContent message={message} />;
}

function MessageDebugContent({
  message,
  onOpenDeliveryLog,
}: {
  message: MessageItem;
  onOpenDeliveryLog?: (messageId: string) => void;
}) {
  const deliveryStatus = readDeliveryStatus(message.deliveries);
  const deliveryLogHref = `/deliveries?status=failed&messageId=${encodeURIComponent(message.messageId)}`;

  return (
    <Tabs defaultValue="deliveries" className="pt-4">
      <TabsList>
        <TabsTrigger value="basic">概览</TabsTrigger>
        <TabsTrigger value="standard">标准 JSON</TabsTrigger>
        <TabsTrigger value="raw">原始 payload</TabsTrigger>
        <TabsTrigger value="deliveries">投递记录</TabsTrigger>
      </TabsList>
      <TabsContent value="basic">
        <section className="rounded-lg border p-4">
          <dl className="space-y-3 text-sm">
            <InfoRow label="messageId" value={message.messageId} />
            <InfoRow label="发送者" value={message.senderName} />
            <InfoRow label="发送者 wxid" value={message.senderProfile.wxid} />
            <InfoRow label="状态" value={message.status} />
            <InfoRow label="时间" value={<TimeText value={message.sentAtIso} />} />
          </dl>
        </section>
      </TabsContent>
      <TabsContent value="standard">
        <JsonViewer title="标准 JSON" value={message.standardJson} />
      </TabsContent>
      <TabsContent value="raw">
        <JsonViewer title="原始 payload" value={message.rawPayload} />
      </TabsContent>
      <TabsContent value="deliveries">
        <div className="space-y-4">
          <section className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium">投递记录</h3>
              <a
                href={deliveryLogHref}
                aria-label={`在推送日志查看 ${message.messageId}`}
                onClick={(event) => {
                  if (!onOpenDeliveryLog) return;
                  event.preventDefault();
                  onOpenDeliveryLog(message.messageId);
                }}
                className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-4" />
                在推送日志查看
              </a>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span>{readDeliveryLabel(message.deliveries) ?? "暂无投递记录"}</span>
              {deliveryStatus ? (
                <>
                  <span className="font-mono text-xs text-muted-foreground">{deliveryStatus}</span>
                  <StatusBadge status={deliveryStatus} />
                </>
              ) : null}
            </div>
          </section>
          <JsonViewer title="投递记录 JSON" value={message.deliveries} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function readDeliveryLabel(deliveries: unknown[]): string | null {
  const first = deliveries[0] as { eventId?: string } | undefined;
  return first?.eventId ?? null;
}

function readDeliveryStatus(deliveries: unknown[]): string | null {
  const first = deliveries[0] as { status?: string } | undefined;
  return first?.status ?? null;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
