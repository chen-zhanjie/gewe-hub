import { Mic, Plus, Send } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type RefObject } from "react";
import type { MentionCandidate } from "@/features/workbench/mention-draft";
import { PendingAttachmentBar, QuotePreviewBar } from "@/features/workbench/MessageComposerBars";
import type { PendingAttachment } from "@/features/workbench/MessageComposer";
import type { WorkbenchMediaSendType } from "@/features/workbench/queries";
import { MobileAttachmentSheet } from "./MobileAttachmentSheet";

export function MobileComposer({
  selected,
  sending,
  voiceRecording,
  messageText,
  pendingAttachments,
  mentionCandidates,
  activeMentionQuery,
  quotedMessageLabel,
  sendError,
  voiceInputRef,
  imageInputRef,
  fileInputRef,
  onMessageTextChange,
  onInsertMention,
  onSendMedia,
  onVoiceRecord,
  onRemovePendingAttachment,
  onClearQuotedMessage,
  onSendPendingAttachments,
  onPaste,
  onSendText,
  onOpenVideo,
  onOpenLink,
  onOpenHtml,
}: {
  selected: boolean;
  sending: boolean;
  voiceRecording: boolean;
  messageText: string;
  pendingAttachments: PendingAttachment[];
  mentionCandidates: MentionCandidate[];
  activeMentionQuery: { start: number; query: string } | null;
  quotedMessageLabel: string | null;
  sendError: string | null;
  voiceInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onMessageTextChange: (text: string, selectionStart: number) => void;
  onInsertMention: (member: MentionCandidate, selectionStart?: number) => void;
  onSendMedia: (file: File | undefined, type: WorkbenchMediaSendType) => void;
  onVoiceRecord: () => void;
  onRemovePendingAttachment: (id: string) => void;
  onClearQuotedMessage: () => void;
  onSendPendingAttachments: () => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSendText: () => void;
  onOpenVideo: () => void;
  onOpenLink: () => void;
  onOpenHtml: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const busy = !selected || sending;
  return (
    <div data-testid="mobile-composer" className="relative shrink-0 border-t bg-background px-3 pt-2" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <input ref={voiceInputRef} aria-label="选择语音文件" type="file" accept="audio/*,.silk" className="sr-only" onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "voice")} />
      <input ref={imageInputRef} aria-label="选择图片文件" type="file" accept="image/*" className="sr-only" onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "image")} />
      <input ref={fileInputRef} aria-label="选择文件" type="file" className="sr-only" onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "file")} />
      {pendingAttachments.length ? <PendingAttachmentBar attachments={pendingAttachments} sending={sending} onRemove={onRemovePendingAttachment} onSend={onSendPendingAttachments} /> : null}
      {quotedMessageLabel ? <QuotePreviewBar label={quotedMessageLabel} onClear={onClearQuotedMessage} /> : null}
      {activeMentionQuery ? (
        <div role="listbox" aria-label="可提及的群成员" className="absolute bottom-full left-3 z-20 mb-2 max-h-52 w-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
          {mentionCandidates.length ? mentionCandidates.map((member) => (
            <button key={member.wxid} type="button" aria-label={`提及 ${member.label}`} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm" onClick={() => onInsertMention(member, textareaRef.current?.selectionStart ?? messageText.length)}>@{member.label}</button>
          )) : <div className="px-3 py-2 text-sm text-muted-foreground">没有匹配的群成员</div>}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button type="button" aria-label="更多发送方式" disabled={!selected} onClick={() => setSheetOpen(true)} className="flex size-10 shrink-0 items-center justify-center rounded-full border disabled:opacity-50"><Plus className="size-5" /></button>
        <textarea ref={textareaRef} aria-label="消息" rows={1} value={messageText} onChange={(event) => onMessageTextChange(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)} onPaste={onPaste} className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-base outline-none" placeholder="输入消息" />
        {voiceRecording ? (
          <button type="button" aria-label="停止并发送" onClick={onVoiceRecord} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-destructive px-3 text-sm text-destructive-foreground"><Mic className="size-4" />停止并发送</button>
        ) : (
          <button type="button" aria-label="发送" disabled={!selected} onClick={onSendText} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"><Send className="size-4" /></button>
        )}
      </div>
      {sendError ? <p className="mt-1 text-sm text-destructive">{sendError}</p> : null}
      <MobileAttachmentSheet open={sheetOpen} disabled={busy} voiceRecording={voiceRecording} onClose={() => setSheetOpen(false)} onVoiceRecord={onVoiceRecord} onChooseVoice={() => voiceInputRef.current?.click()} onChooseImage={() => imageInputRef.current?.click()} onChooseFile={() => fileInputRef.current?.click()} onOpenVideo={onOpenVideo} onOpenLink={onOpenLink} onOpenHtml={onOpenHtml} />
    </div>
  );
}
