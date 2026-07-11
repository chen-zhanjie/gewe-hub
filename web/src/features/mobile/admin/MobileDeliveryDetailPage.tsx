import { DescriptionList } from "@/components/ui/DescriptionList";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobilePage } from "../MobilePage";

export interface MobileDeliveryRecord {
  eventId: string;
  eventType?: string;
  payload?: unknown;
  status: string;
  attempts: number;
  lastError?: string | null;
  updatedAt?: string | Date;
  app?: { name?: string | null } | null;
  message?: {
    messageId?: string | null;
    renderedText?: string | null;
    conversation?: {
      id?: string | null;
      platformRemark?: string | null;
      name?: string | null;
      peerWxid?: string | null;
    } | null;
  } | null;
}

export function getMobileDeliveryConversationName(delivery: MobileDeliveryRecord): string {
  const conversation = delivery.message?.conversation;
  return conversation?.platformRemark || conversation?.name || conversation?.peerWxid || "未知会话";
}

export function MobileDeliveryDetailPage({ delivery, onBack }: { delivery: MobileDeliveryRecord; onBack?: () => void }) {
  return (
    <MobilePage title="投递详情" subtitle={delivery.eventId} onBack={onBack}>
      <div className="grid gap-4 p-4">
        <DescriptionList
          className="rounded-xl border bg-background p-4"
          items={[
            { label: "事件 ID", value: <code className="break-all font-mono text-xs">{delivery.eventId}</code> },
            { label: "事件类型", value: delivery.eventType },
            { label: "应用", value: delivery.app?.name ?? "未知应用" },
            { label: "会话", value: getMobileDeliveryConversationName(delivery) },
            { label: "状态", value: <StatusBadge status={delivery.status} /> },
            { label: "尝试次数", value: delivery.attempts },
            { label: "失败原因", value: delivery.lastError },
            { label: "消息 ID", value: <code className="break-all font-mono text-xs">{delivery.message?.messageId ?? "—"}</code> },
            { label: "消息摘要", value: delivery.message?.renderedText },
          ]}
        />
        <JsonViewer title="投递 payload" value={delivery.payload ?? {}} />
      </div>
    </MobilePage>
  );
}
