import { DescriptionList } from "@/components/ui/DescriptionList";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobilePage } from "../MobilePage";

export interface MobileSendRequestRecord {
  id: string;
  type: string;
  deliveryMode?: "immediate" | "discard" | "confirm" | null;
  status: string;
  message?: { messageId: string } | null;
  updatedAt?: string | Date;
  requestPayload?: unknown;
  geweRequest?: unknown;
  geweResponse?: unknown;
  conversation?: {
    platformRemark?: string | null;
    name?: string | null;
    peerWxid?: string | null;
  } | null;
}

export function getMobileSendRequestConversationName(request: MobileSendRequestRecord): string {
  return request.conversation?.platformRemark || request.conversation?.name || request.conversation?.peerWxid || "未知会话";
}

export function mobileSendRequestBadgeStatus(status: string): string {
  return status === "unknown" ? "result_unknown" : status;
}

export function MobileSendRequestDetailPage({
  request,
  loading = false,
  error = null,
  onBack,
}: {
  request: MobileSendRequestRecord;
  loading?: boolean;
  error?: string | null;
  onBack?: () => void;
}) {
  return (
    <MobilePage title="发送详情" subtitle={request.id} onBack={onBack}>
      <div className="grid gap-4 p-4">
        {loading ? <p className="rounded-xl border p-3 text-sm text-muted-foreground">正在加载详情</p> : null}
        {error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
        <DescriptionList
          className="rounded-xl border bg-background p-4"
          items={[
            { label: "请求 ID", value: <code className="break-all font-mono text-xs">{request.id}</code> },
            { label: "会话", value: getMobileSendRequestConversationName(request) },
            { label: "类型", value: request.type },
            { label: "状态", value: <StatusBadge status={mobileSendRequestBadgeStatus(request.status)} /> },
            { label: "发送策略", value: request.deliveryMode ?? "immediate" },
            { label: "消息 ID", value: <code className="break-all font-mono text-xs">{request.message?.messageId || "—"}</code> },
          ]}
        />
        <JsonViewer title="请求 payload" value={request.requestPayload ?? {}} />
        <JsonViewer title="GeWe 请求" value={request.geweRequest ?? {}} />
        <JsonViewer title="GeWe 响应" value={request.geweResponse ?? {}} />
      </div>
    </MobilePage>
  );
}
