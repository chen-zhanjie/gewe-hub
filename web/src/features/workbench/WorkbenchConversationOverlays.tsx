import { ConversationManagementSheet } from "@/features/workbench/ConversationManagementSheet";
import { ConversationRemarkDialog } from "@/features/workbench/ConversationRemarkDialog";
import type { useWorkbenchConversationActions } from "@/features/workbench/useWorkbenchConversationActions";
import type { useWorkbenchDetailController } from "@/features/workbench/useWorkbenchDetailController";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

interface WorkbenchConversationOverlaysProps {
  conversation?: ConversationSummary;
  account?: AccountSummary;
  detail: ReturnType<typeof useWorkbenchDetailController>;
  actions: ReturnType<typeof useWorkbenchConversationActions>;
  onCloseManagement: () => void;
}

export function WorkbenchConversationOverlays({
  conversation,
  account,
  detail,
  actions,
  onCloseManagement,
}: WorkbenchConversationOverlaysProps) {
  return (
    <>
      <ConversationManagementSheet
        open={Boolean(conversation)}
        conversation={conversation}
        account={account}
        apps={detail.apps}
        bindingDraft={detail.bindingDraft}
        bindingSaving={detail.bindingSaving}
        bindingError={detail.bindingError}
        conversationRemarkDraft={detail.conversationRemarkDraft}
        remarkSaving={detail.remarkSaving}
        remarkError={detail.remarkError}
        confirmingUnbind={detail.confirmingUnbind}
        onOpenChange={(open) => {
          if (!open) onCloseManagement();
        }}
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
        onCancelUnbind={() => detail.setConfirmingUnbind(false)}
      />
      <ConversationRemarkDialog
        conversation={actions.remarkDialog.conversation}
        draft={actions.remarkDialog.draft}
        saving={actions.remarkDialog.saving}
        error={actions.remarkDialog.error}
        onDraftChange={actions.remarkDialog.setDraft}
        onSave={() => {
          void actions.saveRemark();
        }}
        onOpenChange={(open) => {
          if (!open) actions.closeRemarkDialog();
        }}
      />
    </>
  );
}
