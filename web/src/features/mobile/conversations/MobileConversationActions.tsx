import { MobileActionSheet, type MobileActionSheetAction } from "@/features/mobile/MobileActionSheet";
import { getConversationActionCapabilities } from "@/features/mobile/mobile-action-capabilities";
import type { ConversationSummary } from "@/lib/workspace-data";

export function MobileConversationActions({ conversation, onClose, onTogglePinned, onMarkRead, onEditRemark, onManage, onHide }: { conversation: ConversationSummary | null; onClose: () => void; onTogglePinned: () => void; onMarkRead: () => void; onEditRemark: () => void; onManage: () => void; onHide: () => void }) {
  if (!conversation) return null;
  const capability = getConversationActionCapabilities(conversation);
  const actions: MobileActionSheetAction[] = [
    ...(capability.canTogglePinned ? [{ id: "toggle-pinned", label: capability.pinned ? "取消置顶" : "置顶", onSelect: onTogglePinned }] : []),
    ...(capability.canMarkRead ? [{ id: "mark-read", label: "标为已读", onSelect: onMarkRead }] : []),
    ...(capability.canEditRemark ? [{ id: "edit-remark", label: "编辑备注", onSelect: onEditRemark }] : []),
    ...(capability.canManage ? [{ id: "manage", label: "会话管理", onSelect: onManage }] : []),
    ...(capability.canHide ? [{ id: "hide", label: "隐藏会话", onSelect: onHide, destructive: true }] : []),
  ];
  return <MobileActionSheet open title={`${conversation.name} 会话操作`} actions={actions} onClose={onClose} />;
}
