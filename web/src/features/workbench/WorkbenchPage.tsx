import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationList } from "@/features/workbench/ConversationList";
import { DetailPanel } from "@/features/workbench/DetailPanel";
import { MessageComposer } from "@/features/workbench/MessageComposer";
import { MessageDebugDialog } from "@/features/workbench/MessageDebugDialog";
import { MessagePanel } from "@/features/workbench/MessagePanel";
import { WorkbenchConversationOverlays } from "@/features/workbench/WorkbenchConversationOverlays";
import {
  adminEventSourceStatusEvent,
  sendWorkbenchText,
  type AdminEventSourceStatusDetail,
  useRefreshWorkbenchQueries,
  useWorkbenchAdminEvents,
  useWorkbenchMessagesQuery,
  useWorkbenchWorkspaceQuery,
  type HubAppSummary,
} from "@/features/workbench/queries";
import { useWorkbenchConversationActions } from "@/features/workbench/useWorkbenchConversationActions";
import { useConversationUnreadState } from "@/features/workbench/useConversationUnreadState";
import { useWorkbenchComposerController } from "@/features/workbench/useWorkbenchComposerController";
import { useWorkbenchDetailController } from "@/features/workbench/useWorkbenchDetailController";
import { useWorkbenchMessagesController } from "@/features/workbench/useWorkbenchMessagesController";
import {
  readCopyableMessageText,
  readQueryError,
  readStandardJsonForCopy,
} from "@/features/workbench/workbench-helpers";
import {
  mapAccountSummary,
  mapConversationSummary,
  type AccountSummary,
  type ConversationSummary,
  type MessageItem,
} from "@/lib/workspace-data";

export interface WorkbenchPageProps {
  initialConversationId?: string;
  initialAccountId?: string;
  onAccountChange?: (accountId: string) => void;
  onOpenDeliveryLog?: (messageId: string) => void;
}

