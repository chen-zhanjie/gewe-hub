import { ConversationManagementSheet } from "@/features/workbench/ConversationManagementSheet";
import { ConversationRemarkDialog } from "@/features/workbench/ConversationRemarkDialog";
import type { useWorkbenchConversationActions } from "@/features/workbench/useWorkbenchConversationActions";
import type { useWorkbenchConversationSurfaceController } from "@/features/workbench/useWorkbenchConversationSurfaceController";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

interface WorkbenchConversationOverlaysProps {
  conversation?: ConversationSummary;
  account?: AccountSummary;
  conversationSurface: ReturnType<typeof useWorkbenchConversationSurfaceController>;
  actions: ReturnType<typeof useWorkbenchConversationActions>;
  onCloseManagement: () => void;
}

export function WorkbenchConversationOverlays({
  conversation,
  account,
  conversationSurface,
  actions,
  onCloseManagement,
}: WorkbenchConversationOverlaysProps) {
  return (
    <>
      <ConversationManagementSheet
        open={Boolean(conversation)}
        conversation={conversation}
        account={account}
        apps={conversationSurface.apps}
        bindingDraft={conversationSurface.bindingDraft}
        bindingSaving={conversationSurface.bindingSaving}
        bindingError={conversationSurface.bindingError}
        conversationRemarkDraft={conversationSurface.conversationRemarkDraft}
        remarkSaving={conversationSurface.remarkSaving}
        remarkError={conversationSurface.remarkError}
        confirmingUnbind={conversationSurface.confirmingUnbind}
        onOpenChange={(open) => {
          if (!open) onCloseManagement();
        }}
        onBindingDraftChange={conversationSurface.setBindingDraft}
        onRemarkChange={conversationSurface.setConversationRemarkDraft}
        onSaveRemark={conversationSurface.handleSaveConversationRemark}
        onSaveBinding={() => {
          void conversationSurface.handleSaveBinding();
        }}
        onUnbind={conversationSurface.requestUnbindConversation}
        onConfirmUnbind={() => {
          void conversationSurface.confirmUnbindConversation();
        }}
        onCancelUnbind={() => conversationSurface.setConfirmingUnbind(false)}
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
