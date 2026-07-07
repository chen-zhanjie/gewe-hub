import { useState } from "react";
import { toast } from "sonner";
import { revokeWorkbenchSendRequest } from "@/features/workbench/queries";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

interface WorkbenchMessageRevokeControllerOptions {
  selectedConversation?: ConversationSummary;
  refreshMessages: (conversationId: string) => Promise<unknown>;
  refreshWorkspace: () => Promise<unknown>;
}

export function useWorkbenchMessageRevokeController({
  selectedConversation,
  refreshMessages,
  refreshWorkspace,
}: WorkbenchMessageRevokeControllerOptions) {
  const [confirmingRevokeMessage, setConfirmingRevokeMessage] = useState<MessageItem | null>(null);
  const [revokingMessageId, setRevokingMessageId] = useState<string | null>(null);

  async function confirmRevokeMessage() {
    if (!confirmingRevokeMessage?.sendRequestId || revokingMessageId) return;
    setRevokingMessageId(confirmingRevokeMessage.id);
    try {
      await revokeWorkbenchSendRequest(confirmingRevokeMessage.sendRequestId);
      if (selectedConversation) {
        await refreshMessages(selectedConversation.id);
      }
      await refreshWorkspace();
      setConfirmingRevokeMessage(null);
      toast.success("已发起撤回");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤回失败");
    } finally {
      setRevokingMessageId(null);
    }
  }

  function closeRevokeDialog() {
    if (!revokingMessageId) setConfirmingRevokeMessage(null);
  }

  return {
    confirmingRevokeMessage,
    revokingMessageId,
    requestRevokeMessage: setConfirmingRevokeMessage,
    confirmRevokeMessage,
    closeRevokeDialog,
  };
}
