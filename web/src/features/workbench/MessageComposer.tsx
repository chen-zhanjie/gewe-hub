import {
  ChevronDown,
  FileText,
  Image,
  Link2,
  Mic,
  Send,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import type { ClipboardEvent, RefObject } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import type { WorkbenchMediaSendType } from "@/features/workbench/queries";

type MediaSendType = WorkbenchMediaSendType;

export interface PendingAttachment {
  id: string;
  file: File;
  type: MediaSendType;
}

export interface LinkDraft {
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
}

export function MessageComposer({
  selected,
  sending,
  voiceRecording,
  messageText,
  videoThumbUrl,
  showLinkForm,
  linkDraft,
  pendingAttachments,
  sendError,
  voiceInputRef,
  imageInputRef,
  videoInputRef,
  fileInputRef,
  onMessageTextChange,
  onVideoThumbUrlChange,
  onShowLinkFormChange,
  onLinkDraftChange,
  onSendMedia,
  onVoiceRecord,
  onSendLink,
  onRemovePendingAttachment,
  onSendPendingAttachments,
  onPaste,
  onSendText,
}: {
  selected: boolean;
  sending: boolean;
  voiceRecording: boolean;
  messageText: string;
  videoThumbUrl: string;
  showLinkForm: boolean;
  linkDraft: LinkDraft;
  pendingAttachments: PendingAttachment[];
  sendError: string | null;
  voiceInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onMessageTextChange: (text: string) => void;
  onVideoThumbUrlChange: (url: string) => void;
  onShowLinkFormChange: (show: boolean | ((current: boolean) => boolean)) => void;
  onLinkDraftChange: (draft: LinkDraft | ((current: LinkDraft) => LinkDraft)) => void;
  onSendMedia: (file: File | undefined, type: MediaSendType) => void;
  onVoiceRecord: () => void;
  onSendLink: () => void;
  onRemovePendingAttachment: (attachmentId: string) => void;
  onSendPendingAttachments: () => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSendText: () => void;
}) {
  return (
    <div className="shrink-0 border-t bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          ref={voiceInputRef}
          aria-label="语音文件上传输入"
          type="file"
          accept="audio/*,.silk"
          className="sr-only"
          onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "voice")}
        />
        <input
          ref={imageInputRef}
          aria-label="选择图片文件"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "image")}
        />
        <input
          ref={videoInputRef}
          aria-label="选择视频文件"
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "video")}
        />
        <input
          ref={fileInputRef}
          aria-label="选择文件"
          type="file"
          className="sr-only"
          onChange={(event) => onSendMedia(event.currentTarget.files?.[0], "file")}
        />
        <div className="inline-flex overflow-hidden rounded-md border bg-background">
          <button
            type="button"
            aria-label={voiceRecording ? "停止录制并发送语音" : "开启麦克风录制语音"}
            title={voiceRecording ? "停止录制并发送语音" : "开启麦克风录制语音"}
            disabled={!selected || (sending && !voiceRecording)}
            onClick={onVoiceRecord}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
              voiceRecording && "bg-destructive/10 text-destructive",
            )}
          >
            <Mic className="size-4" />
            {voiceRecording ? "停止并发送" : "录制语音"}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="语音发送方式"
                title="语音发送方式"
                disabled={!selected || sending || voiceRecording}
                className="inline-flex w-9 items-center justify-center border-l text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronDown className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-1">
              <button
                type="button"
                aria-label="导入语音文件"
                disabled={!selected || sending || voiceRecording}
                onClick={() => voiceInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="size-4" />
                导入语音文件
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <button
          type="button"
          disabled={!selected || sending}
          onClick={() => imageInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Image className="size-4" />
          图片
        </button>
        <button
          type="button"
          disabled={!selected || sending}
          onClick={() => videoInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Video className="size-4" />
          视频
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
          <span className="shrink-0">视频缩略图 URL</span>
          <input
            aria-label="视频缩略图 URL"
            value={videoThumbUrl}
            onChange={(event) => onVideoThumbUrlChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
            placeholder="https://..."
          />
        </label>
        <button
          type="button"
          disabled={!selected || sending}
          onClick={() => onShowLinkFormChange((current) => !current)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
            showLinkForm && "border-primary text-primary",
          )}
        >
          <Link2 className="size-4" />
          链接
        </button>
        <button
          type="button"
          disabled={!selected || sending}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="size-4" />
          文件
        </button>
      </div>
      {showLinkForm ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="min-w-0 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            链接标题
            <input
              aria-label="链接标题"
              value={linkDraft.title}
              onChange={(event) => onLinkDraftChange((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 block w-full bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <label className="min-w-0 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            链接地址
            <input
              aria-label="链接地址"
              value={linkDraft.linkUrl}
              onChange={(event) => onLinkDraftChange((current) => ({ ...current, linkUrl: event.target.value }))}
              className="mt-1 block w-full bg-transparent text-sm text-foreground outline-none"
              placeholder="https://..."
            />
          </label>
          <label className="min-w-0 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            链接描述
            <input
              aria-label="链接描述"
              value={linkDraft.desc}
              onChange={(event) => onLinkDraftChange((current) => ({ ...current, desc: event.target.value }))}
              className="mt-1 block w-full bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <div className="flex min-w-0 gap-2">
            <label className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
              链接缩略图 URL
              <input
                aria-label="链接缩略图 URL"
                value={linkDraft.thumbUrl}
                onChange={(event) => onLinkDraftChange((current) => ({ ...current, thumbUrl: event.target.value }))}
                className="mt-1 block w-full bg-transparent text-sm text-foreground outline-none"
                placeholder="https://..."
              />
            </label>
            <button
              type="button"
              disabled={
                !selected ||
                sending ||
                !linkDraft.title.trim() ||
                !linkDraft.desc.trim() ||
                !linkDraft.linkUrl.trim() ||
                !linkDraft.thumbUrl.trim()
              }
              onClick={onSendLink}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-4" />
              发送链接
            </button>
          </div>
        </div>
      ) : null}
      {pendingAttachments.length > 0 ? (
        <PendingAttachmentBar
          attachments={pendingAttachments}
          sending={sending}
          onRemove={onRemovePendingAttachment}
          onSend={onSendPendingAttachments}
        />
      ) : null}
      <div className="flex items-end gap-3">
        <textarea
          rows={3}
          value={messageText}
          onChange={(event) => onMessageTextChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSendText();
            }
          }}
          className="min-h-20 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        />
        <button
          type="button"
          disabled={!selected}
          onClick={onSendText}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" />
          发送
        </button>
      </div>
      {sendError ? <p className="mt-2 text-sm text-destructive">{sendError}</p> : null}
    </div>
  );
}

function PendingAttachmentBar({
  attachments,
  sending,
  onRemove,
  onSend,
}: {
  attachments: PendingAttachment[];
  sending: boolean;
  onRemove: (attachmentId: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="mb-3 rounded-md border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">待发送附件</div>
          <div className="text-xs text-muted-foreground">确认后发送，或先删除不需要的文件</div>
        </div>
        <button
          type="button"
          disabled={sending || attachments.length === 0}
          onClick={onSend}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" />
          发送附件
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex max-w-[280px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <PendingAttachmentIcon type={attachment.type} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{attachment.file.name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{formatPendingAttachmentType(attachment.type)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(attachment.file.size)}</span>
              </div>
            </div>
            <button
              type="button"
              aria-label={`删除附件 ${attachment.file.name}`}
              disabled={sending}
              onClick={() => onRemove(attachment.id)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingAttachmentIcon({ type }: { type: MediaSendType }) {
  if (type === "image") return <Image className="size-4 shrink-0 text-muted-foreground" />;
  if (type === "voice") return <Mic className="size-4 shrink-0 text-muted-foreground" />;
  if (type === "video") return <Video className="size-4 shrink-0 text-muted-foreground" />;
  return <FileText className="size-4 shrink-0 text-muted-foreground" />;
}

function formatPendingAttachmentType(type: MediaSendType): string {
  if (type === "image") return "图片";
  if (type === "voice") return "语音";
  if (type === "video") return "视频";
  return "文件";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index] ?? "GB";
    if (size < 1024 || index === units.length - 1) {
      return `${size.toFixed(1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${value} B`;
}
