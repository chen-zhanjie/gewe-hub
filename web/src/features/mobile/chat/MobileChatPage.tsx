import { useMemo, useRef, useState, type ReactNode } from "react";
import { MobileTopBar } from "@/features/mobile/MobileTopBar";
import { MessageRevokeConfirmDialog } from "@/features/workbench/MessageRevokeConfirmDialog";
import { parseWorkbenchLinkPreview, sendWorkbenchPayload, sendWorkbenchText, useRefreshWorkbenchQueries, useWorkbenchAdminEvents, useWorkbenchGroupMembersQuery, useWorkbenchMessagesQuery, useWorkbenchWorkspaceQuery } from "@/features/workbench/queries";
import { useWorkbenchComposerController } from "@/features/workbench/useWorkbenchComposerController";
import { useWorkbenchMessageDispatchController } from "@/features/workbench/useWorkbenchMessageDispatchController";
import { useWorkbenchMessageRevokeController } from "@/features/workbench/useWorkbenchMessageRevokeController";
import { useWorkbenchMessagesController, type SendTextOptions } from "@/features/workbench/useWorkbenchMessagesController";
import { mapAccountSummary, mapConversationSummary, type LocalSendPayload, type MessageItem } from "@/lib/workspace-data";
import { MobileComposer } from "./MobileComposer";
import { MobileHtmlSendPage } from "./MobileHtmlSendPage";
import { MobileLinkSendPage } from "./MobileLinkSendPage";
import { MobileMessageActions } from "./MobileMessageActions";
import { MobileMessageList } from "./MobileMessageList";
import { MobileVideoSendPage } from "./MobileVideoSendPage";

export interface MobileChatComposerApi {
  sendText: (text: string, options?: SendTextOptions) => Promise<boolean>;
  sendPayload: (payload: LocalSendPayload) => boolean;
  conversationId: string;
}

