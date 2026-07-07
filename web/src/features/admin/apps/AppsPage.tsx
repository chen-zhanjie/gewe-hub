import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { KeyRound, Link2, Pencil, Plus, X } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { apiFetch } from "@/lib/api";
import type { BackendAccount } from "../queries";

export function AppsPage() {
  const router = useRouter({ warn: false });
  const { data: apps, loading, error, reload } = useApiData<BackendHubApp[]>("/api/apps", []);
  const { data: accounts } = useApiData<BackendAccount[]>("/api/accounts", []);
  const appNameInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    ownerWxid: "",
    defaultDebounceMs: "",
    defaultMaxWaitMs: "",
  });
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [savingApp, setSavingApp] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmingResetApp, setConfirmingResetApp] = useState<BackendHubApp | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedBindingAppId, setSelectedBindingAppId] = useState<string>("");
  const [boundConversations, setBoundConversations] = useState<BackendAppConversation[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsError, setBindingsError] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState({
    appId: "",
    accountId: "",
    remark: "",
    tags: "",
  });
  const [savingRemark, setSavingRemark] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash === "#new-app") {
      const timer = window.setTimeout(() => appNameInputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  async function handleSaveApp() {
    const name = draft.name.trim();
    if (!name || savingApp) return;
    setSavingApp(true);
    setActionError(null);
    try {
      await apiFetch(editingAppId ? `/api/apps/${editingAppId}` : "/api/apps", {
        method: editingAppId ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          ownerWxid: optionalText(draft.ownerWxid),
          defaultDebounceMs: parseOptionalInteger(draft.defaultDebounceMs),
          defaultMaxWaitMs: parseOptionalInteger(draft.defaultMaxWaitMs),
          deliverSelfMessages: apps.find((app) => app.id === editingAppId)?.deliverSelfMessages ?? false,
        }),
      });
      resetAppDraft();
      await reload();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "保存应用失败");
    } finally {
      setSavingApp(false);
    }
  }

  function handleEditApp(app: BackendHubApp) {
    setEditingAppId(app.id);
    setDraft({
      name: app.name,
      ownerWxid: app.ownerWxid ?? "",
      defaultDebounceMs: formatNullableNumber(app.defaultDebounceMs),
      defaultMaxWaitMs: formatNullableNumber(app.defaultMaxWaitMs),
    });
    setActionError(null);
  }

  function resetAppDraft() {
    setEditingAppId(null);
    setDraft({ name: "", ownerWxid: "", defaultDebounceMs: "", defaultMaxWaitMs: "" });
  }

  async function handleResetToken(app: BackendHubApp) {
    if (resettingId || resetConfirmText !== app.name) return;
    setResettingId(app.id);
    setActionError(null);
    try {
      await apiFetch(`/api/apps/${app.id}/reset-token`, { method: "POST" });
      await reload();
      setConfirmingResetApp(null);
      setResetConfirmText("");
    } catch (resetError) {
      setActionError(resetError instanceof Error ? resetError.message : "重置 token 失败");
    } finally {
      setResettingId(null);
    }
  }

  async function handleLoadBindings(appId: string) {
    if (bindingsLoading) return;
    setSelectedBindingAppId(appId);
    setBindingsLoading(true);
    setBindingsError(null);
    try {
      const response = await apiFetch<AppConversationsResponse | BackendAppConversation[]>(`/api/apps/${appId}/conversations?take=50&skip=0`);
      setBoundConversations(Array.isArray(response) ? response : response.items);
    } catch (loadError) {
      setBindingsError(loadError instanceof Error ? loadError.message : "绑定会话加载失败");
    } finally {
      setBindingsLoading(false);
    }
  }

  async function handleSaveRemark() {
    const appId = remarkDraft.appId;
    const accountId = remarkDraft.accountId;
    if (!appId || !accountId || savingRemark) return;
    setSavingRemark(true);
    setRemarkError(null);
    try {
      await apiFetch(`/api/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({
          accountRemarks: [
            {
              accountId,
              remark: optionalText(remarkDraft.remark),
              tags: parseTags(remarkDraft.tags),
            },
          ],
        }),
      });
      setRemarkDraft({ appId, accountId, remark: "", tags: "" });
    } catch (saveError) {
      setRemarkError(saveError instanceof Error ? saveError.message : "保存应用级账号备注失败");
    } finally {
      setSavingRemark(false);
    }
  }

  return (
    <PageShell description="管理 Hub 应用、SSE token、会话绑定和应用级备注。">
      <section className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">{editingAppId ? "编辑应用" : "新建应用"}</h2>
          {editingAppId ? (
            <button type="button" onClick={resetAppDraft} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <X className="size-4" />
              取消编辑
            </button>
          ) : null}
          <button
            type="button"
            disabled={!draft.name.trim() || savingApp}
            onClick={() => {
              void handleSaveApp();
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" />
            {savingApp ? "保存中" : editingAppId ? "保存应用" : "新建应用"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="block text-xs text-muted-foreground">
            应用名称
            <input
              ref={appNameInputRef}
              aria-label="应用名称"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="Hermes 应用"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Owner wxid
            <input
              aria-label="Owner wxid"
              value={draft.ownerWxid}
              onChange={(event) => setDraft({ ...draft, ownerWxid: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="wxid_owner"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            默认防抖毫秒
            <input
              aria-label="默认防抖毫秒"
              inputMode="numeric"
              value={draft.defaultDebounceMs}
              onChange={(event) => setDraft({ ...draft, defaultDebounceMs: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="2000"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            默认最大等待毫秒
            <input
              aria-label="默认最大等待毫秒"
              inputMode="numeric"
              value={draft.defaultMaxWaitMs}
              onChange={(event) => setDraft({ ...draft, defaultMaxWaitMs: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="8000"
            />
          </label>
        </div>
      </section>
      {actionError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{actionError}</div> : null}
      <LoadState loading={loading} error={error} empty={!loading && apps.length === 0} emptyText="暂无应用" />
      <div className="grid gap-4 lg:grid-cols-2">
        {apps.map((app) => {
          const tokenPreview = maskToken(app.token);
          return (
            <section key={app.id} className="rounded-lg border bg-background p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium">{app.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{app.ownerWxid || "未设置 owner"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={app.status === "active" ? "online" : "disabled"} />
                  <button
                    type="button"
                    aria-label="编辑应用"
                    title="编辑应用"
                    onClick={() => handleEditApp(app)}
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="查看绑定会话"
                    title="查看绑定会话"
                    onClick={() => {
                      void handleLoadBindings(app.id);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Link2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="重置 token"
                    title="重置 token"
                    disabled={resettingId === app.id}
                    onClick={() => {
                      setConfirmingResetApp(app);
                      setResetConfirmText("");
                      setActionError(null);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <KeyRound className="size-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="绑定会话" value={`${app._count?.conversations ?? 0} 个`} />
                <Row label="默认防抖" value={`${app.defaultDebounceMs ?? 0} ms`} />
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Token</dt>
                  <dd className="flex items-center gap-2 font-mono text-xs">
                    {tokenPreview}
                    <CopyButton value={app.token} label="复制 token" />
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-md bg-muted p-3 text-xs font-mono">
                GEWEHUB_BASE_URL={window.location.origin}
                <br />
                GEWEHUB_APP_TOKEN={tokenPreview}
              </div>
            </section>
          );
        })}
      </div>
      <AlertDialog
        open={confirmingResetApp !== null}
        onOpenChange={(open) => {
          if (!open && !resettingId) {
            setConfirmingResetApp(null);
            setResetConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置 token</AlertDialogTitle>
            <AlertDialogDescription>请输入应用名称确认重置 token</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingResetApp ? (
            <div className="space-y-3">
              <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">{confirmingResetApp.name}</p>
              <label className="block text-xs text-muted-foreground">
                输入应用名称确认
                <input
                  aria-label="输入应用名称确认"
                  value={resetConfirmText}
                  disabled={resettingId === confirmingResetApp.id}
                  onChange={(event) => setResetConfirmText(event.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  autoComplete="off"
                />
              </label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(resettingId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingResetApp || resetConfirmText !== confirmingResetApp.name || resettingId === confirmingResetApp.id}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingResetApp) void handleResetToken(confirmingResetApp);
              }}
            >
              {resettingId === confirmingResetApp?.id ? "重置中" : "确认重置 token"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="rounded-lg border bg-background p-4">
        <h2 className="text-sm font-medium">应用级账号备注</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="block text-xs text-muted-foreground">
            备注应用
            <select
              aria-label="备注应用"
              value={remarkDraft.appId}
              onChange={(event) => setRemarkDraft({ ...remarkDraft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">选择应用</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>{app.name} ({app.id})</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            备注微信账号
            <select
              aria-label="备注微信账号"
              value={remarkDraft.accountId}
              onChange={(event) => setRemarkDraft({ ...remarkDraft, accountId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">选择微信账号</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.platformRemark || account.nickname || account.wxid}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            应用级账号备注
            <input
              aria-label="应用级账号备注"
              value={remarkDraft.remark}
              onChange={(event) => setRemarkDraft({ ...remarkDraft, remark: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="应用主控账号"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号标签
            <input
              aria-label="账号标签"
              value={remarkDraft.tags}
              onChange={(event) => setRemarkDraft({ ...remarkDraft, tags: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="owner,prod"
            />
          </label>
        </div>
        {remarkError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{remarkError}</div> : null}
        <button
          type="button"
          disabled={!remarkDraft.appId || !remarkDraft.accountId || savingRemark}
          onClick={() => {
            void handleSaveRemark();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-4" />
          {savingRemark ? "保存中" : "保存账号备注"}
        </button>
      </section>
      <section className="rounded-lg border bg-background p-4">
        <h2 className="text-sm font-medium">绑定会话列表</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedBindingAppId ? `当前应用：${apps.find((app) => app.id === selectedBindingAppId)?.name ?? selectedBindingAppId}` : "选择应用后可查看该应用已绑定的会话。"}
        </p>
        {bindingsError ? <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{bindingsError}</div> : null}
        <LoadState loading={bindingsLoading} error={null} empty={Boolean(selectedBindingAppId) && !bindingsLoading && boundConversations.length === 0} emptyText="该应用暂无绑定会话" />
        <div className="mt-4 divide-y">
          {boundConversations.map((conversation) => (
            <div key={conversation.id} className="flex items-center justify-between gap-4 py-3">
              <a
                href={`/workbench?conversationId=${encodeURIComponent(conversation.id)}`}
                aria-label={`打开工作台会话 ${readConversationDisplayName(conversation)}`}
                onClick={(event) => {
                  if (!router) return;
                  event.preventDefault();
                  void router.navigate({ to: "/workbench", search: { conversationId: conversation.id } });
                }}
                className="min-w-0 rounded-md hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EntityCell
                  entity={{
                    platformRemark: conversation.platformRemark,
                    displayName: conversation.name,
                    wxid: conversation.peerWxid,
                  }}
                />
              </a>
              <div className="text-xs text-muted-foreground">
                {conversation.deliveryFilter === "at_only" ? "只投递 @ 我" : "全部消息"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

interface BackendHubApp {
  id: string;
  name: string;
  token: string;
  status: "active" | "disabled";
  ownerWxid?: string | null;
  defaultDebounceMs?: number | null;
  defaultMaxWaitMs?: number | null;
  deliverSelfMessages?: boolean;
  _count?: { conversations?: number };
}

interface BackendAppConversation {
  id: string;
  peerWxid: string;
  name?: string | null;
  platformRemark?: string | null;
  deliveryFilter?: "all" | "at_only";
  debounceMs?: number | null;
  maxWaitMs?: number | null;
}

interface AppConversationsResponse {
  items: BackendAppConversation[];
  total: number;
  take: number;
  skip: number;
  nextSkip: number;
  hasMore: boolean;
}

function useApiData<T>(path: string, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const nextData = await apiFetch<T>(path);
      setData(nextData);
      setError(null);
      return nextData;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "数据加载失败");
      throw loadError;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const nextData = await apiFetch<T>(path);
        if (cancelled) return;
        setData(nextData);
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, error, reload };
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

function maskToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

function formatNullableNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readConversationDisplayName(conversation: BackendAppConversation): string {
  return conversation.platformRemark?.trim() || conversation.name?.trim() || conversation.peerWxid;
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
