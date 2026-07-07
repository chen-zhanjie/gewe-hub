import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageCircle, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type BackendAccount,
  useAccountsQuery,
  useSaveAccountMutation,
  useSyncContactsMutation,
} from "../queries";
import { ContactsSheet, type ContactRow, type ContactStatusFilter, type GroupRow } from "./ContactsSheet";

type AccountRow = ReturnType<typeof mapAccountRow>;

const EMPTY_ACCOUNT_DRAFT = {
  appId: "",
  wxid: "",
  nickname: "",
  platformRemark: "",
};

export function AccountsPage() {
  const router = useRouter({ warn: false });
  const accountsQuery = useAccountsQuery();
  const saveAccountMutation = useSaveAccountMutation();
  const syncContactsMutation = useSyncContactsMutation();
  const accounts = accountsQuery.data ?? [];
  const displayAccounts = sortAccountsForOperations(accounts);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(EMPTY_ACCOUNT_DRAFT);
  const [editingAccount, setEditingAccount] = useState<BackendAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BackendAccount | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatus, setContactStatus] = useState<ContactStatusFilter>("");
  const [contacts, setContacts] = useState<BackendContact[]>([]);
  const [groups, setGroups] = useState<BackendGroup[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [openingChatKey, setOpeningChatKey] = useState<string | null>(null);

  const accountColumns = useMemo<ColumnDef<AccountRow>[]>(() => [
    {
      accessorKey: "name",
      header: "账号",
      cell: ({ row }) => <EntityCell entity={row.original.entity} />,
    },
    {
      accessorKey: "wxid",
      header: "wxid",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.wxid}</span>,
    },
    {
      accessorKey: "onlineStatus",
      header: "在线状态",
      cell: ({ row }) => <StatusBadge status={row.original.onlineStatus ?? "unknown"} />,
    },
    {
      accessorKey: "source",
      header: "来源",
      cell: ({ row }) => row.original.sourceKind === "manual" ? "手动" : "自动",
    },
    {
      accessorKey: "lastSyncedAt",
      header: "最后同步",
      cell: ({ row }) => <TimeText value={row.original.lastSyncedAt} />,
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
            aria-label="联系人"
            title="联系人"
            onClick={() => {
              void openContactsSheet(row.original.source);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <Users className="size-4" />
          </button>
          <button
            type="button"
            aria-label="编辑账号"
            title="编辑账号"
            onClick={() => openEditForm(row.original.source)}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        </div>
      ),
    },
  ], []);

  const contactColumns = useMemo<ColumnDef<ContactRow>[]>(() => [
    {
      accessorKey: "name",
      header: "联系人",
      cell: ({ row }) => <EntityCell entity={row.original.entity} />,
    },
    {
      accessorKey: "wxid",
      header: "wxid",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.wxid}</span>,
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "platformRemark",
      header: "备注",
      cell: ({ row }) => row.original.platformRemark || "—",
    },
    {
      accessorKey: "lastSyncedAt",
      header: "最后同步",
      cell: ({ row }) => <TimeText value={row.original.lastSyncedAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <OpenChatButton
          label={row.original.name}
          disabled={!selectedAccount || !canOpenContactChat(row.original.status)}
          loading={openingChatKey === openChatKey("private", row.original.wxid)}
          onClick={() => {
            if (selectedAccount) void handleOpenChat(selectedAccount.id, row.original.wxid, "private", row.original.name);
          }}
        />
      ),
    },
  ], [openingChatKey, selectedAccount]);

  const groupColumns = useMemo<ColumnDef<GroupRow>[]>(() => [
    {
      accessorKey: "name",
      header: "群",
      cell: ({ row }) => <EntityCell entity={row.original.entity} />,
    },
    {
      accessorKey: "memberCount",
      header: "成员数",
      meta: { align: "right" },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "lastSyncedAt",
      header: "最后同步",
      cell: ({ row }) => <TimeText value={row.original.lastSyncedAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <OpenChatButton
          label={row.original.name}
          disabled={!selectedAccount || !canOpenGroupChat(row.original.status)}
          loading={openingChatKey === openChatKey("group", row.original.wxid)}
          onClick={() => {
            if (selectedAccount) void handleOpenChat(selectedAccount.id, row.original.wxid, "group", row.original.name);
          }}
        />
      ),
    },
  ], [openingChatKey, selectedAccount]);

  useEffect(() => {
    if (!formOpen) return;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [formOpen]);

  function openCreateForm() {
    setEditingAccount(null);
    setDraft(EMPTY_ACCOUNT_DRAFT);
    setSaveError(null);
    setFormOpen(true);
  }

  function openEditForm(account: BackendAccount) {
    setEditingAccount(account);
    setDraft({
      appId: account.appId ?? "",
      wxid: account.wxid,
      nickname: account.nickname ?? "",
      platformRemark: account.platformRemark ?? "",
    });
    setSaveError(null);
    setFormOpen(true);
  }

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
      await saveAccountMutation.mutateAsync({ accountId: editingAccount?.id, payload });
      toast.success(editingAccount ? "账号已保存" : "账号已创建");
      setFormOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存账号失败");
    }
  }

  async function openContactsSheet(account: BackendAccount) {
    setSelectedAccount(account);
    setContactSearch("");
    setContactStatus("");
    await loadContacts(account.id, "", "");
  }

  async function loadContacts(accountId: string, q: string, status: ContactStatusFilter) {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const [nextContacts, nextGroups] = await Promise.all([
        apiFetch<BackendContact[]>(buildContactsPath(accountId, q, status)),
        apiFetch<BackendGroup[]>(buildGroupsPath(accountId, q)),
      ]);
      setContacts(nextContacts);
      setGroups(nextGroups);
    } catch (error) {
      setContacts([]);
      setGroups([]);
      setContactsError(error instanceof Error ? error.message : "联系人加载失败");
    } finally {
      setContactsLoading(false);
    }
  }

  async function handleSync(account: BackendAccount) {
    if (syncContactsMutation.isPending) return;
    setSyncError(null);
    try {
      await syncContactsMutation.mutateAsync(account.id);
      toast.success("通讯录同步任务已创建");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步失败");
    }
  }

  async function handleOpenChat(accountId: string, peerWxid: string, type: OpenConversationType, displayName: string) {
    const key = openChatKey(type, peerWxid);
    if (openingChatKey) return;
    setOpeningChatKey(key);
    try {
      const conversation = await apiFetch<OpenConversationResponse>("/api/conversations/open", {
        method: "POST",
        body: JSON.stringify({ accountId, peerWxid, type }),
      });
      toast.success(`已打开 ${displayName}`);
      await router.navigate({
        to: "/workbench",
        search: {
          accountId,
          conversationId: conversation.id,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发起聊天失败");
    } finally {
      setOpeningChatKey(null);
    }
  }

  function updateContactSearch(nextSearch: string) {
    setContactSearch(nextSearch);
    if (selectedAccount) void loadContacts(selectedAccount.id, nextSearch, contactStatus);
  }

  function updateContactStatus(nextStatus: string) {
    const status = asContactStatusFilter(nextStatus);
    setContactStatus(status);
    if (selectedAccount) void loadContacts(selectedAccount.id, contactSearch, status);
  }

  return (
    <PageShell description="查看微信账号、联系人和群成员同步状态。">
      <AccountStatusSummary accounts={accounts} loading={accountsQuery.isLoading} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">微信账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">账号表格负责状态巡检，联系人在行操作中打开。</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="size-4" />
          新增账号
        </button>
      </div>
      <LoadState
        loading={accountsQuery.isLoading}
        error={readAdminQueryError(accountsQuery.error)}
        empty={!accountsQuery.isLoading && accounts.length === 0}
        emptyText="暂无微信账号"
      />
      <DataTable
        ariaLabel="微信账号列表"
        columns={accountColumns}
        data={displayAccounts.map(mapAccountRow)}
        getRowId={(row) => row.id}
        loading={accountsQuery.isLoading}
        emptyText="暂无微信账号"
        toolbar={{
          onRefresh: () => {
            void accountsQuery.refetch();
          },
          isFetching: accountsQuery.isFetching,
        }}
      />
      <AccountFormDialog
        open={formOpen}
        title={editingAccount ? "编辑账号" : "新增账号"}
        draft={draft}
        saving={saveAccountMutation.isPending}
        error={saveError}
        firstFieldRef={firstFieldRef}
        onDraftChange={setDraft}
        onOpenChange={(open) => {
          if (!open && !saveAccountMutation.isPending) setFormOpen(false);
        }}
        onSave={() => {
          void handleSaveAccount();
        }}
      />
      <ContactsSheet
        open={selectedAccount !== null}
        accountName={selectedAccount ? readAccountDisplayName(selectedAccount) : undefined}
        contacts={contacts.map(mapContactRow)}
        groups={groups.map(mapGroupRow)}
        loading={contactsLoading}
        error={contactsError || syncError}
        search={contactSearch}
        status={contactStatus}
        syncing={syncContactsMutation.isPending}
        contactColumns={contactColumns}
        groupColumns={groupColumns}
        onSearchChange={updateContactSearch}
        onStatusChange={updateContactStatus}
        onSync={() => {
          if (selectedAccount) void handleSync(selectedAccount);
        }}
        onOpenChange={(open) => {
          if (!open) setSelectedAccount(null);
        }}
      />
    </PageShell>
  );
}

function AccountFormDialog({
  open,
  title,
  draft,
  saving,
  error,
  firstFieldRef,
  onDraftChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: typeof EMPTY_ACCOUNT_DRAFT;
  saving: boolean;
  error: string | null;
  firstFieldRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: typeof EMPTY_ACCOUNT_DRAFT) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>录入 GeWe appId、账号 wxid 与平台备注。</DialogDescription>
        </DialogHeader>
        <fieldset disabled={saving} className="space-y-3 disabled:opacity-70">
          <label className="block text-xs text-muted-foreground">
            GeWe appId
            <input
              ref={firstFieldRef}
              aria-label="GeWe appId"
              value={draft.appId}
              onChange={(event) => onDraftChange({ ...draft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="wx_app"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号 wxid
            <input
              aria-label="账号 wxid"
              value={draft.wxid}
              onChange={(event) => onDraftChange({ ...draft, wxid: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="wxid_bot"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号昵称
            <input
              aria-label="账号昵称"
              value={draft.nickname}
              onChange={(event) => onDraftChange({ ...draft, nickname: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="客服主号"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            平台备注
            <input
              aria-label="平台备注"
              value={draft.platformRemark}
              onChange={(event) => onDraftChange({ ...draft, platformRemark: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="主控账号"
            />
          </label>
          {error ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
        </fieldset>
        <DialogFooter>
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
            取消
          </button>
          <button
            type="button"
            disabled={!draft.appId.trim() || !draft.wxid.trim() || saving}
            onClick={onSave}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存账号"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountStatusSummary({ accounts, loading }: { accounts: BackendAccount[]; loading: boolean }) {
  const offlineAccounts = accounts.filter((account) => account.onlineStatus === "offline");
  const hasOfflineAccounts = offlineAccounts.length > 0;

  return (
    <section
      role="status"
      aria-label={loading ? "微信账号状态检查中" : "微信账号状态摘要"}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background px-4 py-3 shadow-sm",
        hasOfflineAccounts ? "border-destructive/30 text-destructive" : "border-emerald-200 text-emerald-800",
      )}
    >
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

interface BackendContact {
  id: string;
  wxid: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  status?: "active" | "deleted" | "blocked";
  lastSyncedAt?: string | Date | null;
}

interface BackendGroup {
  id: string;
  wxid: string;
  name?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  memberCount?: number | null;
  status?: "active" | "disbanded" | "quit";
  lastSyncedAt?: string | Date | null;
  _count?: { members?: number };
}

type OpenConversationType = "private" | "group";

interface OpenConversationResponse {
  id: string;
  accountId: string;
  peerWxid: string;
  type: OpenConversationType;
  name?: string | null;
  avatarUrl?: string | null;
}

function OpenChatButton({
  label,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`发起聊天 ${label}`}
      title={`发起聊天 ${label}`}
      disabled={disabled || loading}
      onClick={onClick}
      className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MessageCircle className={cn("size-4", loading && "animate-pulse")} />
    </button>
  );
}

function mapAccountRow(account: BackendAccount) {
  return {
    id: account.id,
    wxid: account.wxid,
    name: readAccountDisplayName(account),
    entity: {
      platformRemark: account.platformRemark,
      displayName: account.nickname,
      wxid: account.wxid,
    },
    appId: account.appId,
    onlineStatus: account.onlineStatus ?? "unknown",
    sourceKind: account.source ?? "auto",
    lastSyncedAt: account.lastSyncedAt,
    source: account,
  };
}

function mapContactRow(contact: BackendContact) {
  return {
    id: contact.id,
    wxid: contact.wxid,
    name: contact.platformRemark || contact.nickname || contact.wxid,
    entity: {
      platformRemark: contact.platformRemark,
      displayName: contact.nickname,
      wxid: contact.wxid,
      avatarUrl: contact.avatarUrl,
    },
    status: contact.status ?? "active",
    platformRemark: contact.platformRemark,
    lastSyncedAt: contact.lastSyncedAt,
  };
}

function mapGroupRow(group: BackendGroup) {
  return {
    id: group.id,
    wxid: group.wxid,
    name: group.platformRemark || group.name || group.wxid,
    entity: {
      platformRemark: group.platformRemark,
      displayName: group.name,
      wxid: group.wxid,
      avatarUrl: group.avatarUrl,
    },
    memberCount: group.memberCount ?? group._count?.members ?? 0,
    status: group.status ?? "active",
    lastSyncedAt: group.lastSyncedAt,
  };
}

function canOpenContactChat(status: ContactRow["status"]): boolean {
  return status === "active";
}

function canOpenGroupChat(status: GroupRow["status"]): boolean {
  return status === "active";
}

function openChatKey(type: OpenConversationType, peerWxid: string): string {
  return `${type}:${peerWxid}`;
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

function buildContactsPath(accountId: string, q: string, status: ContactStatusFilter): string {
  const params = new URLSearchParams({ accountId });
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  return `/api/contacts?${params.toString()}`;
}

function buildGroupsPath(accountId: string, q: string): string {
  const params = new URLSearchParams({ accountId });
  if (q.trim()) params.set("q", q.trim());
  return `/api/groups?${params.toString()}`;
}

function asContactStatusFilter(value: string): ContactStatusFilter {
  return value === "active" || value === "deleted" || value === "blocked" ? value : "";
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
  if (empty) return null;
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
