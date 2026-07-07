import { observeElementRect, type Rect, type Virtualizer, useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

interface ConversationListProps {
  accounts: AccountSummary[];
  selectedAccountId: string | null;
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  loading: boolean;
  error: string | null;
  onSelectConversation: (conversationId: string) => void;
  onSelectAccount: (accountId: string) => void;
  onTogglePinned: (conversation: ConversationSummary) => void;
  onHideConversation: (conversation: ConversationSummary) => void;
  onMarkRead: (conversation: ConversationSummary) => void;
  onEditRemark: (conversation: ConversationSummary) => void;
  onOpenManagement: (conversation: ConversationSummary) => void;
}

export function ConversationList({
  accounts,
  selectedAccountId,
  conversations,
  selectedConversationId,
  loading,
  error,
  onSelectConversation,
  onSelectAccount,
  onTogglePinned,
  onHideConversation,
  onMarkRead,
  onEditRemark,
  onOpenManagement,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const filteredConversations = useMemo(
    () => filterConversations(conversations, search),
    [conversations, search],
  );
  const listItems = useMemo(() => buildConversationListItems(filteredConversations), [filteredConversations]);
  const filteredAccounts = useMemo(
    () => filterAccounts(accounts, accountSearch),
    [accounts, accountSearch],
  );
  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => (listItems[index]?.type === "section" ? 32 : 64),
    overscan: 8,
    initialRect: { width: 288, height: 640 },
    observeElementRect: observeConversationListRect,
  });

  useEffect(() => {
    function handleConversationKeyboard(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (isEditableElement(document.activeElement)) return;
      if (filteredConversations.length === 0) return;

      event.preventDefault();
      const currentIndex = filteredConversations.findIndex((conversation) => conversation.id === selectedConversationId);
      const fallbackIndex = event.key === "ArrowDown" ? -1 : filteredConversations.length;
      const nextIndex = clampIndex(
        (currentIndex >= 0 ? currentIndex : fallbackIndex) + (event.key === "ArrowDown" ? 1 : -1),
        filteredConversations.length,
      );
      const nextConversation = filteredConversations[nextIndex];
      if (!nextConversation || nextConversation.id === selectedConversationId) return;

      onSelectConversation(nextConversation.id);
    }

    window.addEventListener("keydown", handleConversationKeyboard);
    return () => window.removeEventListener("keydown", handleConversationKeyboard);
  }, [filteredConversations, onSelectConversation, selectedConversationId]);

  return (
    <aside aria-label="会话列表" className="flex w-72 shrink-0 flex-col border-r bg-background">
      <div className="space-y-3 border-b p-4">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                selectedAccount
                  ? `切换微信账号 ${selectedAccount.name} ${selectedAccount.wxid}`
                  : "切换微信账号 暂无账号"
              }
              className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm"
            >
              <AccountAvatar account={selectedAccount} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{selectedAccount?.name ?? "暂无账号"}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{selectedAccount?.wxid ?? "未接入"}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2" aria-label="微信账号选择">
            {accounts.length > 5 ? (
              <label className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-sm text-muted-foreground">
                <Search className="size-4" />
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  placeholder="搜索账号"
                />
              </label>
            ) : null}
            <div className="max-h-80 overflow-y-auto">
              {filteredAccounts.map((account) => {
                const selected = account.id === selectedAccount?.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    aria-label={`选择账号 ${account.name} ${account.wxid}`}
                    onClick={() => onSelectAccount(account.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                      selected && "bg-muted",
                    )}
                  >
                    <AccountAvatar account={account} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{formatAccountMenuName(account)}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{account.wxid}</span>
                    </span>
                    <span className={cn("text-xs", statusTextClass(account.status))}>{accountStatusLabel(account.status)}</span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" aria-label={`当前账号 ${account.name}`} />
                    ) : null}
                  </button>
                );
              })}
              {filteredAccounts.length === 0 ? <div className="px-2 py-2 text-sm text-muted-foreground">无匹配账号</div> : null}
            </div>
          </PopoverContent>
        </Popover>
        <label className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Search className="size-4" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="搜索会话"
          />
        </label>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? <div className="px-3 py-2 text-sm text-muted-foreground">正在加载会话</div> : null}
        {error ? <div className="px-3 py-2 text-sm text-destructive">{error}</div> : null}
        {!loading && conversations.length === 0 ? <div className="px-3 py-2 text-sm text-muted-foreground">暂无会话</div> : null}
        {!loading && conversations.length > 0 && filteredConversations.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">无匹配会话</div>
        ) : null}
        {listItems.length > 0 ? (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = listItems[virtualItem.index];
              if (!item) return null;
              return (
                <div
                  key={item.id}
                  className="absolute left-0 top-0 w-full py-1"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {item.type === "section" ? (
                    <div className="flex h-full items-center border-t px-3 pt-1 text-xs font-medium text-muted-foreground first:border-t-0">
                      {item.label}
                    </div>
                  ) : (
                    <ConversationRow
                      conversation={item.conversation}
                      selected={item.conversation.id === selectedConversationId}
                      onSelectConversation={onSelectConversation}
                      onTogglePinned={onTogglePinned}
                      onHideConversation={onHideConversation}
                      onMarkRead={onMarkRead}
                      onEditRemark={onEditRemark}
                      onOpenManagement={onOpenManagement}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelectConversation,
  onTogglePinned,
  onHideConversation,
  onMarkRead,
  onEditRemark,
  onOpenManagement,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  onSelectConversation: (conversationId: string) => void;
  onTogglePinned: (conversation: ConversationSummary) => void;
  onHideConversation: (conversation: ConversationSummary) => void;
  onMarkRead: (conversation: ConversationSummary) => void;
  onEditRemark: (conversation: ConversationSummary) => void;
  onOpenManagement: (conversation: ConversationSummary) => void;
}) {
  const pinned = Boolean(conversation.raw.pinnedAt);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-label={`打开会话 ${conversation.name}`}
          onClick={() => onSelectConversation(conversation.id)}
          className={cn(
            "flex h-full w-full gap-3 rounded-md px-3 py-2 text-left hover:bg-muted",
            pinned && "bg-muted/60",
            selected && (pinned ? "ring-1 ring-border" : "bg-muted"),
          )}
        >
          <Avatar name={conversation.name} src={conversation.avatarUrl} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{conversation.name}</span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">{conversation.lastMessage}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">{conversation.lastAt}</span>
            {conversation.unread > 0 ? (
              <span
                aria-label={`${conversation.name} ${conversation.unread} 条未读消息`}
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium leading-none text-destructive-foreground"
              >
                {conversation.unread > 99 ? "99+" : conversation.unread}
              </span>
            ) : null}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label="会话操作">
        <ContextMenuItem onSelect={() => deferContextMenuAction(() => onTogglePinned(conversation))}>
          {pinned ? "取消置顶" : "置顶"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => deferContextMenuAction(() => onHideConversation(conversation))}>隐藏会话</ContextMenuItem>
        {conversation.unread > 0 ? (
          <ContextMenuItem onSelect={() => deferContextMenuAction(() => onMarkRead(conversation))}>标为已读</ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => deferContextMenuAction(() => onEditRemark(conversation))}>编辑备注</ContextMenuItem>
        <ContextMenuItem onSelect={() => deferContextMenuAction(() => onOpenManagement(conversation))}>会话管理</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function deferContextMenuAction(action: () => void) {
  window.setTimeout(action, 0);
}

function filterConversations(conversations: ConversationSummary[], search: string): ConversationSummary[] {
  const keyword = search.trim().toLowerCase();
  const visibleConversations = conversations.filter((conversation) => !conversation.raw.isHidden);
  if (!keyword) return visibleConversations;
  return visibleConversations.filter((conversation) =>
    [
      conversation.name,
      conversation.originalName,
      conversation.lastMessage,
      conversation.raw.peerWxid,
    ].some((value) => value.toLowerCase().includes(keyword)),
  );
}

type ConversationListItem =
  | { type: "section"; id: string; label: string }
  | { type: "conversation"; id: string; conversation: ConversationSummary };

function buildConversationListItems(conversations: ConversationSummary[]): ConversationListItem[] {
  const pinned = conversations.filter((conversation) => conversation.raw.pinnedAt);
  const normal = conversations.filter((conversation) => !conversation.raw.pinnedAt);
  if (pinned.length === 0) return normal.map(conversationListItem);
  return [
    { type: "section", id: "section-pinned", label: "置顶" },
    ...pinned.map(conversationListItem),
    { type: "section", id: "section-normal", label: "普通会话" },
    ...normal.map(conversationListItem),
  ];
}

function conversationListItem(conversation: ConversationSummary): ConversationListItem {
  return {
    type: "conversation",
    id: conversation.id,
    conversation,
  };
}

function filterAccounts(accounts: AccountSummary[], search: string): AccountSummary[] {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return accounts;
  return accounts.filter((account) =>
    [account.name, account.wxid, account.nickname ?? "", account.platformRemark ?? ""].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
}

function AccountAvatar({ account }: { account?: AccountSummary }) {
  const name = account?.name ?? "暂无账号";
  const status = account?.status ?? "unknown";
  return (
    <span className="relative shrink-0">
      <Avatar name={name} src={account?.avatarUrl} size={32} />
      <span
        aria-label={`${name} ${accountStatusLabel(status)}`}
        className={cn(
          "absolute bottom-0 right-0 size-2 rounded-full ring-2 ring-background",
          statusDotClass(status),
        )}
      />
    </span>
  );
}

function formatAccountMenuName(account: AccountSummary): string {
  if (account.platformRemark && account.nickname && account.platformRemark !== account.nickname) {
    return `${account.platformRemark}(${account.nickname})`;
  }
  return account.name;
}

function accountStatusLabel(status: AccountSummary["status"]): string {
  if (status === "online") return "在线";
  if (status === "offline") return "离线";
  return "未知";
}

function statusDotClass(status: AccountSummary["status"]): string {
  if (status === "online") return "bg-green-500";
  if (status === "offline") return "bg-red-500";
  return "bg-muted-foreground";
}

function statusTextClass(status: AccountSummary["status"]): string {
  if (status === "online") return "text-green-700";
  if (status === "offline") return "text-red-700";
  return "text-muted-foreground";
}

function observeElementRectWithFallback(fallback: Rect) {
  return <TScrollElement extends Element, TItemElement extends Element>(
    instance: Virtualizer<TScrollElement, TItemElement>,
    callback: (rect: Rect) => void,
  ) => {
    const unsubscribe = observeElementRect(instance, (rect) => {
      callback(rect.width > 0 && rect.height > 0 ? rect : fallback);
    });
    callback(fallback);
    return unsubscribe;
  };
}

const observeConversationListRect = observeElementRectWithFallback({ width: 288, height: 640 });

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
