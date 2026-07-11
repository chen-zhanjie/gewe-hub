import type { ConversationSummary } from "@/lib/workspace-data";

export function MobileConversationActions({ conversation, onClose, onTogglePinned, onMarkRead, onEditRemark, onManage, onHide }: { conversation: ConversationSummary | null; onClose: () => void; onTogglePinned: () => void; onMarkRead: () => void; onEditRemark: () => void; onManage: () => void; onHide: () => void }) {
  if (!conversation) return null;
  const actions = [
    { label: conversation.raw.pinnedAt ? "取消置顶" : "置顶", run: onTogglePinned },
    ...(conversation.unread > 0 ? [{ label: "标为已读", run: onMarkRead }] : []),
    { label: "编辑备注", run: onEditRemark },
    { label: "会话管理", run: onManage },
    { label: "隐藏会话", run: onHide, danger: true },
  ];
  return (
    <div className="mobile-action-overlay" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`${conversation.name} 会话操作`} className="mobile-action-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-action-handle" /><h2 className="pb-2 text-center text-sm font-medium">{conversation.name}</h2>
        {actions.map((action) => <button key={action.label} type="button" className={`min-h-12 w-full border-t text-sm ${action.danger ? "text-destructive" : ""}`} onClick={() => { action.run(); onClose(); }}>{action.label}</button>)}
        <button type="button" className="mt-2 min-h-12 w-full border-t text-sm" onClick={onClose}>取消</button>
      </section>
    </div>
  );
}
