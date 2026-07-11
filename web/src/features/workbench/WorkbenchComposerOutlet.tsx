import { MessageComposer } from "@/features/workbench/MessageComposer";
import type { useWorkbenchComposerController } from "@/features/workbench/useWorkbenchComposerController";

type WorkbenchComposerController = ReturnType<typeof useWorkbenchComposerController>;

export function WorkbenchComposerOutlet({
  selected,
  composer,
}: {
  selected: boolean;
  composer: WorkbenchComposerController;
}) {
  return (
    <MessageComposer
      selected={selected}
      sending={composer.sending}
      voiceRecording={composer.voiceRecording}
      messageText={composer.messageText}
      showVideoForm={composer.showVideoForm}
      videoDraft={composer.videoDraft}
      showLinkForm={composer.showLinkForm}
      linkDraft={composer.linkDraft}
      showHtmlForm={composer.showHtmlForm}
      htmlDraft={composer.htmlDraft}
      pendingAttachments={composer.pendingAttachments}
      mentionCandidates={composer.mentionCandidates}
      activeMentionQuery={composer.activeMentionQuery}
      quotedMessageLabel={composer.quotedMessageLabel}
      sendError={composer.sendError}
      parsingLink={composer.parsingLink}
      voiceInputRef={composer.voiceInputRef}
      imageInputRef={composer.imageInputRef}
      videoInputRef={composer.videoInputRef}
      videoThumbInputRef={composer.videoThumbInputRef}
      linkThumbInputRef={composer.linkThumbInputRef}
      htmlFileInputRef={composer.htmlFileInputRef}
      fileInputRef={composer.fileInputRef}
      onMessageTextChange={composer.setMessageText}
      onInsertMention={composer.insertMention}
      onShowVideoFormChange={composer.setShowVideoForm}
      onVideoDraftChange={composer.setVideoDraft}
      onShowLinkFormChange={composer.setShowLinkForm}
      onShowHtmlFormChange={composer.setShowHtmlForm}
      onCloseVideoForm={composer.closeVideoForm}
      onCloseLinkForm={composer.closeLinkForm}
      onCloseHtmlForm={composer.closeHtmlForm}
      onLinkDraftChange={composer.setLinkDraft}
      onHtmlDraftChange={composer.setHtmlDraft}
      onSendMedia={(file, type) => {
        void composer.handleSendMedia(file, type);
      }}
      onVoiceRecord={composer.handleVoiceRecord}
      onSendVideo={() => {
        void composer.handleSendVideo();
      }}
      onSendLink={() => {
        void composer.handleSendLink();
      }}
      onSendHtml={() => {
        void composer.handleSendHtml();
      }}
      onParseLink={() => {
        void composer.handleParseLink();
      }}
      onRemovePendingAttachment={composer.removePendingAttachment}
      onClearQuotedMessage={composer.clearQuotedMessage}
      onSendPendingAttachments={() => {
        void composer.handleSendPendingAttachments();
      }}
      onPaste={composer.handleAttachmentPaste}
      onSendText={() => {
        void composer.handleSendText();
      }}
    />
  );
}