export function WorkbenchPage({
  initialConversationId,
  initialAccountId,
  onAccountChange,
  onOpenDeliveryLog,
}: WorkbenchPageProps = {}) {
  const initialConversationIdRef = useRef(initialConversationId);
  const initialAccountIdRef = useRef(initialAccountId);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialAccountId ?? null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversationId ?? null);
  const [debugMessageId, setDebugMessageId] = useState<string | null>(null);
  const [managementConversationId, setManagementConversationId] = useState<string | null>(null);
  const [eventSourceStatus, setEventSourceStatus] = useState<AdminEventSourceStatusDetail["status"]>("connected");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  const accounts = useMemo(() => (workspaceQuery.data?.accounts ?? []).map(mapAccountSummary), [workspaceQuery.data?.accounts]);
  const conversations = useMemo(
    () => (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary),
    [workspaceQuery.data?.conversations],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );
  const visibleConversations = useMemo(
    () => filterConversationsForAccount(conversations, selectedAccount?.id ?? null),
    [conversations, selectedAccount?.id],
  );
  const { refreshWorkspace, refreshMessages, loadOlderMessages, refreshGroupMembers, searchGroupMembers, loadMoreGroupMembers } =
    useRefreshWorkbenchQueries();
  const unreadConversationId = selectedConversationId ?? visibleConversations[0]?.id ?? null;
  const { conversationsWithUnread, clearConversationUnread } = useConversationUnreadState(
    visibleConversations,
    unreadConversationId,
  );
  const conversationActions = useWorkbenchConversationActions({
    refreshWorkspace,
    clearConversationUnread,
    onHiddenConversation: (conversationId) => {
      if (conversationId === selectedConversationId) setSelectedConversationId(null);
      if (conversationId === managementConversationId) setManagementConversationId(null);
    },
  });
  const managedConversations = useMemo(
    () => conversationActions.applyConversationOverlays(conversationsWithUnread),
    [conversationActions, conversationsWithUnread],
  );
  const visibleManagedConversations = useMemo(
    () => managedConversations.filter((conversation) => !conversation.raw.isHidden),
    [managedConversations],
  );
  const effectiveConversationId = selectedConversationId ?? visibleManagedConversations[0]?.id ?? null;
  const apps = useMemo<HubAppSummary[]>(() => workspaceQuery.data?.apps ?? [], [workspaceQuery.data?.apps]);
  const messagesQuery = useWorkbenchMessagesQuery(effectiveConversationId);
  const selectedConversation = useMemo(
    () => visibleManagedConversations.find((conversation) => conversation.id === effectiveConversationId) ?? visibleManagedConversations[0],
    [visibleManagedConversations, effectiveConversationId],
  );
  const managementConversation = useMemo(
    () => managedConversations.find((conversation) => conversation.id === managementConversationId),
    [managedConversations, managementConversationId],
  );

  useWorkbenchAdminEvents(effectiveConversationId);

  useEffect(() => {
    if (!accounts.length) return;
    if (selectedAccountId && accounts.some((account) => account.id === selectedAccountId)) return;
    setSelectedAccountId(accounts[0]?.id ?? null);
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (!visibleManagedConversations.length) {
      setSelectedConversationId(null);
      return;
    }

    if (initialConversationId !== initialConversationIdRef.current) {
      initialConversationIdRef.current = initialConversationId;
      if (initialConversationId) {
        setSelectedConversationId(initialConversationId);
        return;
      }
    }

    if (selectedConversationId && visibleManagedConversations.some((conversation) => conversation.id === selectedConversationId)) {
      return;
    }

    const fallbackConversationId =
      initialConversationId && visibleManagedConversations.some((conversation) => conversation.id === initialConversationId)
        ? initialConversationId
        : visibleManagedConversations[0]?.id;
    if (fallbackConversationId) {
      setSelectedConversationId(fallbackConversationId);
    }
  }, [initialConversationId, selectedConversationId, visibleManagedConversations]);

  useEffect(() => {
    function handleEventSourceStatus(event: Event) {
      const detail = (event as CustomEvent<AdminEventSourceStatusDetail>).detail;
      if (detail?.status) setEventSourceStatus(detail.status);
    }

    window.addEventListener(adminEventSourceStatusEvent, handleEventSourceStatus);
    return () => window.removeEventListener(adminEventSourceStatusEvent, handleEventSourceStatus);
  }, []);

  const messageState = useWorkbenchMessagesController({
    account: selectedAccount,
    effectiveConversationId,
    selectedConversation,
    messagesQuery,
    messageListRef,
    loadOlderMessages,
    refreshMessages,
    sendText: sendWorkbenchText,
  });

  useEffect(() => {
    if (initialAccountId === initialAccountIdRef.current) return;
    initialAccountIdRef.current = initialAccountId;
    setSelectedAccountId(initialAccountId ?? null);
    setSelectedConversationId(null);
    messageState.clearSelectedMessage();
  }, [initialAccountId, messageState.clearSelectedMessage]);

  const composer = useWorkbenchComposerController({
    selectedConversation,
    refreshMessages,
    onSendText: messageState.handleSendText,
  });
  const detail = useWorkbenchDetailController({
    selectedConversation,
    apps,
    refreshWorkspace,
    refreshGroupMembers,
    searchGroupMembers,
    loadMoreGroupMembers,
  });
  const managementDetail = useWorkbenchDetailController({
    selectedConversation: managementConversation,
    apps,
    refreshWorkspace,
    refreshGroupMembers,
    searchGroupMembers,
    loadMoreGroupMembers,
  });
  const error = readQueryError(workspaceQuery.error) ?? readQueryError(messagesQuery.error);

  function selectConversation(conversationId: string) {
    clearConversationUnread(conversationId);
    const conversation = managedConversations.find((item) => item.id === conversationId);
    if (conversation) void conversationActions.markRead(conversation);
    setSelectedConversationId(conversationId);
    messageState.clearSelectedMessage();
  }

  function selectAccount(accountId: string) {
    if (accountId === selectedAccount?.id) return;
    setSelectedAccountId(accountId);
    const nextConversationId = filterConversationsForAccount(managedConversations, accountId)[0]?.id ?? null;
    setSelectedConversationId(nextConversationId);
    onAccountChange?.(accountId);
    messageState.clearSelectedMessage();
  }

  function showMessageDetail(message: MessageItem) {
    messageState.showMessageDetail(message);
    setDebugMessageId(message.id);
  }

  async function copyToClipboard(value: string) {
    await navigator.clipboard?.writeText(value);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {eventSourceStatus === "disconnected" ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          连接已断开，正在重连…
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <ConversationList
          accounts={accounts}
          selectedAccountId={selectedAccount?.id ?? null}
          conversations={managedConversations}
          selectedConversationId={effectiveConversationId}
          loading={workspaceQuery.isLoading}
          error={error}
          onSelectConversation={selectConversation}
          onSelectAccount={selectAccount}
          onTogglePinned={(conversation) => {
            void conversationActions.togglePinned(conversation);
          }}
          onHideConversation={(conversation) => {
            void conversationActions.hideConversation(conversation);
          }}
          onMarkRead={(conversation) => {
            void conversationActions.markRead(conversation);
          }}
          onEditRemark={conversationActions.openRemarkDialog}
          onOpenManagement={(conversation) => {
            setSelectedConversationId(conversation.id);
            setManagementConversationId(conversation.id);
          }}
        />

        <MessagePanel
          selectedConversation={selectedConversation}
          messages={messageState.messages}
          visibleMessages={messageState.visibleMessages}
          selectedMessageId={messageState.selectedMessageId}
          newMessageCount={messageState.newMessageCount}
          attachmentDragActive={composer.attachmentDragActive}
          hasMoreHistory={messageState.hasMoreHistory}
          loadingHistory={messageState.loadingHistory}
          historyError={messageState.historyError}
          messageListRef={messageListRef}
          onAttachmentDragEnter={composer.handleAttachmentDragEnter}
          onAttachmentDragOver={composer.handleAttachmentDragOver}
          onAttachmentDragLeave={composer.handleAttachmentDragLeave}
          onAttachmentDrop={composer.handleAttachmentDrop}
          onMessageListScroll={messageState.handleMessageListScroll}
          onJumpToNewMessages={messageState.scrollMessageListToBottom}
          onLoadOlderMessages={() => {
            void messageState.handleLoadOlderMessages();
          }}
          onSelectMessage={messageState.setSelectedMessageId}
          onMessageContextMenu={messageState.openMessageContextMenu}
          onShowMessageDetail={showMessageDetail}
          onCopyMessageText={(message) => {
            void copyToClipboard(readCopyableMessageText(message));
          }}
          onCopyMessageJson={(message) => {
            void copyToClipboard(JSON.stringify(readStandardJsonForCopy(message), null, 2));
          }}
          onRetryLocalSend={messageState.retryLocalTextSend}
          onDeleteLocalSend={messageState.deleteLocalTextSend}
        >
          <MessageComposer
            selected={Boolean(selectedConversation)}
            sending={composer.sending}
            voiceRecording={composer.voiceRecording}
            messageText={composer.messageText}
            videoThumbUrl={composer.videoThumbUrl}
            showLinkForm={composer.showLinkForm}
            linkDraft={composer.linkDraft}
            pendingAttachments={composer.pendingAttachments}
            sendError={composer.sendError}
            voiceInputRef={composer.voiceInputRef}
            imageInputRef={composer.imageInputRef}
            videoInputRef={composer.videoInputRef}
            fileInputRef={composer.fileInputRef}
            onMessageTextChange={composer.setMessageText}
            onVideoThumbUrlChange={composer.setVideoThumbUrl}
            onShowLinkFormChange={composer.setShowLinkForm}
            onLinkDraftChange={composer.setLinkDraft}
            onSendMedia={(file, type) => {
              void composer.handleSendMedia(file, type);
            }}
            onVoiceRecord={composer.handleVoiceRecord}
            onSendLink={() => {
              void composer.handleSendLink();
            }}
            onRemovePendingAttachment={composer.removePendingAttachment}
            onSendPendingAttachments={() => {
              void composer.handleSendPendingAttachments();
            }}
            onPaste={composer.handleAttachmentPaste}
            onSendText={() => {
              void composer.handleSendText();
            }}
          />
        </MessagePanel>

        <DetailPanel
          detailSections={detail.detailSections}
          selectedConversation={selectedConversation}
          selectedMessage={messageState.selectedMessage}
          apps={detail.apps}
          bindingDraft={detail.bindingDraft}
          bindingSaving={detail.bindingSaving}
          bindingError={detail.bindingError}
          conversationRemarkDraft={detail.conversationRemarkDraft}
          remarkSaving={detail.remarkSaving}
          remarkError={detail.remarkError}
          confirmingUnbind={detail.confirmingUnbind}
          groupMembersData={detail.groupMembersQuery.data}
          groupMembersLoading={detail.groupMembersQuery.isLoading}
          groupMembersError={detail.groupMembersError}
          savingMemberId={detail.savingMemberId}
          loadingMoreMembers={detail.loadingMoreMembers}
          searchingMembers={detail.searchingMembers}
          onToggleSection={detail.toggleDetailSection}
          onBindingDraftChange={detail.setBindingDraft}
          onRemarkChange={detail.setConversationRemarkDraft}
          onSaveRemark={detail.handleSaveConversationRemark}
          onSaveBinding={() => {
            void detail.handleSaveBinding();
          }}
          onUnbind={detail.requestUnbindConversation}
          onConfirmUnbind={() => {
            void detail.confirmUnbindConversation();
          }}
          onCancelUnbind={() => {
            detail.setConfirmingUnbind(false);
          }}
          onSaveMemberRemark={(memberId, remark) => {
            void detail.handleSaveGroupMemberRemark(memberId, remark);
          }}
          onLoadMoreMembers={() => {
            void detail.handleLoadMoreGroupMembers();
          }}
          onSearchMembers={(search) => {
            void detail.handleSearchGroupMembers(search);
          }}
        />
        <MessageDebugDialog
          message={messageState.visibleMessages.find((message) => message.id === debugMessageId) ?? null}
          messages={messageState.visibleMessages}
          open={Boolean(debugMessageId)}
          onOpenDeliveryLog={onOpenDeliveryLog}
          onOpenChange={(open) => {
            if (!open) setDebugMessageId(null);
          }}
          onSelectMessage={(message) => {
            messageState.showMessageDetail(message);
            setDebugMessageId(message.id);
          }}
        />
        <WorkbenchConversationOverlays
          conversation={managementConversation}
          account={selectedAccount}
          detail={managementDetail}
          actions={conversationActions}
          onCloseManagement={() => setManagementConversationId(null)}
        />
      </div>
    </div>
  );
}

function filterConversationsForAccount(conversations: ConversationSummary[], accountId: AccountSummary["id"] | null) {
  return conversations.filter((conversation) => {
    if (conversation.raw.isHidden) return false;
    if (!accountId) return true;
    return !conversation.raw.accountId || conversation.raw.accountId === accountId;
  });
}
