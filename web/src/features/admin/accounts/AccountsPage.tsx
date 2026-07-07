import type { ReactNode } from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Pencil, Plus, RefreshCcw, X } from "lucide-react";
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  type BackendAccount,
  useAccountsQuery,
  useSaveAccountMutation,
  useSyncContactsMutation,
} from "../queries";

export function AccountsPage() {
  const accountsQuery = useAccountsQuery();
  const saveAccountMutation = useSaveAccountMutation();
  const syncContactsMutation = useSyncContactsMutation();
  const accounts = accountsQuery.data ?? [];
  const [draft, setDraft] = useState({
    appId: "",
    wxid: "",
    nickname: "",
    platformRemark: "",
  });
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const displayAccounts = sortAccountsForOperations(accounts);

  async function handleSaveAccount() {
    const payload = {
      appId: draft.appId.trim(),
      wxid: draft.wxid.trim(),
      nickname: optionalText(draft.nickname),
      platformRemark: optionalText(draft.platformRemark),
    };
    if (!payload.appId || !payload.wxid || saveAccountMutation.isPending) return;
    setSaveError(null);
    try {
      await saveAccountMutation.mutateAsync({ accountId: editingAccountId, payload });
      resetAccountDraft();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存账号失败");
    }
  }

  function handleEditAccount(account: BackendAccount) {
    setEditingAccountId(account.id);
    setDraft({
      appId: account.appId ?? "",
      wxid: account.wxid,
      nickname: account.nickname ?? "",
      platformRemark: account.platformRemark ?? "",
    });
    setSaveError(null);
  }

  function resetAccountDraft() {
    setEditingAccountId(null);
    setDraft({ appId: "", wxid: "", nickname: "", platformRemark: "" });
  }

  async function handleSync() {
    const account = accounts[0];
    if (!account || syncContactsMutation.isPending) return;
    setSyncError(null);
    try {
      await syncContactsMutation.mutateAsync(account.id);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步失败");
    }
  }

  return (
    <PageShell description="查看微信账号、联系人和群成员同步状态。">
      <AccountStatusSummary accounts={accounts} loading={accountsQuery.isLoading} />
      <section className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">{editingAccountId ? "编辑账号" : "手动录入账号"}</h2>
          {editingAccountId ? (
            <button
              type="button"
              onClick={resetAccountDraft}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <X className="size-4" />
              取消编辑
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="block text-xs text-muted-foreground">
            GeWe appId
            <input
              aria-label="GeWe appId"
              value={draft.appId}
              onChange={(event) => setDraft({ ...draft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="wx_app"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号 wxid
            <input
              aria-label="账号 wxid"
              value={draft.wxid}
              onChange={(event) => setDraft({ ...draft, wxid: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="wxid_bot"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号昵称
            <input
              aria-label="账号昵称"
              value={draft.nickname}
              onChange={(event) => setDraft({ ...draft, nickname: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="客服主号"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            平台备注
            <input
              aria-label="平台备注"
              value={draft.platformRemark}
              onChange={(event) => setDraft({ ...draft, platformRemark: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="主控账号"
            />
          </label>
        </div>
        {saveError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{saveError}</div> : null}
        <button
          type="button"
          disabled={!draft.appId.trim() || !draft.wxid.trim() || saveAccountMutation.isPending}
          onClick={() => {
            void handleSaveAccount();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          {saveAccountMutation.isPending ? "保存中" : "保存账号"}
        </button>
      </section>
      <section className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">微信账号</h2>
          <button
            type="button"
            disabled={accounts.length === 0 || syncContactsMutation.isPending}
            onClick={() => {
              void handleSync();
            }}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="size-4" />
            {syncContactsMutation.isPending ? "同步中" : "同步"}
          </button>
        </div>
        {syncError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{syncError}</div> : null}
        <LoadState
          loading={accountsQuery.isLoading}
          error={readAdminQueryError(accountsQuery.error)}
          empty={!accountsQuery.isLoading && accounts.length === 0}
          emptyText="暂无微信账号"
        />
        <div role="list" aria-label="微信账号列表" className="mt-4 divide-y">
          {displayAccounts.map((account) => (
            <div
              key={account.id}
              role="listitem"
              className={cn(
                "flex items-center justify-between gap-4 py-3",
                account.onlineStatus === "offline" && "rounded-md bg-red-50 px-3",
              )}
            >
              <div className="min-w-0">
                <EntityCell
                  entity={{
                    platformRemark: account.platformRemark,
                    nickname: account.nickname,
                    wxid: account.wxid,
                  }}
                />
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{account.appId ?? "未设置 appId"}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={account.onlineStatus ?? "unknown"} />
                <button
                  type="button"
                  aria-label="编辑账号"
                  title="编辑账号"
                  onClick={() => handleEditAccount(account)}
                  className="rounded-md border p-2 text-muted-foreground"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

function AccountStatusSummary({ accounts, loading }: { accounts: BackendAccount[]; loading: boolean }) {
  const offlineAccounts = accounts.filter((account) => account.onlineStatus === "offline");
  const hasOfflineAccounts = offlineAccounts.length > 0;
  const Icon = hasOfflineAccounts ? AlertCircle : CheckCircle2;

  return (
    <section
      role="status"
      aria-label={loading ? "微信账号状态检查中" : "微信账号状态摘要"}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background px-4 py-3 shadow-sm",
        hasOfflineAccounts ? "border-destructive/30 text-destructive" : "border-emerald-200 text-emerald-800",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {loading
            ? "正在检查账号状态"
            : hasOfflineAccounts
              ? `${offlineAccounts.length} 个账号离线`
              : accounts.length > 0
                ? "账号全部在线"
                : "未录入微信账号"}
        </div>
        <div className={cn("mt-1 text-sm", hasOfflineAccounts ? "text-destructive" : "text-emerald-700")}>
          {hasOfflineAccounts ? offlineAccounts.map(readAccountDisplayName).join("、") : "账号页会优先显示离线账号"}
        </div>
      </div>
    </section>
  );
}

function sortAccountsForOperations(accounts: BackendAccount[]): BackendAccount[] {
  return [...accounts].sort((left, right) => {
    const byStatus = accountStatusPriority(left.onlineStatus) - accountStatusPriority(right.onlineStatus);
    if (byStatus !== 0) return byStatus;
    return readAccountDisplayName(left).localeCompare(readAccountDisplayName(right), "zh-Hans-CN");
  });
}

function accountStatusPriority(status: BackendAccount["onlineStatus"]): number {
  if (status === "offline") return 0;
  if (status === "unknown" || !status) return 1;
  return 2;
}

function readAccountDisplayName(account: BackendAccount): string {
  return account.platformRemark || account.nickname || account.wxid;
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

function readAdminQueryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "数据加载失败";
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
