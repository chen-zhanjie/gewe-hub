import { useMemo, useRef, useState, type ReactNode } from "react";
import { MobileTopBar } from "@/features/mobile/MobileTopBar";
import { MessageRevokeConfirmDialog } from "@/features/workbench/MessageRevokeConfirmDialog";
import {
  sendWorkbenchPayload,
  sendWorkbenchText,
  useRefreshWorkbenchQueries,
  useWorkbenchAdminEvents,
  useWorkbenchMessagesQuery,
  useWorkbenchWorkspaceQuery,
} from "@/features/workbench/queries";
import { useWorkbenchMessageDispatchController } from "@/features/workbench/useWorkbenchMessageDispatchController";
import { useWorkbenchMessageRevokeController } from "@/features/workbench/useWorkbenchMessageRevokeController";
import {
  useWorkbenchMessagesController,
  type SendTextOptions,
} from "@/features/workbench/useWorkbenchMessagesController";
import {
  mapAccountSummary,
  mapConversationSummary,
  type LocalSendPayload,
  type MessageItem,
} from "@/lib/workspace-data";
import { MobileMessageActions } from "./MobileMessageActions";
import { MobileMessageList } from "./MobileMessageList";

export interface MobileChatComposerApi {
  sendText: (text: string, options?: SendTextOptions) => Promise<boolean>;
  sendPayload: (payload: LocalSendPayload) => boolean;
  conversationId: string;
}

export function MobileChatPage({
  conversationId,
  onBack,
  onOpenContact,
  onShowMessageDetail,
  composer,
  children,
}: {
  conversationId: string;
  onBack?: () => void;
  onOpenContact?: (wxid: string) => void;
  onShowMessageDetail?: (message: MessageItem) => void;
  composer?: ReactNode | ((api: MobileChatComposerApi) => ReactNode);
  children?: ReactNode;
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [actionMessage, setActionMessage] = useState<MessageItem | null>(null);
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  const conversations = useMemo(
    () =>
      (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary),
    [workspaceQuery.data?.conversations],
  );
  const accounts = useMemo(
    () => (workspaceQuery.data?.accounts ?? []).map(mapAccountSummary),
    [workspaceQuery.data?.accounts],
  );
  const selectedConversation = conversations.find(
    (item) => item.id === conversationId,
  );
  const selectedAccount =
    accounts.find((item) => item.id === selectedConversation?.raw.accountId) ??
    accounts[0];
  const messagesQuery = useWorkbenchMessagesQuery(conversationId);
  const { refreshWorkspace, refreshMessages, loadOlderMessages } =
    useRefreshWorkbenchQueries();
  useWorkbenchAdminEvents(conversationId);
  const messageState = useWorkbenchMessagesController({
    account: selectedAccount,
    effectiveConversationId: conversationId,
    selectedConversation,
    messagesQuery,
    messageListRef,
    loadOlderMessages,
    refreshMessages,
    sendText: sendWorkbenchText,
    sendPayload: sendWorkbenchPayload,
  });
  const dispatchController = useWorkbenchMessageDispatchController({
    selectedConversation,
    refreshMessages,
    refreshWorkspace,
  });
  const revokeController = useWorkbenchMessageRevokeController({
    selectedConversation,
    refreshMessages,
    refreshWorkspace,
  });
  const composerApi: MobileChatComposerApi = {
    conversationId,
    sendText: messageState.handleSendText,
    sendPayload: messageState.handleSendPayload,
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileTopBar
        title={selectedConversation?.name ?? "聊天"}
        subtitle={
          selectedConversation?.appName
            ? `已绑定 ${selectedConversation.appName}`
            : undefined
        }
        onBack={onBack}
      />
      {workspaceQuery.isError ? (
        <div className="p-4 text-sm text-destructive">加载会话失败</div>
      ) : null}
      <MobileMessageList
        conversation={selectedConversation}
        messages={messageState.visibleMessages}
        messageListRef={messageListRef}
        loading={messagesQuery.isLoading || workspaceQuery.isLoading}
        loadingHistory={messageState.loadingHistory}
        hasMoreHistory={messageState.hasMoreHistory}
        historyError={messageState.historyError}
        newMessageCount={messageState.newMessageCount}
        dispatchingMessageId={dispatchController.dispatchingMessageId}
        onScroll={messageState.handleMessageListScroll}
        onLoadOlder={() => void messageState.handleLoadOlderMessages()}
        onJumpToNewMessages={messageState.scrollMessageListToBottom}
        onOpenActions={setActionMessage}
        onOpenContact={onOpenContact}
      />
      {typeof composer === "function" ? composer(composerApi) : composer}
      {children}
      <MobileMessageActions
        message={actionMessage}
        onClose={() => setActionMessage(null)}
        onRetryLocalSend={messageState.retryLocalSend}
        onDeleteLocalSend={messageState.deleteLocalSend}
        onDispatchHeldMessage={(message) =>
          void dispatchController.dispatchHeldMessage(message)
        }
        onRequestRevoke={revokeController.requestRevokeMessage}
        onShowDetail={onShowMessageDetail}
      />
      <MessageRevokeConfirmDialog
        message={revokeController.confirmingRevokeMessage}
        revokingMessageId={revokeController.revokingMessageId}
        onClose={revokeController.closeRevokeDialog}
        onConfirm={() => void revokeController.confirmRevokeMessage()}
      />
    </div>
  );
}
