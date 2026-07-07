import { useState } from "react";
import { toast } from "sonner";
import {
  markWorkbenchConversationRead,
  updateWorkbenchConversation,
} from "@/features/workbench/queries";
import type { ConversationSummary } from "@/lib/workspace-data";

interface ConversationActionOptions {
  refreshWorkspace: () => Promise<unknown>;
  clearConversationUnread: (conversationId: string | null) => void;
  onHiddenConversation?: (conversationId: string) => void;
}

interface ConversationOverlay {
  pinnedAt?: string | null;
  isHidden?: boolean;
}

export function useWorkbenchConversationActions({
  refreshWorkspace,
  clearConversationUnread,
  onHiddenConversation,
}: ConversationActionOptions) {
  const [overlays, setOverlays] = useState<Record<string, ConversationOverlay>>({});
  const [remarkConversation, setRemarkConversation] = useState<ConversationSummary | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);

  function applyConversationOverlays(conversations: ConversationSummary[]): ConversationSummary[] {
    return conversations.map((conversation) => {
      const overlay = overlays[conversation.id];
      if (!overlay) return conversation;
      return {
        ...conversation,
        raw: {
          ...conversation.raw,
          ...overlay,
        },
      };
    });
  }

  async function togglePinned(conversation: ConversationSummary) {
    const pinned = !conversation.raw.pinnedAt;
    setOverlays((current) => ({
      ...current,
      [conversation.id]: {
        ...current[conversation.id],
        pinnedAt: pinned ? new Date().toISOString() : null,
      },
    }));
    try {
      await updateWorkbenchConversation(conversation.id, { pinned });
      await refreshWorkspace();
    } catch {
      await refreshWorkspace();
      toast.error("更新置顶状态失败");
    }
  }

  async function hideConversation(conversation: ConversationSummary) {
    setOverlays((current) => ({
      ...current,
      [conversation.id]: { ...current[conversation.id], isHidden: true },
    }));
    onHiddenConversation?.(conversation.id);
    try {
      await updateWorkbenchConversation(conversation.id, { hidden: true });
      await refreshWorkspace();
      toast.success("已隐藏，收到新消息时会重新出现");
    } catch {
      await refreshWorkspace();
      toast.error("隐藏会话失败");
    }
  }

  async function markRead(conversation: ConversationSummary) {
    clearConversationUnread(conversation.id);
    try {
      await markWorkbenchConversationRead(conversation.id);
      await refreshWorkspace();
    } catch {
      await refreshWorkspace();
      toast.error("标为已读失败");
    }
  }

  function openRemarkDialog(conversation: ConversationSummary) {
    setRemarkConversation(conversation);
    setRemarkDraft(conversation.raw.platformRemark ?? "");
    setRemarkError(null);
  }

  function closeRemarkDialog() {
    if (remarkSaving) return;
    setRemarkConversation(null);
    setRemarkDraft("");
    setRemarkError(null);
  }

  async function saveRemark() {
    if (!remarkConversation || remarkSaving) return;
    setRemarkSaving(true);
    setRemarkError(null);
    try {
      await updateWorkbenchConversation(remarkConversation.id, {
        platformRemark: remarkDraft.trim() || null,
      });
      await refreshWorkspace();
      setRemarkConversation(null);
      setRemarkDraft("");
      setRemarkError(null);
    } catch (error) {
      setRemarkError(error instanceof Error ? error.message : "保存备注失败");
    } finally {
      setRemarkSaving(false);
    }
  }

  async function saveConversationRemark(conversation: ConversationSummary, remark: string) {
    await updateWorkbenchConversation(conversation.id, {
      platformRemark: remark.trim() || null,
    });
    await refreshWorkspace();
  }

  return {
    applyConversationOverlays,
    togglePinned,
    hideConversation,
    markRead,
    openRemarkDialog,
    closeRemarkDialog,
    saveRemark,
    saveConversationRemark,
    remarkDialog: {
      conversation: remarkConversation,
      draft: remarkDraft,
      saving: remarkSaving,
      error: remarkError,
      setDraft: setRemarkDraft,
    },
  };
}
