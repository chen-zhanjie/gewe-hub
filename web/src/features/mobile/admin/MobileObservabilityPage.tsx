import { Activity, ClipboardList, Database, KeyRound, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobilePage } from "@/features/mobile/MobilePage";
import { type BackendOutboxTask, type ObservabilitySummary, useObservabilitySummaryQuery, useOutboxTasksQuery, useRetryOutboxTaskMutation } from "@/features/admin/queries";
import { MobileTaskDetailPage } from "./MobileTaskDetailPage";

export function MobileObservabilityPage({ onBack }: { onBack?: () => void }) {
  const summaryQuery = useObservabilitySummaryQuery();
  const tasksQuery = useOutboxTasksQuery();
  const retryMutation = useRetryOutboxTaskMutation();
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<BackendOutboxTask | null>(null);
  const tasks = tasksQuery.data ?? [];
  const keyword = search.trim().toLowerCase();
  const visibleTasks = useMemo(() => tasks.filter((task) => !keyword || [task.id, task.taskType, task.refId, task.status, task.lastError ?? ""].some((value) => value.toLowerCase().includes(keyword))), [keyword, tasks]);

  if (selectedTask) return <MobileTaskDetailPage task={selectedTask} retrying={retryMutation.isPending} onBack={() => setSelectedTask(null)} onRetry={(task) => retryMutation.mutate(task.id)} />;
  const summary = summaryQuery.data ?? null;
  const issues = healthIssues(summary);
  const healthy = Boolean(summary) && issues.length === 0;

  return <MobilePage title="运行观测" subtitle="健康状态与失败任务" onBack={onBack}>
    <div className="grid gap-3 p-3">
      <section className={`rounded-xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50" : "border-destructive/30 bg-destructive/5"}`}><h2 className="text-sm font-medium">{healthy ? "系统正常" : "系统异常"}</h2><p className="mt-1 text-sm text-muted-foreground">{summary ? (healthy ? "无失败任务、无投递积压，账号全部在线" : issues.join("、")) : "正在读取健康状态"}</p></section>
      {summaryQuery.error ? <p className="text-sm text-destructive">{readError(summaryQuery.error)}</p> : null}
      <section aria-label="运行指标" className="grid grid-cols-2 gap-2"><Metric icon={Activity} label="Webhook 24h" value={String(summary?.webhook24h ?? 0)} status="success" /><Metric icon={ClipboardList} label="失败任务" value={String(summary?.failedTasks ?? 0)} status={(summary?.failedTasks ?? 0) > 0 ? "failed" : "success"} /><Metric icon={Database} label="投递积压" value={String(summary?.deliveryBacklog ?? 0)} status={(summary?.deliveryBacklog ?? 0) > 0 ? "pending" : "success"} /><Metric icon={KeyRound} label="账号在线" value={formatAccounts(summary?.accounts)} status={accountsOffline(summary?.accounts) > 0 ? "offline" : "online"} /></section>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-muted-foreground"><Search className="size-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索失败任务" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
      {tasksQuery.isLoading ? <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">正在加载失败任务</p> : null}
      {tasksQuery.error ? <p className="rounded-xl border border-destructive/30 bg-background p-4 text-sm text-destructive">{readError(tasksQuery.error)}</p> : null}
      {!tasksQuery.isLoading && visibleTasks.length === 0 ? <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">暂无匹配失败任务</p> : null}
      <div role="list" aria-label="失败任务列表" className="grid gap-3">{visibleTasks.map((task) => <button type="button" aria-label={`查看任务 ${task.id}`} key={task.id} onClick={() => setSelectedTask(task)} className="rounded-xl border bg-background p-4 text-left active:bg-muted"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{task.taskType}</div><code className="mt-1 block truncate text-xs text-muted-foreground">{task.id}</code></div><StatusBadge status={task.status} /></div><p className="mt-3 line-clamp-2 text-xs text-destructive">{task.lastError || "暂无失败原因"}</p><div className="mt-2 text-xs text-muted-foreground">引用 {task.refId} · 重试 {task.retryCount ?? 0} 次</div></button>)}</div>
    </div>
  </MobilePage>;
}

function Metric({ icon: Icon, label, value, status }: { icon: typeof Activity; label: string; value: string; status: string }) { return <article className="rounded-xl border bg-background p-3"><div className="flex items-center justify-between"><Icon className="size-4 text-muted-foreground" /><StatusBadge status={status} /></div><div className="mt-3 text-xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></article>; }
function accountsOffline(accounts?: ObservabilitySummary["accounts"]) { return (accounts ?? []).filter((item) => item.onlineStatus !== "online").reduce((sum, item) => sum + item._count, 0); }
function formatAccounts(accounts?: ObservabilitySummary["accounts"]) { const list = accounts ?? []; const total = list.reduce((sum, item) => sum + item._count, 0); const online = list.filter((item) => item.onlineStatus === "online").reduce((sum, item) => sum + item._count, 0); return `${online} / ${total}`; }
function healthIssues(summary: ObservabilitySummary | null) { if (!summary) return []; const offline = accountsOffline(summary.accounts); return [summary.failedTasks > 0 ? `${summary.failedTasks} 个失败任务` : null, summary.deliveryBacklog > 0 ? `${summary.deliveryBacklog} 条投递积压` : null, offline > 0 ? `${offline} 个账号离线` : null].filter((item): item is string => Boolean(item)); }
function readError(error: unknown) { return error instanceof Error ? error.message : "数据加载失败"; }
