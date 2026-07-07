import type { ReactNode } from "react";
import { Activity, Database, Settings, ShieldCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useGeweStatusQuery, useSetGeweCallbackMutation } from "../queries";

export function SettingsPage() {
  const statusQuery = useGeweStatusQuery();
  const setCallbackMutation = useSetGeweCallbackMutation();
  const status = statusQuery.data ?? null;
  const setCallbackError = readAdminQueryError(setCallbackMutation.error);

  async function handleSetCallback() {
    if (setCallbackMutation.isPending) return;
    await setCallbackMutation.mutateAsync();
  }

  return (
    <PageShell description="配置 GeWe key、回调地址和连通性检查。">
      <LoadState loading={statusQuery.isLoading} error={readAdminQueryError(statusQuery.error)} empty={false} emptyText="" />
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard icon={ShieldCheck} label="Key 状态" value={status?.ok ? "有效" : "未知"} status={status?.ok ? "online" : "unknown"} />
        <MetricCard icon={Database} label="回调状态" value={status?.callbackUrl ? "已配置" : "未配置"} status={status?.callbackUrl ? "delivered" : "unknown"} />
        <MetricCard icon={Activity} label="GeWe 地址" value={status?.baseUrl ? "已配置" : "未知"} status={status?.baseUrl ? "online" : "unknown"} />
      </div>
      <section className="rounded-lg border bg-background p-4">
        <h2 className="text-sm font-medium">回调 URL</h2>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{status?.callbackUrl ?? "未加载"}</code>
          <CopyButton value={status?.callbackUrl ?? ""} label="复制回调 URL" />
        </div>
        {setCallbackError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{setCallbackError}</div> : null}
        <button
          type="button"
          disabled={setCallbackMutation.isPending}
          onClick={() => {
            void handleSetCallback();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Settings className="size-4" />
          {setCallbackMutation.isPending ? "设置中" : "一键设置回调"}
        </button>
      </section>
    </PageShell>
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

function readAdminQueryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "数据加载失败";
}
