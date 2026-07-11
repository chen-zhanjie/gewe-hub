import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { formatMs, mapBoundConversationRow, type BackendAppConversation, type BackendHubApp } from "@/features/admin/apps/types";
import { MobilePage } from "../MobilePage";
import { MobileEntityCard } from "./MobileEntityCard";

export function MobileAppBindingsPage({ app, conversations, loading, error, onBack, onOpenConversation }: { app: BackendHubApp; conversations: BackendAppConversation[]; loading: boolean; error: string | null; onBack: () => void; onOpenConversation?: (conversationId: string) => void }) {
  const rows = conversations.map(mapBoundConversationRow);
  return <MobilePage title="绑定会话" subtitle={app.name} onBack={onBack}>
    <div className="grid gap-3 p-4">
      {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
      {error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">该应用暂无绑定会话</p> : null}
      <div role="list" aria-label="应用绑定会话列表" className="grid gap-3">
        {rows.map((row) => <div role="listitem" key={row.id}><MobileEntityCard title={row.name} subtitle={row.entity.wxid} badge={<StatusBadge status={row.deliveryFilter === "at_only" ? "confirm" : "online"} />} details={<><span>{row.type} · {row.deliveryFilterText}</span><span>防抖 {formatMs(row.debounceMs)}</span><span>绑定时间 <TimeText value={row.boundAt ?? row.updatedAt} /></span></>} actions={onOpenConversation ? <button type="button" aria-label={`打开工作台会话 ${row.name}`} onClick={() => onOpenConversation(row.id)} className="col-span-2 min-h-10 rounded-lg border text-sm">打开会话</button> : undefined} /></div>)}
      </div>
    </div>
  </MobilePage>;
}
