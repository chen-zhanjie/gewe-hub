import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Link2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/DataTable";
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { apiFetch } from "@/lib/api";
import type { BackendAccount } from "../queries";
import { AppFormSheet } from "./AppFormSheet";
import { BindingSheet } from "./BindingSheet";
import { ResetTokenDialog } from "./ResetTokenDialog";
import {
  AppConversationsResponse,
  BackendAppConversation,
  BackendHubApp,
  EMPTY_APP_DRAFT,
  buildAccountRemarksPayload,
  buildRemarkDrafts,
  formatNullableNumber,
  mapBoundConversationRow,
  optionalText,
  parseOptionalInteger,
} from "./types";

type AppRow = ReturnType<typeof mapAppRow>;

export function AppsPage() {
  const router = useRouter({ warn: false });
  const { data: apps, loading, error, reload } = useApiData<BackendHubApp[]>("/api/apps", []);
  const { data: accounts } = useApiData<BackendAccount[]>("/api/accounts", []);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const consumedNewAppHashRef = useRef(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<BackendHubApp | null>(null);
  const [draft, setDraft] = useState(EMPTY_APP_DRAFT);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, { remark: string; tags: string }>>({});
  const [savingApp, setSavingApp] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmingResetApp, setConfirmingResetApp] = useState<BackendHubApp | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [bindingApp, setBindingApp] = useState<BackendHubApp | null>(null);
  const [boundConversations, setBoundConversations] = useState<BackendAppConversation[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsError, setBindingsError] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState("");

  const rows = apps.map(mapAppRow).filter((row) => matchesAppSearch(row, appSearch));
  const appColumns = useMemo<ColumnDef<AppRow>[]>(() => [
    {
      accessorKey: "name",
      header: "名称",
      cell: ({ row }) => <EntityCell entity={{ platformRemark: row.original.name, wxid: row.original.id }} />,
    },
    {
      accessorKey: "ownerWxid",
      header: "Owner",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.ownerWxid || "未设置"}</span>,
    },
    {
      accessorKey: "conversationCount",
      header: "绑定会话",
      cell: ({ row }) => `${row.original.conversationCount} 个`,
      meta: { align: "right" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={row.original.status === "active" ? "online" : "disabled"} />,
    },
    {
      accessorKey: "createdAt",
      header: "创建时间",
      cell: ({ row }) => <TimeText value={row.original.createdAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="编辑应用"
            title="编辑应用"
            onClick={() => openEditForm(row.original.source)}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label="查看绑定会话"
            title="查看绑定会话"
            onClick={() => {
              void openBindingSheet(row.original.source);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <Link2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="重置 token"
            title="重置 token"
            disabled={resettingId === row.original.id}
            onClick={() => {
              setConfirmingResetApp(row.original.source);
              setResetConfirmText("");
              setActionError(null);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KeyRound className="size-4" />
          </button>
        </div>
      ),
    },
  ], [resettingId]);

  useEffect(() => {
    if (!formOpen) return;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [formOpen]);

  function openCreateForm() {
    setEditingApp(null);
    setDraft(EMPTY_APP_DRAFT);
    setRemarkDrafts(buildRemarkDrafts(null, accounts));
    setActionError(null);
    setFormOpen(true);
  }

  useEffect(() => {
    function consumeNewAppHash() {
      if (window.location.hash !== "#new-app") {
        consumedNewAppHashRef.current = false;
        return;
      }
      if (consumedNewAppHashRef.current) return;
      consumedNewAppHashRef.current = true;
      openCreateForm();
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    consumeNewAppHash();
    window.addEventListener("hashchange", consumeNewAppHash);
    window.addEventListener("popstate", consumeNewAppHash);
    return () => {
      window.removeEventListener("hashchange", consumeNewAppHash);
      window.removeEventListener("popstate", consumeNewAppHash);
    };
  }, [accounts]);

  function openEditForm(app: BackendHubApp) {
    setEditingApp(app);
    setDraft({
      name: app.name,
      ownerWxid: app.ownerWxid ?? "",
      mainConversationId: app.mainConversationId ?? "",
      defaultDebounceMs: formatNullableNumber(app.defaultDebounceMs),
      defaultMaxWaitMs: formatNullableNumber(app.defaultMaxWaitMs),
      deliverSelfMessages: app.deliverSelfMessages ?? false,
    });
    setRemarkDrafts(buildRemarkDrafts(app, accounts));
    setActionError(null);
    setFormOpen(true);
  }

  async function handleSaveApp() {
    const name = draft.name.trim();
    if (!name || savingApp) return;
    setSavingApp(true);
    setActionError(null);
    try {
      await apiFetch(editingApp ? `/api/apps/${editingApp.id}` : "/api/apps", {
        method: editingApp ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          ownerWxid: optionalText(draft.ownerWxid),
          mainConversationId: optionalText(draft.mainConversationId),
          defaultDebounceMs: parseOptionalInteger(draft.defaultDebounceMs),
          defaultMaxWaitMs: parseOptionalInteger(draft.defaultMaxWaitMs),
          deliverSelfMessages: draft.deliverSelfMessages,
          ...(editingApp ? { accountRemarks: buildAccountRemarksPayload(remarkDrafts) } : {}),
        }),
      });
      toast.success(editingApp ? "应用已保存" : "应用已创建");
      setFormOpen(false);
      await reload();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "保存应用失败");
    } finally {
      setSavingApp(false);
    }
  }

  async function handleResetToken(app: BackendHubApp) {
    if (resettingId || resetConfirmText !== app.name) return;
    setResettingId(app.id);
    setActionError(null);
    try {
      await apiFetch(`/api/apps/${app.id}/reset-token`, { method: "POST" });
      await reload();
      toast.success("token 已重置");
      setConfirmingResetApp(null);
      setResetConfirmText("");
    } catch (resetError) {
      setActionError(resetError instanceof Error ? resetError.message : "重置 token 失败");
    } finally {
      setResettingId(null);
    }
  }

  async function openBindingSheet(app: BackendHubApp) {
    setBindingApp(app);
    setBindingsLoading(true);
    setBindingsError(null);
    try {
      const response = await apiFetch<AppConversationsResponse | BackendAppConversation[]>(`/api/apps/${app.id}/conversations?take=50&skip=0`);
      setBoundConversations(Array.isArray(response) ? response : response.items);
    } catch (loadError) {
      setBindingsError(loadError instanceof Error ? loadError.message : "绑定会话加载失败");
      setBoundConversations([]);
    } finally {
      setBindingsLoading(false);
    }
  }

  return (
    <PageShell description="管理 Hub 应用、SSE token、会话绑定和应用级备注。">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">应用管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">应用、token 与绑定会话都在行操作中管理。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="size-4" />
          新增应用
        </button>
      </div>
      {actionError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{actionError}</div> : null}
      <LoadState loading={loading} error={error} />
      <DataTable
        ariaLabel="应用列表"
        columns={appColumns}
        data={rows}
        getRowId={(row) => row.id}
        loading={loading}
        emptyText={appSearch ? "没有匹配的应用" : "暂无应用"}
        toolbar={{
          searchPlaceholder: "搜索应用",
          searchValue: appSearch,
          onSearchChange: setAppSearch,
          onRefresh: () => {
            void reload();
          },
          isFetching: loading,
        }}
      />
      <AppFormSheet
        open={formOpen}
        title={editingApp ? "编辑应用" : "新增应用"}
        app={editingApp}
        accounts={accounts}
        draft={draft}
        remarkDrafts={remarkDrafts}
        saving={savingApp}
        error={actionError}
        firstFieldRef={firstFieldRef}
        onDraftChange={setDraft}
        onRemarkDraftsChange={setRemarkDrafts}
        onOpenChange={(open) => {
          if (!open && !savingApp) setFormOpen(false);
        }}
        onSave={() => {
          void handleSaveApp();
        }}
      />
      <BindingSheet
        app={bindingApp}
        rows={boundConversations.map(mapBoundConversationRow)}
        loading={bindingsLoading}
        error={bindingsError}
        onOpenChange={(open) => {
          if (!open) setBindingApp(null);
        }}
        onOpenWorkbench={(conversationId) => {
          void router.navigate({ to: "/workbench", search: { conversationId } });
        }}
      />
      <ResetTokenDialog
        app={confirmingResetApp}
        resettingId={resettingId}
        confirmText={resetConfirmText}
        onConfirmTextChange={setResetConfirmText}
        onOpenChange={(open) => {
          if (!open && !resettingId) {
            setConfirmingResetApp(null);
            setResetConfirmText("");
          }
        }}
        onConfirm={() => {
          if (confirmingResetApp) void handleResetToken(confirmingResetApp);
        }}
      />
    </PageShell>
  );
}

function mapAppRow(app: BackendHubApp) {
  return {
    id: app.id,
    name: app.name,
    ownerWxid: app.ownerWxid ?? "",
    conversationCount: app._count?.conversations ?? 0,
    status: app.status,
    createdAt: app.createdAt,
    source: app,
  };
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

function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">正在加载</div>;
  if (error) return <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div>;
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

function matchesAppSearch(row: AppRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [row.name, row.ownerWxid, row.id, row.status].some((value) => String(value).toLowerCase().includes(normalizedQuery));
}