export function MobileChatPage({ conversationId, onBack, onOpenContact, onShowMessageDetail, composer, children }: {
  conversationId: string;
  onBack?: () => void;
  onOpenContact?: (wxid: string, accountId?: string | null) => void;
  onShowMessageDetail?: (message: MessageItem) => void;
  composer?: ReactNode | ((api: MobileChatComposerApi) => ReactNode);
  children?: ReactNode;
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [actionMessage, setActionMessage] = useState<MessageItem | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<MessageItem | null>(null);
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  const conversations = useMemo(() => (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary), [workspaceQuery.data?.conversations]);
  const accounts = useMemo(() => (workspaceQuery.data?.accounts ?? []).map(mapAccountSummary), [workspaceQuery.data?.accounts]);
  const selectedConversation = conversations.find((item) => item.id === conversationId);
  const selectedAccount = accounts.find((item) => item.id === selectedConversation?.raw.accountId) ?? accounts[0];
  const messagesQuery = useWorkbenchMessagesQuery(conversationId);
  const groupMembersQuery = useWorkbenchGroupMembersQuery(selectedConversation, selectedConversation?.type === "group");
  const { refreshWorkspace, refreshMessages, loadOlderMessages } = useRefreshWorkbenchQueries();
  useWorkbenchAdminEvents(conversationId);
  const messageState = useWorkbenchMessagesController({ account: selectedAccount, effectiveConversationId: conversationId, selectedConversation, messagesQuery, messageListRef, loadOlderMessages, refreshMessages, sendText: sendWorkbenchText, sendPayload: sendWorkbenchPayload });
  const dispatchController = useWorkbenchMessageDispatchController({ selectedConversation, refreshMessages, refreshWorkspace });
  const revokeController = useWorkbenchMessageRevokeController({ selectedConversation, refreshMessages, refreshWorkspace });
  const composerController = useWorkbenchComposerController({
    selectedConversation,
    quotedMessage,
    groupMembers: groupMembersQuery.data?.members ?? [],
    onClearQuotedMessage: () => setQuotedMessage(null),
    onSendText: messageState.handleSendText,
    onSendPayload: messageState.handleSendPayload,
    parseLinkPreview: parseWorkbenchLinkPreview,
    createLocalSendPlaceholder: messageState.createLocalSendPlaceholder,
    submitLocalSendPayload: messageState.submitLocalSendPayload,
    failLocalSend: messageState.failLocalSend,
  });
  const composerApi: MobileChatComposerApi = { conversationId, sendText: messageState.handleSendText, sendPayload: messageState.handleSendPayload };

  if (composer === undefined && composerController.showVideoForm) {
    return <MobileVideoSendPage draft={composerController.videoDraft} sending={composerController.sending} error={composerController.sendError} onDraftChange={composerController.setVideoDraft} onSend={() => void composerController.handleSendVideo()} onBack={composerController.closeVideoForm} />;
  }
  if (composer === undefined && composerController.showLinkForm) {
    return <MobileLinkSendPage draft={composerController.linkDraft} sending={composerController.sending} parsing={composerController.parsingLink} error={composerController.sendError} onDraftChange={composerController.setLinkDraft} onParse={() => void composerController.handleParseLink()} onSend={() => void composerController.handleSendLink()} onBack={composerController.closeLinkForm} />;
  }
  if (composer === undefined && composerController.showHtmlForm) {
    return <MobileHtmlSendPage draft={composerController.htmlDraft} sending={composerController.sending} error={composerController.sendError} onDraftChange={composerController.setHtmlDraft} onSend={() => void composerController.handleSendHtml()} onBack={composerController.closeHtmlForm} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileTopBar title={selectedConversation?.name ?? "聊天"} subtitle={selectedConversation?.appName ? `已绑定 ${selectedConversation.appName}` : undefined} onBack={onBack} />
      {workspaceQuery.isError ? <div className="p-4 text-sm text-destructive">加载会话失败</div> : null}
      <MobileMessageList conversation={selectedConversation} messages={messageState.visibleMessages} messageListRef={messageListRef} loading={messagesQuery.isLoading || workspaceQuery.isLoading} loadingHistory={messageState.loadingHistory} hasMoreHistory={messageState.hasMoreHistory} historyError={messageState.historyError} newMessageCount={messageState.newMessageCount} dispatchingMessageId={dispatchController.dispatchingMessageId} onScroll={messageState.handleMessageListScroll} onLoadOlder={() => void messageState.handleLoadOlderMessages()} onJumpToNewMessages={messageState.scrollMessageListToBottom} onOpenActions={setActionMessage} onOpenContact={(wxid) => onOpenContact?.(wxid, selectedConversation?.raw.accountId)} />
      {composer === undefined ? (
        <MobileComposer
          selected={Boolean(selectedConversation)} sending={composerController.sending} voiceRecording={composerController.voiceRecording}
          messageText={composerController.messageText} pendingAttachments={composerController.pendingAttachments} mentionCandidates={composerController.mentionCandidates}
          activeMentionQuery={composerController.activeMentionQuery} quotedMessageLabel={composerController.quotedMessageLabel} sendError={composerController.sendError}
          voiceInputRef={composerController.voiceInputRef} imageInputRef={composerController.imageInputRef} fileInputRef={composerController.fileInputRef}
          onMessageTextChange={composerController.setMessageText} onInsertMention={composerController.insertMention}
          onSendMedia={(file, type) => void composerController.handleSendMedia(file, type)} onVoiceRecord={composerController.handleVoiceRecord}
          onRemovePendingAttachment={composerController.removePendingAttachment} onClearQuotedMessage={composerController.clearQuotedMessage}
          onSendPendingAttachments={() => void composerController.handleSendPendingAttachments()} onPaste={composerController.handleAttachmentPaste}
          onSendText={() => void composerController.handleSendText()} onOpenVideo={() => composerController.setShowVideoForm(true)}
          onOpenLink={() => composerController.setShowLinkForm(true)} onOpenHtml={() => composerController.setShowHtmlForm(true)}
        />
      ) : typeof composer === "function" ? composer(composerApi) : composer}
      {children}
      <MobileMessageActions message={actionMessage} onClose={() => setActionMessage(null)} onQuote={setQuotedMessage} onRetryLocalSend={messageState.retryLocalSend} onDeleteLocalSend={messageState.deleteLocalSend} onDispatchHeldMessage={(message) => void dispatchController.dispatchHeldMessage(message)} onRequestRevoke={revokeController.requestRevokeMessage} onShowDetail={onShowMessageDetail} />
      <MessageRevokeConfirmDialog message={revokeController.confirmingRevokeMessage} revokingMessageId={revokeController.revokingMessageId} onClose={revokeController.closeRevokeDialog} onConfirm={() => void revokeController.confirmRevokeMessage()} />
    </div>
  );
}
