import { ChevronDown, MessageCircle, RefreshCcw, Search, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/Avatar";
import { MobilePage } from "@/features/mobile/MobilePage";
import { MobileAccountPicker } from "@/features/mobile/conversations/MobileAccountPicker";
import { loadMobileAccountId, storeMobileAccountId } from "@/features/mobile/mobile-selection-storage";
import { type BackendAccount, useAccountsQuery, useSyncContactsMutation } from "@/features/admin/queries";
import { apiFetch } from "@/lib/api";
import { waitForOutboxTaskDone } from "@/lib/outbox-task";
import { cn } from "@/lib/utils";
import { mapAccountSummary } from "@/lib/workspace-data";

type ContactStatusFilter = "" | "active" | "deleted" | "blocked";
type ActiveTab = "contacts" | "groups";
type OpenConversationType = "private" | "group";

interface BackendContact {
  id: string;
  wxid: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  status?: "active" | "deleted" | "blocked";
}

interface BackendGroup {
  id: string;
  wxid: string;
  name?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  memberCount?: number | null;
  status?: "active" | "disbanded" | "quit";
  _count?: { members?: number };
}

interface OpenConversationResponse { id: string }
interface OutboxTaskResponse { id: string }

export function MobileContactsPage({ onOpenConversation }: { onOpenConversation: (conversationId: string) => void }) {
  const accountsQuery = useAccountsQuery();
  const syncContactsMutation = useSyncContactsMutation();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => loadMobileAccountId());
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("contacts");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContactStatusFilter>("");
  const [contacts, setContacts] = useState<BackendContact[]>([]);
  const [groups, setGroups] = useState<BackendGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingChatKey, setOpeningChatKey] = useState<string | null>(null);
  const [syncingGroupId, setSyncingGroupId] = useState<string | null>(null);

  const backendAccounts = accountsQuery.data ?? [];
  const accounts = useMemo(() => backendAccounts.map(mapAccountSummary), [backendAccounts]);
  const selectedAccount = backendAccounts.find((account) => account.id === selectedAccountId) ?? backendAccounts[0];
  const selectedAccountSummary = accounts.find((account) => account.id === selectedAccount?.id);

  useEffect(() => {
    const fallbackAccount = backendAccounts[0];
    if (!fallbackAccount || backendAccounts.some((account) => account.id === selectedAccountId)) return;
    setSelectedAccountId(fallbackAccount.id);
    storeMobileAccountId(fallbackAccount.id);
  }, [backendAccounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccount) {
      setContacts([]);
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      apiFetch<BackendContact[]>(buildContactsPath(selectedAccount.id, search, status)),
      apiFetch<BackendGroup[]>(buildGroupsPath(selectedAccount.id, search)),
    ]).then(([nextContacts, nextGroups]) => {
      if (cancelled) return;
      setContacts(nextContacts);
      setGroups(nextGroups);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setContacts([]);
      setGroups([]);
      setError(loadError instanceof Error ? loadError.message : "联系人加载失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [search, selectedAccount, status]);

  async function handleSyncContacts() {
    if (!selectedAccount || selectedAccount.status === "disabled" || syncContactsMutation.isPending) return;
    try {
      await syncContactsMutation.mutateAsync(selectedAccount.id);
      toast.success("通讯录同步任务已创建");
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : "同步失败");
    }
  }

  async function handleOpenChat(peerWxid: string, type: OpenConversationType, displayName: string) {
    if (!selectedAccount || openingChatKey) return;
    const key = `${type}:${peerWxid}`;
    setOpeningChatKey(key);
    try {
      const conversation = await apiFetch<OpenConversationResponse>("/api/conversations/open", {
        method: "POST",
        body: JSON.stringify({ accountId: selectedAccount.id, peerWxid, type }),
      });
      toast.success(`已打开 ${displayName}`);
      onOpenConversation(conversation.id);
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : "发起聊天失败");
    } finally {
      setOpeningChatKey(null);
    }
  }

  async function handleSyncGroupMembers(group: BackendGroup) {
    if (group.status !== undefined && group.status !== "active" || syncingGroupId) return;
    const displayName = readGroupName(group);
    setSyncingGroupId(group.id);
    try {
      const task = await apiFetch<OutboxTaskResponse>(`/api/groups/${group.id}/sync-members`, { method: "POST" });
      toast.success(`已创建 ${displayName} 的群成员同步任务`);
      await waitForOutboxTaskDone(task.id);
      if (selectedAccount) {
        const nextGroups = await apiFetch<BackendGroup[]>(buildGroupsPath(selectedAccount.id, search));
        setGroups(nextGroups);
      }
    } catch (syncError) {
      toast.error(syncError instanceof Error ? syncError.message : "同步群成员失败");
    } finally {
      setSyncingGroupId(null);
    }
  }

  function selectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    storeMobileAccountId(accountId);
    setSearch("");
    setStatus("");
  }

  const accountName = selectedAccountSummary?.name ?? readAccountName(selectedAccount);

  return (
    <MobilePage
      title="通讯录"
      subtitle={selectedAccount ? accountName : "暂无微信账号"}
      actions={
        <div className="flex items-center gap-1">
          <button type="button" aria-label="同步通讯录" className="mobile-icon-button" disabled={!selectedAccount || selectedAccount.status === "disabled" || syncContactsMutation.isPending} onClick={() => void handleSyncContacts()}>
            <RefreshCcw className={cn("size-5", syncContactsMutation.isPending && "animate-spin")} />
          </button>
          <button type="button" aria-label={selectedAccount ? `切换微信账号 ${accountName}` : "切换微信账号"} className="mobile-icon-button" onClick={() => setAccountPickerOpen(true)}>
            <ChevronDown className="size-5" />
          </button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 border-b bg-background px-3 pt-2">
        <div role="tablist" aria-label="通讯录分类" className="grid grid-cols-2 rounded-md bg-muted p-1">
          <TabButton active={activeTab === "contacts"} onClick={() => setActiveTab("contacts")}>联系人</TabButton>
          <TabButton active={activeTab === "groups"} onClick={() => setActiveTab("groups")}>群列表</TabButton>
        </div>
        <label className="mt-2 flex min-h-10 items-center gap-2 rounded-md bg-muted px-3 text-muted-foreground">
          <Search className="size-4" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索联系人或群" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
        </label>
        {activeTab === "contacts" ? (
          <label className="my-2 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>状态</span>
            <select aria-label="联系人状态" value={status} onChange={(event) => setStatus(asContactStatusFilter(event.target.value))} className="min-h-9 rounded-md border bg-background px-3 text-sm text-foreground">
              <option value="">全部</option>
              <option value="active">active</option>
              <option value="deleted">deleted</option>
              <option value="blocked">blocked</option>
            </select>
          </label>
        ) : <div className="h-2" />}
      </div>

      {error ? <div className="m-3 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      {loading ? <div className="p-4 text-sm text-muted-foreground">正在加载通讯录</div> : null}
      {!loading && !error && activeTab === "contacts" ? (
        contacts.length > 0 ? <div>{contacts.map((contact) => <ContactItem key={contact.id} contact={contact} opening={openingChatKey === `private:${contact.wxid}`} onOpenChat={handleOpenChat} />)}</div> : <EmptyState icon={<Users className="size-8" />} text="暂无联系人" />
      ) : null}
      {!loading && !error && activeTab === "groups" ? (
        groups.length > 0 ? <div>{groups.map((group) => <GroupItem key={group.id} group={group} opening={openingChatKey === `group:${group.wxid}`} syncing={syncingGroupId === group.id} onOpenChat={handleOpenChat} onSyncMembers={handleSyncGroupMembers} />)}</div> : <EmptyState icon={<Users className="size-8" />} text="暂无群聊" />
      ) : null}

      <MobileAccountPicker open={accountPickerOpen} accounts={accounts} selectedAccountId={selectedAccount?.id ?? null} onSelect={selectAccount} onClose={() => setAccountPickerOpen(false)} />
    </MobilePage>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("min-h-9 rounded px-3 text-sm", active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground")}>{children}</button>;
}

function ContactItem({ contact, opening, onOpenChat }: { contact: BackendContact; opening: boolean; onOpenChat: (wxid: string, type: OpenConversationType, name: string) => void }) {
  const name = readContactName(contact);
  const active = (contact.status ?? "active") === "active";
  return (
    <article data-testid={`contact-${contact.id}`} className={cn("flex min-h-16 items-center gap-3 border-b px-3 py-2", !active && "opacity-50 grayscale")}>
      <Avatar name={name} src={contact.avatarUrl} size={40} />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{name}</div><div className="truncate font-mono text-xs text-muted-foreground">{contact.wxid}</div><div className="text-xs text-muted-foreground">{contact.status ?? "active"}</div></div>
      <button type="button" aria-label={`发起聊天 ${name}`} disabled={!active || opening} onClick={() => onOpenChat(contact.wxid, "private", name)} className="mobile-icon-button"><MessageCircle className={cn("size-5", opening && "animate-pulse")} /></button>
    </article>
  );
}

function GroupItem({ group, opening, syncing, onOpenChat, onSyncMembers }: { group: BackendGroup; opening: boolean; syncing: boolean; onOpenChat: (wxid: string, type: OpenConversationType, name: string) => void; onSyncMembers: (group: BackendGroup) => void }) {
  const name = readGroupName(group);
  const active = (group.status ?? "active") === "active";
  const memberCount = group.memberCount ?? group._count?.members ?? 0;
  return (
    <article data-testid={`group-${group.id}`} className={cn("flex min-h-16 items-center gap-3 border-b px-3 py-2", !active && "opacity-50 grayscale")}>
      <Avatar name={name} src={group.avatarUrl} size={40} />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{name}</div><div className="text-xs text-muted-foreground"><span>{memberCount} 人</span> · {group.status ?? "active"}</div></div>
      <button type="button" aria-label={`同步群成员 ${name}`} disabled={!active || syncing} onClick={() => void onSyncMembers(group)} className="mobile-icon-button"><RefreshCcw className={cn("size-5", syncing && "animate-spin")} /></button>
      <button type="button" aria-label={`发起聊天 ${name}`} disabled={!active || opening} onClick={() => onOpenChat(group.wxid, "group", name)} className="mobile-icon-button"><MessageCircle className={cn("size-5", opening && "animate-pulse")} /></button>
    </article>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">{icon}<span>{text}</span></div>;
}

function readAccountName(account: BackendAccount | undefined): string {
  return account?.platformRemark || account?.nickname || account?.wxid || "暂无微信账号";
}

function readContactName(contact: BackendContact): string {
  return contact.platformRemark || contact.nickname || contact.wxid;
}

function readGroupName(group: BackendGroup): string {
  return group.platformRemark || group.name || group.wxid;
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
