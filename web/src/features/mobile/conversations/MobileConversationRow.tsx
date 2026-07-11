import { MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversationSummary } from "@/lib/workspace-data";

export function MobileConversationRow({ conversation, onOpen, onMore }: { conversation: ConversationSummary; onOpen: () => void; onMore: () => void }) {
  return (
    <div className="flex min-h-[68px] items-stretch bg-background">
      <button type="button" aria-label={`打开会话 ${conversation.name}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 text-left" onClick={onOpen}>
        <span className="relative">
          <Avatar name={conversation.name} src={conversation.avatarUrl} size={40} className="rounded-md" />
          {conversation.unread > 0 ? <span aria-label={`${conversation.name} ${conversation.unread} 条未读`} className="absolute -right-2 -top-2 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white">{conversation.unread > 99 ? "99+" : conversation.unread}</span> : null}
        </span>
        <span className="min-w-0 flex-1 border-b py-3">
          <span className="flex items-center justify-between gap-2"><span className="truncate text-[15px] font-medium">{conversation.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{conversation.lastAt}</span></span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.lastMessage}</span>
        </span>
      </button>
      <button type="button" aria-label={`${conversation.name} 更多操作`} className="mobile-icon-button self-center" onClick={onMore}><MoreHorizontal className="size-5 text-muted-foreground" /></button>
    </div>
  );
}
