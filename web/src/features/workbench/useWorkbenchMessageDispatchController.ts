import { useState } from "react";
import { toast } from "sonner";
import { dispatchWorkbenchSendRequest } from "@/features/workbench/queries";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

interface WorkbenchMessageDispatchControllerOptions {
  selectedConversation?: ConversationSummary;
  refreshMessages: (conversationId: string) => Promise<unknown>;
  refreshWorkspace: () => Promise<unknown>;
}

export function useWorkbenchMessageDispatchController({
  selectedConversation,
  refreshMessages,
  refreshWorkspace,
}: WorkbenchMessageDispatchControllerOptions) {
  const [dispatchingMessageId, setDispatchingMessageId] = useState<string | null>(null);

  async function dispatchHeldMessage(message: MessageItem) {
    const sendRequest = message.sendRequest;
    if (dispatchingMessageId || message.isSent !== false || sendRequest?.status !== "held") return;

    setDispatchingMessageId(message.id);
    try {
      await dispatchWorkbenchSendRequest(sendRequest.id);
      if (selectedConversation) {
        await refreshMessages(selectedConversation.id);
      }
      await refreshWorkspace();
      toast.success("消息已提交发送");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setDispatchingMessageId(null);
    }
  }

  return {
    dispatchingMessageId,
    dispatchHeldMessage,
  };
}
