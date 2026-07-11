import { ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { TimeText } from "@/components/ui/TimeText";
import { MobileTopBar } from "@/features/mobile/MobileTopBar";
import type { MessageItem } from "@/lib/workspace-data";

interface MobileMessageDetailPageProps {
  message: MessageItem;
  messages?: MessageItem[];
  onBack?: () => void;
  onSelectMessage?: (message: MessageItem) => void;
  onOpenDeliveryLog?: (messageId: string) => void;
}

export function MobileMessageDetailPage({
  message,
  messages = [message],
  onBack,
  onSelectMessage,
  onOpenDeliveryLog,
}: MobileMessageDetailPageProps) {
  const currentIndex = messages.findIndex((item) => item.id === message.id);
  const previousMessage = currentIndex > 0 ? messages[currentIndex - 1] : null;
  const nextMessage = currentIndex >= 0 && currentIndex < messages.length - 1 ? messages[currentIndex + 1] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
      <MobileTopBar
        title="消息详情"
        subtitle={message.messageId}
        onBack={onBack}
        actions={onSelectMessage && messages.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="上一条消息"
              disabled={!previousMessage}
              onClick={() => previousMessage && onSelectMessage(previousMessage)}
              className="mobile-icon-button disabled:opacity-40"
            >
              <ChevronUp className="size-5" />
            </button>
            <button
              type="button"
              aria-label="下一条消息"
              disabled={!nextMessage}
              onClick={() => nextMessage && onSelectMessage(nextMessage)}
              className="mobile-icon-button disabled:opacity-40"
            >
              <ChevronDown className="size-5" />
            </button>
          </div>
        ) : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Tabs defaultValue="basic" className="space-y-3">
          <TabsList className="grid h-auto w-full grid-cols-4 rounded-xl p-1">
            <TabsTrigger value="basic" className="min-h-10 px-1 text-xs">概览</TabsTrigger>
            <TabsTrigger value="standard" className="min-h-10 px-1 text-xs">标准 JSON</TabsTrigger>
            <TabsTrigger value="raw" className="min-h-10 px-1 text-xs">原始 payload</TabsTrigger>
            <TabsTrigger value="deliveries" className="min-h-10 px-1 text-xs">投递记录</TabsTrigger>
          </TabsList>
          <TabsContent value="basic">
            <section className="rounded-xl border bg-background p-4">
              <dl className="space-y-3 text-sm">
                <InfoRow label="messageId" value={<span className="flex min-w-0 items-center justify-end gap-2"><span className="truncate font-mono text-xs">{message.messageId}</span><CopyButton value={message.messageId} label="复制 messageId" /></span>} />
                <InfoRow label="发送者" value={message.senderName} />
                <InfoRow label="发送者 wxid" value={<span className="break-all font-mono text-xs">{message.senderProfile.wxid}</span>} />
                <InfoRow label="状态" value={message.status} />
                <InfoRow label="时间" value={<TimeText value={message.sentAtIso} />} />
                <InfoRow label="投递记录" value={readDeliveryLabel(message.deliveries) ?? "暂无投递记录"} />
              </dl>
            </section>
          </TabsContent>
          <TabsContent value="standard"><JsonViewer title="标准 JSON" value={message.standardJson} /></TabsContent>
          <TabsContent value="raw"><JsonViewer title="原始 payload" value={message.rawPayload} /></TabsContent>
          <TabsContent value="deliveries">
            <DeliveryDetails message={message} onOpenDeliveryLog={onOpenDeliveryLog} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DeliveryDetails({ message, onOpenDeliveryLog }: { message: MessageItem; onOpenDeliveryLog?: (messageId: string) => void }) {
  const deliveryStatus = readDeliveryStatus(message.deliveries);
  return (
    <section role="region" aria-label="投递记录详情" className="space-y-3">
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">投递记录</h2>
          <button
            type="button"
            aria-label={`在推送日志查看 ${message.messageId}`}
            onClick={() => onOpenDeliveryLog?.(message.messageId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs text-muted-foreground active:bg-muted"
          >
            <ExternalLink className="size-4" />
            推送日志
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <FileText className="size-4 text-muted-foreground" />
          <span>{readDeliveryLabel(message.deliveries) ?? "暂无投递记录"}</span>
          {deliveryStatus ? <><span className="font-mono text-xs text-muted-foreground">{deliveryStatus}</span><StatusBadge status={deliveryStatus} /></> : null}
        </div>
      </div>
      <div className="rounded-xl border bg-background p-3"><JsonViewer title="投递记录 JSON" value={message.deliveries} /></div>
    </section>
  );
}

function readDeliveryLabel(deliveries: unknown[]): string | null {
  return (deliveries[0] as { eventId?: string } | undefined)?.eventId ?? null;
}

function readDeliveryStatus(deliveries: unknown[]): string | null {
  return (deliveries[0] as { status?: string } | undefined)?.status ?? null;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="min-w-0 text-right">{value}</dd></div>;
}
