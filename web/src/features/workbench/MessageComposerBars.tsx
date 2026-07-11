import { FileText, Image, Mic, Send, Trash2, Video, X } from "lucide-react";
import type { PendingAttachment } from "@/features/workbench/MessageComposer";

export function QuotePreviewBar({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border-l-2 bg-muted/50 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">引用 {label}</span>
      <button
        type="button"
        aria-label="取消引用消息"
        onClick={onClear}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function PendingAttachmentBar({
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
          <div key={attachment.id} className="flex max-w-[280px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
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

function PendingAttachmentIcon({ type }: { type: PendingAttachment["type"] }) {
  if (type === "image") return <Image className="size-4 shrink-0 text-muted-foreground" />;
  if (type === "voice") return <Mic className="size-4 shrink-0 text-muted-foreground" />;
  if (type === "video") return <Video className="size-4 shrink-0 text-muted-foreground" />;
  return <FileText className="size-4 shrink-0 text-muted-foreground" />;
}

function formatPendingAttachmentType(type: PendingAttachment["type"]): string {
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
    if (size < 1024 || index === units.length - 1) return `${size.toFixed(1)} ${unit}`;
    size /= 1024;
  }
  return `${value} B`;
}
