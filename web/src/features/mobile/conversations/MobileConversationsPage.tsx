import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { MobilePage } from "@/features/mobile/MobilePage";
import { loadMobileAccountId, storeMobileAccountId } from "@/features/mobile/mobile-selection-storage";
import { adminEventSourceStatusEvent, type AdminEventSourceStatusDetail, useRefreshWorkbenchQueries, useWorkbenchAdminEvents, useWorkbenchWorkspaceQuery } from "@/features/workbench/queries";
import { useWorkbenchConversationActions } from "@/features/workbench/useWorkbenchConversationActions";
import { useConversationUnreadState } from "@/features/workbench/useConversationUnreadState";
import { filterConversationsForAccount } from "@/features/workbench/workbench-conversation-filter";
import { readQueryError } from "@/features/workbench/workbench-helpers";
import { mapAccountSummary, mapConversationSummary, type ConversationSummary } from "@/lib/workspace-data";
import { MobileAccountPicker } from "./MobileAccountPicker";
import { MobileConversationActions } from "./MobileConversationActions";
import { MobileConversationRow } from "./MobileConversationRow";

export function MobileConversationsPage({ onOpenConversation, onOpenManagement = () => {} }: { onOpenConversation: (conversationId: string) => void; onOpenManagement?: (conversationId: string) => void }) {
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => loadMobileAccountId());
  const [search, setSearch] = useState("");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [actionConversation, setActionConversation] = useState<ConversationSummary | null>(null);
  const [eventStatus, setEventStatus] = useState<AdminEventSourceStatusDetail["status"]>("connected");
  const accounts = useMemo(() => (workspaceQuery.data?.accounts ?? []).map(mapAccountSummary), [workspaceQuery.data?.accounts]);
  const conversations = useMemo(() => (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary), [workspaceQuery.data?.conversations]);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const accountConversations = useMemo(() => filterConversationsForAccount(conversations, selectedAccount?.id ?? null), [conversations, selectedAccount?.id]);
  const { conversationsWithUnread, clearConversationUnread } = useConversationUnreadState(accountConversations, null);
  const { refreshWorkspace } = useRefreshWorkbenchQueries();
  const actions = useWorkbenchConversationActions({ refreshWorkspace, clearConversationUnread });
  const managedConversations = useMemo(() => actions.applyConversationOverlays(conversationsWithUnread), [actions, conversationsWithUnread]);
  useWorkbenchAdminEvents(null);

  useEffect(() => {
    if (!selectedAccount && accounts[0]) { setSelectedAccountId(accounts[0].id); storeMobileAccountId(accounts[0].id); }
  }, [accounts, selectedAccount]);
  useEffect(() => {
    const handler = (event: Event) => setEventStatus((event as CustomEvent<AdminEventSourceStatusDetail>).detail.status);
    window.addEventListener(adminEventSourceStatusEvent, handler);
    return () => window.removeEventListener(adminEventSourceStatusEvent, handler);
  }, []);

  const keyword = search.trim().toLowerCase();
  const filtered = managedConversations.filter((conversation) => !keyword || [conversation.name, conversation.originalName, conversation.lastMessage, conversation.raw.peerWxid].some((value) => value.toLowerCase().includes(keyword)));
  const pinned = filtered.filter((conversation) => conversation.raw.pinnedAt);
  const normal = filtered.filter((conversation) => !conversation.raw.pinnedAt);
  const error = readQueryError(workspaceQuery.error);

  return (
    <MobilePage title="会话" subtitle={selectedAccount ? `${selectedAccount.name} · ${selectedAccount.status === "online" ? "在线" : selectedAccount.status === "offline" ? "离线" : "未知"}` : "暂无微信账号"} actions={<button type="button" aria-label={selectedAccount ? `切换微信账号 ${selectedAccount.name}` : "切换微信账号"} className="mobile-icon-button" onClick={() => setAccountPickerOpen(true)}><ChevronDown className="size-5" /></button>}>
      {eventStatus === "disconnected" ? <div className="bg-amber-100 px-3 py-2 text-center text-xs text-amber-800">连接已断开，正在重连…</div> : null}
      <label className="m-2 flex min-h-10 items-center gap-2 rounded-md bg-background px-3 text-muted-foreground"><Search className="size-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {workspaceQuery.isLoading ? <div className="p-4 text-sm text-muted-foreground">正在加载会话</div> : null}
        {error ? <div className="p-4 text-sm text-destructive">{error}</div> : null}
        {!workspaceQuery.isLoading && !error && accountConversations.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">暂无会话</div> : null}
        {!workspaceQuery.isLoading && accountConversations.length > 0 && filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">无匹配会话</div> : null}
        {pinned.length > 0 ? <><div className="px-3 py-1 text-xs text-muted-foreground">置顶</div>{pinned.map(renderRow)}</> : null}
        {pinned.length > 0 && normal.length > 0 ? <div className="px-3 py-1 text-xs text-muted-foreground">普通会话</div> : null}
        {normal.map(renderRow)}
      </div>
      <MobileAccountPicker open={accountPickerOpen} accounts={accounts} selectedAccountId={selectedAccount?.id ?? null} onSelect={(accountId) => { setSelectedAccountId(accountId); storeMobileAccountId(accountId); }} onClose={() => setAccountPickerOpen(false)} />
      <MobileConversationActions conversation={actionConversation} onClose={() => setActionConversation(null)} onTogglePinned={() => actionConversation && void actions.togglePinned(actionConversation)} onMarkRead={() => actionConversation && void actions.markRead(actionConversation)} onEditRemark={() => actionConversation && actions.openRemarkDialog(actionConversation)} onManage={() => actionConversation && onOpenManagement(actionConversation.id)} onHide={() => actionConversation && void actions.hideConversation(actionConversation)} />
    </MobilePage>
  );

  function renderRow(conversation: ConversationSummary) {
    return <MobileConversationRow key={conversation.id} conversation={conversation} onOpen={() => { clearConversationUnread(conversation.id); onOpenConversation(conversation.id); }} onMore={() => setActionConversation(conversation)} />;
  }
}
