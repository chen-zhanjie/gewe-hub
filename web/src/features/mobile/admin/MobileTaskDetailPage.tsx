import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobilePage } from "@/features/mobile/MobilePage";
import type { BackendOutboxTask } from "@/features/admin/queries";

export function MobileTaskDetailPage({ task, retrying, onBack, onRetry }: { task: BackendOutboxTask; retrying: boolean; onBack: () => void; onRetry: (task: BackendOutboxTask) => void }) {
  return <MobilePage title="任务详情" subtitle={task.id} onBack={onBack}>
    <div className="grid gap-3 p-3">
      <section className="rounded-xl border bg-background p-4"><div className="mb-4 flex justify-end"><StatusBadge status={task.status} /></div><dl className="grid gap-3 text-sm"><Row label="任务 ID" value={task.id} /><Row label="任务类型" value={task.taskType} /><Row label="引用 ID" value={task.refId} /><Row label="重试次数" value={String(task.retryCount ?? "—")} /><Row label="下次重试" value={task.nextRetryAt ?? "—"} /><Row label="失败原因" value={task.lastError ?? "—"} /></dl></section>
      <section className="rounded-xl border bg-background p-3"><JsonViewer title="任务 payload" value={task.payload ?? {}} /></section>
      <button type="button" aria-label="重试任务" disabled={retrying} onClick={() => onRetry(task)} className="min-h-12 rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">{retrying ? "重试中" : "重试任务"}</button>
    </div>
  </MobilePage>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="break-all text-right">{value}</dd></div>; }
