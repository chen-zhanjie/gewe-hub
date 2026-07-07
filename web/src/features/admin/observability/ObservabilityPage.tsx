import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, CheckCircle2, ClipboardList, Database, KeyRound, XCircle } from "lucide-react";
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
import { DataTable } from "@/components/ui/DataTable";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  type BackendOutboxTask,
  type ObservabilitySummary,
  useObservabilitySummaryQuery,
  useOutboxTasksQuery,
  useRetryOutboxTaskMutation,
} from "../queries";

export function ObservabilityPage() {
  const summaryQuery = useObservabilitySummaryQuery();
  const tasksQuery = useOutboxTasksQuery();
  const retryTaskMutation = useRetryOutboxTaskMutation();
  const summary = summaryQuery.data ?? null;
  const tasks = tasksQuery.data ?? [];
  const summaryLoading = summaryQuery.isLoading;
  const tasksLoading = tasksQuery.isLoading;
  const [selectedTask, setSelectedTask] = useState<BackendOutboxTask | null>(null);
  const [confirmingTaskRetry, setConfirmingTaskRetry] = useState<BackendOutboxTask | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const failedTasks = tasks.filter((task) => task.status === "failed" || task.status === "dead");
  const visibleFailedTasks = failedTasks.filter((task) => matchesTaskSearch(task, taskSearch));
  const taskColumns = useMemo<ColumnDef<BackendOutboxTask>[]>(
    () => [
      {
        accessorKey: "id",
        header: "任务 ID",
        cell: ({ row }) => <code className="font-mono text-xs">{row.original.id}</code>,
      },
      {
        accessorKey: "taskType",
        header: "类型",
      },
      {
        accessorKey: "refId",
        header: "引用",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.refId}</span>,
      },
      {
        accessorKey: "lastError",
        header: "失败原因",
        cell: ({ row }) => <span className="line-clamp-1 text-muted-foreground">{row.original.lastError ?? "—"}</span>,
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "操作",
        meta: { align: "right", sticky: "right" },
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            aria-label="查看任务详情"
            onClick={() => {
              setSelectedTask(row.original);
              setRetryError(null);
            }}
            className="rounded-md border px-3 py-2 text-sm"
          >
            查看详情
          </button>
        ),
      },
    ],
    [],
  );

  async function handleRetryTask(taskId: string) {
    if (retryTaskMutation.isPending) return;
    setRetryError(null);
    try {
      await retryTaskMutation.mutateAsync(taskId);
      setConfirmingTaskRetry(null);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "重试失败");
    }
  }

  return (
    <PageShell description="查看 24 小时运行摘要、积压和失败任务。">
      <LoadState
        loading={summaryLoading || tasksLoading}
        error={readAdminQueryError(summaryQuery.error) ?? readAdminQueryError(tasksQuery.error)}
        empty={false}
        emptyText=""
      />
      <HealthSummary summary={summary} />
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Webhook 24h" value={String(summary?.webhook24h ?? 0)} status="delivered" />
        <MetricCard icon={Activity} label="账号在线" value={formatAccountOnline(summary?.accounts)} status="online" />
        <MetricCard icon={Database} label="投递积压" value={String(summary?.deliveryBacklog ?? 0)} status="pending" />
        <MetricCard icon={KeyRound} label="失败任务" value={String(summary?.failedTasks ?? 0)} status="failed" />
      </div>
      <section className="rounded-lg border bg-background p-4">
        <h2 className="text-sm font-medium">失败任务</h2>
        {retryError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{retryError}</div> : null}
        <DataTable
          ariaLabel="失败任务列表"
          columns={taskColumns}
          data={visibleFailedTasks}
          getRowId={(task) => task.id}
          loading={tasksLoading}
          emptyText={taskSearch ? "没有匹配的失败任务" : "暂无失败任务"}
          onRowClick={(task) => {
            setSelectedTask(task);
            setRetryError(null);
          }}
          toolbar={{
            searchPlaceholder: "搜索失败任务",
            searchValue: taskSearch,
            onSearchChange: setTaskSearch,
            onRefresh: () => {
              void Promise.all([summaryQuery.refetch(), tasksQuery.refetch()]);
            },
            isFetching: summaryQuery.isFetching || tasksQuery.isFetching,
          }}
          className="mt-4"
        />
      </section>
      <TaskDetailSheet
        task={selectedTask}
        retryingTaskId={retryTaskMutation.isPending ? confirmingTaskRetry?.id ?? null : null}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        onRetry={(task) => {
          setConfirmingTaskRetry(task);
          setRetryError(null);
        }}
      />
      <AlertDialog
        open={confirmingTaskRetry !== null}
        onOpenChange={(open) => {
          if (!open && !retryTaskMutation.isPending) setConfirmingTaskRetry(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重试任务</AlertDialogTitle>
            <AlertDialogDescription>重试会将失败任务重新置为 pending，并由 worker 再次执行。</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingTaskRetry ? (
            <DescriptionList
              className="rounded-md border bg-muted/40 p-3 sm:grid-cols-[88px_1fr]"
              items={[
                { label: "任务 ID", value: <code className="font-mono text-xs">{confirmingTaskRetry.id}</code> },
                { label: "类型", value: confirmingTaskRetry.taskType },
                { label: "引用", value: confirmingTaskRetry.refId },
                { label: "错误", value: confirmingTaskRetry.lastError },
              ]}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retryTaskMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingTaskRetry || retryTaskMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingTaskRetry) void handleRetryTask(confirmingTaskRetry.id);
              }}
            >
              {retryTaskMutation.isPending ? "重试中" : "确认重试"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function HealthSummary({ summary }: { summary: ObservabilitySummary | null }) {
  if (!summary) return null;

  const issues = buildHealthIssues(summary);
  const healthy = issues.length === 0;
  const Icon = healthy ? CheckCircle2 : XCircle;

  return (
    <section
      role="status"
      aria-label="运行健康摘要"
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background px-4 py-3 shadow-sm",
        healthy ? "border-emerald-200 text-emerald-800" : "border-destructive/30 text-destructive",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{healthy ? "系统正常" : "系统异常"}</div>
        <div className={cn("mt-1 text-sm", healthy ? "text-emerald-700" : "text-destructive")}>
          {healthy ? "无失败任务、无投递积压，账号全部在线" : issues.join("、")}
        </div>
      </div>
    </section>
  );
}

function buildHealthIssues(summary: ObservabilitySummary | null): string[] {
  if (!summary) return [];
  const offlineAccounts = summary.accounts
    .filter((account) => account.onlineStatus !== "online")
    .reduce((sum, account) => sum + account._count, 0);
  return [
    summary.failedTasks > 0 ? `${summary.failedTasks} 个失败任务` : null,
    summary.deliveryBacklog > 0 ? `${summary.deliveryBacklog} 条投递积压` : null,
    offlineAccounts > 0 ? `${offlineAccounts} 个账号离线` : null,
  ].filter((issue): issue is string => Boolean(issue));
}

function TaskDetailSheet({
  task,
  retryingTaskId,
  onOpenChange,
  onRetry,
}: {
  task: BackendOutboxTask | null;
  retryingTaskId: string | null;
  onOpenChange: (open: boolean) => void;
  onRetry: (task: BackendOutboxTask) => void;
}) {
  return (
    <DetailSheet
      open={task !== null}
      onOpenChange={onOpenChange}
      title="任务详情"
      description={task?.id}
      status={task ? <StatusBadge status={task.status} /> : null}
      footer={
        task ? (
          <button
            type="button"
            disabled={retryingTaskId === task.id}
            onClick={() => onRetry(task)}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {retryingTaskId === task.id ? "重试中" : "重试任务"}
          </button>
        ) : null
      }
    >
      {task ? (
        <div className="space-y-4">
          <DescriptionList
            className="rounded-md border p-3"
            items={[
              { label: "任务 ID", value: <code className="font-mono text-xs">{task.id}</code> },
              { label: "任务类型", value: task.taskType },
              { label: "引用 ID", value: task.refId },
              { label: "状态", value: <StatusBadge status={task.status} /> },
              { label: "重试次数", value: task.retryCount ?? "—" },
              { label: "下次重试", value: task.nextRetryAt ?? "—" },
              { label: "失败原因", value: task.lastError },
            ]}
          />
          <JsonViewer title="任务 payload" value={task.payload ?? {}} />
        </div>
      ) : null}
    </DetailSheet>
  );
}

function LoadState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
}) {
  if (loading) return <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">正在加载</div>;
  if (error) return <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div>;
  if (empty) return <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>;
  return null;
}

function PageShell({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  status: string;
}) {
  return (
    <section className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <Icon className="size-4 text-muted-foreground" />
        <StatusBadge status={status} />
      </div>
      <div className="mt-4 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </section>
  );
}

function matchesTaskSearch(task: BackendOutboxTask, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [task.id, task.taskType, task.refId, task.status, task.lastError ?? ""]
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function formatAccountOnline(accounts: ObservabilitySummary["accounts"] | undefined): string {
  if (!accounts) return "0 / 0";
  const total = accounts.reduce((sum, item) => sum + item._count, 0);
  const online = accounts.filter((item) => item.onlineStatus === "online").reduce((sum, item) => sum + item._count, 0);
  return `${online} / ${total}`;
}

function readAdminQueryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "数据加载失败";
}
