import { observeElementRect, type Rect, type Virtualizer, useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

interface ConversationListProps {
  accounts: AccountSummary[];
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  loading: boolean;
  error: string | null;
  onSelectConversation: (conversationId: string) => void;
}

export function ConversationList({
  accounts,
  conversations,
  selectedConversationId,
  loading,
  error,
  onSelectConversation,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const filteredConversations = useMemo(
    () => filterConversations(conversations, search),
    [conversations, search],
  );
  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 64,
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
        <button type="button" className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>{accounts[0]?.name ?? "暂无账号"}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
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
        {filteredConversations.length > 0 ? (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const conversation = filteredConversations[virtualItem.index];
              if (!conversation) return null;
              return (
                <div
                  key={conversation.id}
                  className="absolute left-0 top-0 w-full py-1"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={`打开会话 ${conversation.name}`}
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      "flex h-full w-full gap-3 rounded-md px-3 py-2 text-left",
                      conversation.id === selectedConversationId && "bg-muted",
                    )}
                  >
                    <Avatar name={conversation.name} src={conversation.avatarUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{conversation.name}</span>
                        {conversation.appName ? <StatusBadge status="delivered" className="shrink-0" /> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{conversation.lastMessage}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">{conversation.lastAt}</span>
                      {conversation.unread > 0 ? (
                        <span
                          aria-label={`${conversation.name} ${conversation.unread} 条未读消息`}
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium leading-none text-primary-foreground"
                        >
                          {conversation.unread > 99 ? "99+" : conversation.unread}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function filterConversations(conversations: ConversationSummary[], search: string): ConversationSummary[] {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return conversations;
  return conversations.filter((conversation) =>
    [
      conversation.name,
      conversation.lastMessage,
      conversation.raw.peerWxid,
      conversation.appName ?? "",
    ].some((value) => value.toLowerCase().includes(keyword)),
  );
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
