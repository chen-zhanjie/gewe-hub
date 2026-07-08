import {
  ChevronDown,
  Code2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
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
  thumbFile: File | null;
}

export interface HtmlDraft {
  source: "content" | "file" | "url";
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
  htmlContent: string;
  file: File | null;
}

export interface VideoDraft {
  file: File | null;
  thumbFile: File | null;
}

export function MessageComposer({
  selected,
  sending,
  voiceRecording,
  messageText,
  showVideoForm,
  videoDraft,
  showLinkForm,
  linkDraft,
  showHtmlForm,
  htmlDraft,
  pendingAttachments,
  sendError,
  parsingLink,
  voiceInputRef,
  imageInputRef,
  videoInputRef,
  videoThumbInputRef,
  linkThumbInputRef,
  htmlFileInputRef,
  fileInputRef,
  onMessageTextChange,
  onShowVideoFormChange,
  onVideoDraftChange,
  onShowLinkFormChange,
  onShowHtmlFormChange,
  onCloseVideoForm,
  onCloseLinkForm,
  onCloseHtmlForm,
  onLinkDraftChange,
  onHtmlDraftChange,
  onSendMedia,
  onVoiceRecord,
  onSendVideo,
  onSendLink,
  onSendHtml,
  onParseLink,
  onRemovePendingAttachment,
  onSendPendingAttachments,
  onPaste,
  onSendText,
}: {
  selected: boolean;
  sending: boolean;
  voiceRecording: boolean;
  messageText: string;
  showVideoForm: boolean;
  videoDraft: VideoDraft;
  showLinkForm: boolean;
  linkDraft: LinkDraft;
  showHtmlForm: boolean;
  htmlDraft: HtmlDraft;
  pendingAttachments: PendingAttachment[];
  sendError: string | null;
  parsingLink: boolean;
  voiceInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  videoThumbInputRef: RefObject<HTMLInputElement | null>;
  linkThumbInputRef: RefObject<HTMLInputElement | null>;
  htmlFileInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onMessageTextChange: (text: string) => void;
  onShowVideoFormChange: (show: boolean) => void;
  onVideoDraftChange: (draft: VideoDraft | ((current: VideoDraft) => VideoDraft)) => void;
  onShowLinkFormChange: (show: boolean | ((current: boolean) => boolean)) => void;
  onShowHtmlFormChange: (show: boolean | ((current: boolean) => boolean)) => void;
  onCloseVideoForm: () => void;
  onCloseLinkForm: () => void;
  onCloseHtmlForm: () => void;
  onLinkDraftChange: (draft: LinkDraft | ((current: LinkDraft) => LinkDraft)) => void;
  onHtmlDraftChange: (draft: HtmlDraft | ((current: HtmlDraft) => HtmlDraft)) => void;
  onSendMedia: (file: File | undefined, type: MediaSendType) => void;
  onVoiceRecord: () => void;
  onSendVideo: () => void;
  onSendLink: () => void;
  onSendHtml: () => void;
  onParseLink: () => void;
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
          onClick={() => onShowVideoFormChange(true)}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Video className="size-4" />
          视频
        </button>
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
          onClick={() => onShowHtmlFormChange((current) => !current)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
            showHtmlForm && "border-primary text-primary",
          )}
        >
          <Code2 className="size-4" />
          HTML
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
      <VideoSendDialog
        open={showVideoForm}
        selected={selected}
        sending={sending}
        draft={videoDraft}
        videoInputRef={videoInputRef}
        coverInputRef={videoThumbInputRef}
        onOpenChange={(open) => (open ? onShowVideoFormChange(true) : onCloseVideoForm())}
        onDraftChange={onVideoDraftChange}
        onSend={onSendVideo}
      />
      <LinkSendDialog
        open={showLinkForm}
        selected={selected}
        sending={sending}
        draft={linkDraft}
        thumbInputRef={linkThumbInputRef}
        onOpenChange={(open) => (open ? onShowLinkFormChange(true) : onCloseLinkForm())}
        onDraftChange={onLinkDraftChange}
        onParse={onParseLink}
        onSend={onSendLink}
        parsing={parsingLink}
      />
      <HtmlSendDialog
        open={showHtmlForm}
        selected={selected}
        sending={sending}
        draft={htmlDraft}
        fileInputRef={htmlFileInputRef}
        onOpenChange={(open) => (open ? onShowHtmlFormChange(true) : onCloseHtmlForm())}
        onDraftChange={onHtmlDraftChange}
        onSend={onSendHtml}
      />
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

function VideoSendDialog({
  open,
  selected,
  sending,
  draft,
  videoInputRef,
  coverInputRef,
  onOpenChange,
  onDraftChange,
  onSend,
}: {
  open: boolean;
  selected: boolean;
  sending: boolean;
  draft: VideoDraft;
  videoInputRef: RefObject<HTMLInputElement | null>;
  coverInputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: VideoDraft | ((current: VideoDraft) => VideoDraft)) => void;
  onSend: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <input
          ref={videoInputRef}
          aria-label="上传视频文件"
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            onDraftChange((current) => ({ ...current, file }));
          }}
        />
        <input
          ref={coverInputRef}
          aria-label="上传视频封面图"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const thumbFile = event.currentTarget.files?.[0] ?? null;
            onDraftChange((current) => ({ ...current, thumbFile }));
          }}
        />
        <DialogHeader>
          <DialogTitle>发送视频</DialogTitle>
          <DialogDescription>上传视频文件，可选上传封面图</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            disabled={!selected || sending}
            onClick={() => videoInputRef.current?.click()}
            className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block font-medium">视频文件</span>
              <span className="block truncate text-xs text-muted-foreground">{draft.file?.name ?? "点击上传视频文件"}</span>
            </span>
            <Video className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            disabled={!selected || sending}
            onClick={() => coverInputRef.current?.click()}
            className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block font-medium">视频封面图</span>
              <span className="block truncate text-xs text-muted-foreground">
                {draft.thumbFile?.name ?? "不上传时自动截取视频第一帧"}
              </span>
            </span>
            <Image className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={sending}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selected || sending || !draft.file}
            onClick={onSend}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
            发送视频
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkSendDialog({
  open,
  selected,
  sending,
  draft,
  thumbInputRef,
  onOpenChange,
  onDraftChange,
  onParse,
  onSend,
  parsing,
}: {
  open: boolean;
  selected: boolean;
  sending: boolean;
  parsing: boolean;
  draft: LinkDraft;
  thumbInputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: LinkDraft | ((current: LinkDraft) => LinkDraft)) => void;
  onParse: () => void;
  onSend: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <input
          ref={thumbInputRef}
          aria-label="上传链接缩略图"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const thumbFile = event.currentTarget.files?.[0] ?? null;
            onDraftChange((current) => ({ ...current, thumbFile }));
          }}
        />
        <DialogHeader>
          <DialogTitle>发送链接</DialogTitle>
          <DialogDescription>链接地址必填，其他内容可自动补齐</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-xs text-muted-foreground">
              链接地址
              <input
                aria-label="链接地址"
                value={draft.linkUrl}
                onChange={(event) => onDraftChange((current) => ({ ...current, linkUrl: event.target.value }))}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://..."
              />
            </label>
            <button
              type="button"
              disabled={!selected || sending || parsing || !draft.linkUrl.trim()}
              onClick={onParse}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parsing ? "解析中" : "解析链接"}
            </button>
          </div>
          <label className="text-xs text-muted-foreground">
            链接标题
            <input
              aria-label="链接标题"
              value={draft.title}
              onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            链接描述
            <input
              aria-label="链接描述"
              value={draft.desc}
              onChange={(event) => onDraftChange((current) => ({ ...current, desc: event.target.value }))}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            type="button"
            disabled={!selected || sending}
            onClick={() => thumbInputRef.current?.click()}
            className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block font-medium">链接缩略图</span>
              <span className="block truncate text-xs text-muted-foreground">
                {draft.thumbFile?.name ?? (draft.thumbUrl ? "已解析缩略图" : "不上传时使用默认缩略图")}
              </span>
            </span>
            <Image className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={sending}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selected || sending || !draft.linkUrl.trim()}
            onClick={onSend}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
            发送链接
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HtmlSendDialog({
  open,
  selected,
  sending,
  draft,
  fileInputRef,
  onOpenChange,
  onDraftChange,
  onSend,
}: {
  open: boolean;
  selected: boolean;
  sending: boolean;
  draft: HtmlDraft;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: HtmlDraft | ((current: HtmlDraft) => HtmlDraft)) => void;
  onSend: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <input
          ref={fileInputRef}
          aria-label="上传 HTML 文件"
          type="file"
          accept=".html,.htm,text/html"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            onDraftChange((current) => ({ ...current, file }));
          }}
        />
        <DialogHeader>
          <DialogTitle>发送 HTML</DialogTitle>
          <DialogDescription>HTML 会以链接卡片形式发送</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="inline-flex w-fit overflow-hidden rounded-md border bg-background">
            {(["content", "file", "url"] as const).map((source) => (
              <button
                key={source}
                type="button"
                disabled={sending}
                onClick={() => onDraftChange((current) => ({ ...current, source }))}
                className={cn(
                  "px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                  draft.source === source ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {formatHtmlSourceLabel(source)}
              </button>
            ))}
          </div>
          <label className="text-xs text-muted-foreground">
            HTML 标题
            <input
              aria-label="HTML 标题"
              value={draft.title}
              onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            HTML 描述
            <input
              aria-label="HTML 描述"
              value={draft.desc}
              onChange={(event) => onDraftChange((current) => ({ ...current, desc: event.target.value }))}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            缩略图 URL
            <input
              aria-label="HTML 缩略图 URL"
              value={draft.thumbUrl}
              onChange={(event) => onDraftChange((current) => ({ ...current, thumbUrl: event.target.value }))}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://..."
            />
          </label>
          {draft.source === "content" ? (
            <label className="text-xs text-muted-foreground">
              HTML 内容
              <textarea
                aria-label="HTML 内容"
                value={draft.htmlContent}
                onChange={(event) => onDraftChange((current) => ({ ...current, htmlContent: event.target.value }))}
                className="mt-1 block min-h-40 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            </label>
          ) : null}
          {draft.source === "file" ? (
            <button
              type="button"
              disabled={!selected || sending}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block font-medium">HTML 文件</span>
                <span className="block truncate text-xs text-muted-foreground">{draft.file?.name ?? "点击上传 .html/.htm 文件"}</span>
              </span>
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ) : null}
          {draft.source === "url" ? (
            <label className="text-xs text-muted-foreground">
              HTML 地址
              <input
                aria-label="HTML 地址"
                value={draft.linkUrl}
                onChange={(event) => onDraftChange((current) => ({ ...current, linkUrl: event.target.value }))}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://..."
              />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={sending}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selected || sending || !isHtmlDraftReady(draft)}
            onClick={onSend}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
            发送 HTML
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatHtmlSourceLabel(source: HtmlDraft["source"]): string {
  if (source === "file") return "文件";
  if (source === "url") return "URL";
  return "内容";
}

function isHtmlDraftReady(draft: HtmlDraft): boolean {
  if (draft.source === "file") return Boolean(draft.file);
  if (draft.source === "url") return Boolean(draft.linkUrl.trim());
  return Boolean(draft.htmlContent.trim());
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
