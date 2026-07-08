import type { MessageNode } from "@gewehub/contracts";
import {
  Archive,
  Banknote,
  Code2,
  Contact,
  Download,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Gift,
  ImageIcon,
  MapPin,
  MessagesSquare,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { layers } from "@/components/ui/layers";
import { cn } from "@/lib/utils";

interface MessageNodeViewProps {
  node: MessageNode;
  depth?: number;
}

export function MessageNodeView({ node, depth = 0 }: MessageNodeViewProps) {
  const content = <MessageNodeContent node={node} depth={depth} />;

  if (!node.quote) {
    return content;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border-l-2 bg-muted px-2 py-1 text-xs text-muted-foreground">
        <MessageNodeView node={node.quote} depth={depth + 1} />
      </div>
      {content}
    </div>
  );
}

function MessageNodeContent({ node, depth = 0 }: MessageNodeViewProps) {
  if (node.type === "chat_record") {
    return <ChatRecordCard node={node} depth={depth} />;
  }

  if (node.type === "file") {
    return <FileMessageCard node={node} />;
  }

  if (node.type === "image" || node.type === "emoji") {
    if (node.media?.url) {
      return <ImagePreview node={node} />;
    }

    return <PendingImagePreview node={node} />;
  }

  if (node.type === "voice") {
    if (node.media?.url) {
      return (
        <div className="flex w-64 flex-col gap-2 rounded-md border bg-background p-3">
          <audio controls src={node.media.url} className="w-full" />
          {node.media.durationMs ? <span className="text-xs text-muted-foreground">{formatDuration(node.media.durationMs)}</span> : null}
        </div>
      );
    }

    return (
      <div className="w-48 rounded-md border bg-background p-3 text-sm">
        <div className="font-medium">{node.text}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {node.media?.durationMs ? `${formatDuration(node.media.durationMs)} · ` : null}
          {node.media?.status === "failed" ? "暂不可播放" : "等待下载"}
        </div>
      </div>
    );
  }

  if (node.type === "video") {
    if (node.media?.url) {
      return (
        <MediaFrame node={node} kind="video">
          <FadingVideo src={node.media.url} />
        </MediaFrame>
      );
    }

    return <PendingVideoPreview node={node} />;
  }

  if (node.type === "link") {
    return (
      <div className="w-72 rounded-md border bg-background p-3 text-sm">
        <div className="line-clamp-1 font-medium">{node.link?.title ?? node.text}</div>
        {node.link?.desc ? <div className="line-clamp-2 text-xs text-muted-foreground">{node.link.desc}</div> : null}
      </div>
    );
  }

  if (node.type === "mini_program") {
    return (
      <div className="w-72 rounded-md border bg-background p-3 text-sm">
        <div className="text-xs text-muted-foreground">小程序</div>
        <div className="line-clamp-1 font-medium">{node.miniProgram?.title ?? node.text}</div>
      </div>
    );
  }

  if (node.type === "location") {
    return (
      <NodeSummaryCard
        icon={<MapPin className="size-5" />}
        label="位置"
        title={node.location?.label ?? node.text}
        description={node.location?.address}
      />
    );
  }

  if (node.type === "card") {
    return (
      <NodeSummaryCard
        icon={<Contact className="size-5" />}
        label="名片"
        title={node.card?.nickName ?? node.text}
        description={node.card?.wxid}
      />
    );
  }

  if (node.type === "red_packet") {
    return (
      <NodeSummaryCard
        icon={<Gift className="size-5" />}
        label="红包"
        title={node.redPacket?.greeting ?? node.text}
      />
    );
  }

  if (node.type === "transfer") {
    return (
      <NodeSummaryCard
        icon={<Banknote className="size-5" />}
        label="转账"
        title={node.transfer?.amount ?? node.text}
        description={node.transfer?.memo}
      />
    );
  }

  if (node.type === "system") {
    return <span className="text-xs text-muted-foreground">{node.text}</span>;
  }

  if (node.type === "unsupported") {
    return <span className="text-sm text-muted-foreground">[暂不支持的消息类型: {node.rawType ?? "unknown"}]</span>;
  }

  return <span className="whitespace-pre-wrap break-words text-sm leading-relaxed">{node.text}</span>;
}

function FileMessageCard({ node }: { node: MessageNode }) {
  const fileName = node.media?.fileName ?? readFileNameFromText(node.text);
  const fileInfo = readFileInfo(fileName, node.media?.mimeType);
  const fileUrl = node.media?.url;
  const fileSize = formatFileSize(node.media?.size);
  const status = node.media?.status ?? "pending";
  const statusText = status === "failed" ? "下载失败" : status === "pending" ? "等待下载" : fileInfo.typeLabel;
  const actionable = typeof fileUrl === "string" && fileUrl.length > 0;

  return (
    <div className="flex w-[min(22rem,calc(100vw-5rem))] items-center gap-3 rounded-md border bg-background p-3 text-sm shadow-sm">
      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-muted-foreground">
        <fileInfo.icon className="size-5" aria-hidden="true" />
        <span className="mt-0.5 max-w-9 truncate text-[10px] font-semibold leading-none">{fileInfo.extensionLabel}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={fileName}>
          {fileName}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{fileSize ?? statusText}</span>
          {fileSize ? <span>{statusText}</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {actionable ? (
          <>
            <a
              href={fileUrl}
              download={fileName}
              aria-label={`下载文件 ${fileName}`}
              title="下载文件"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => event.stopPropagation()}
            >
              <Download className="size-4" />
            </a>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`新标签页打开文件 ${fileName}`}
              title="新标签页打开"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="size-4" />
            </a>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled
              aria-label={`下载文件 ${fileName}`}
              title="文件未就绪，暂不可下载"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground/40"
            >
              <Download className="size-4" />
            </button>
            <button
              type="button"
              disabled
              aria-label={`新标签页打开文件 ${fileName}`}
              title="文件未就绪，暂不可打开"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground/40"
            >
              <ExternalLink className="size-4" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function NodeSummaryCard({
  icon,
  label,
  title,
  description,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex w-72 items-start gap-3 rounded-md border bg-background p-3 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-1 block truncate font-medium">{title}</span>
        {description ? <span className="mt-1 block truncate text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </div>
  );
}

function ChatRecordCard({ node, depth }: { node: MessageNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const count = node.items?.length ?? 0;
  const title = count > 0 ? node.text || "聊天记录" : "聊天记录摘要";

  return (
    <>
      <button
        type="button"
        aria-label={`打开${title}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "w-72 rounded-md border bg-background p-3 text-left text-sm shadow-sm transition hover:bg-muted/60",
          depth > 0 && "bg-muted/40"
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MessagesSquare className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {count > 0 ? `${count} 条消息` : "仅有摘要"}
            </span>
            {count > 0 ? (
              <span className="mt-2 flex flex-wrap gap-1">
                {summarizeChatRecordTypes(node).map((label) => (
                  <span key={label} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {label}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        </div>
      </button>
      {open ? <ChatRecordDialog node={node} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ChatRecordDialog({ node, onClose }: { node: MessageNode; onClose: () => void }) {
  const items = node.items ?? [];
  const title = items.length > 0 ? node.text || "聊天记录" : "聊天记录摘要";

  return createBodyPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn("fixed inset-0 flex items-center justify-center bg-black/45 p-4", layers.dialog)}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{items.length > 0 ? `${items.length} 条消息` : "仅有摘要"}</p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{node.text}</div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const framedByContent = isFramedMessageNode(item);

                return (
                  <div
                    key={`${item.type}-${index}`}
                    data-chat-record-item-frame={framedByContent ? "bare" : "bubble"}
                    className={cn("rounded-md", framedByContent ? "bg-transparent p-0" : "border bg-background p-3")}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">{item.senderName || "未知发送者"}</span>
                      {item.sentAt ? <span className="shrink-0">{formatMessageTime(item.sentAt)}</span> : null}
                    </div>
                    <MessageNodeView node={item} depth={1} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
  );
}

function ImagePreview({ node }: { node: MessageNode }) {
  const [open, setOpen] = useState(false);
  const imageUrl = node.media?.thumbnailUrl || node.media?.url;
  if (!imageUrl) return null;

  return (
    <>
      <button
        type="button"
        aria-label="查看图片"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="block rounded-md border bg-background p-1"
      >
        <MediaFrame node={node} kind="image">
          <FadingImage src={imageUrl} alt={node.text} label={node.type === "emoji" ? "表情加载中" : "图片加载中"} />
        </MediaFrame>
      </button>
      {open ? <ImagePreviewDialog imageUrl={node.media?.url ?? imageUrl} alt={node.text} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImagePreviewDialog({ imageUrl, alt, onClose }: { imageUrl: string; alt: string; onClose: () => void }) {
  return createBodyPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className={cn("fixed inset-0 flex items-center justify-center bg-black/70 p-4", layers.dialog)}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-md bg-background/90 p-2 text-foreground shadow"
        >
          <X className="size-4" />
        </button>
        <img src={imageUrl} alt={alt} className="max-h-[92vh] max-w-[92vw] rounded-md object-contain" />
      </div>
    </div>,
  );
}

function createBodyPortal(content: ReactNode) {
  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

function PendingImagePreview({ node }: { node: MessageNode }) {
  const failed = node.media?.status === "failed";
  const label = failed ? (node.type === "emoji" ? "表情下载失败" : "图片下载失败") : (node.type === "emoji" ? "表情加载中" : "图片加载中");

  return (
    <MediaFrame node={node} kind="image" className="border border-dashed border-border bg-muted/60">
      <span className="flex size-full flex-col items-center justify-center gap-2 px-3 text-xs text-muted-foreground">
        <ImageIcon className="size-5" />
        <span>{label}</span>
      </span>
    </MediaFrame>
  );
}

function PendingVideoPreview({ node }: { node: MessageNode }) {
  const failed = node.media?.status === "failed";
  const label = failed ? "视频加载失败" : "视频加载中";
  const fileName = node.media?.fileName ?? readMediaTitleFromText(node.text, "视频");

  return (
    <MediaFrame node={node} kind="video" className="border border-dashed border-border bg-muted/60">
      <span className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
        <FileVideo className="size-5" />
        <span>{label}</span>
        {fileName ? (
          <span className="max-w-full truncate text-[11px]" title={fileName}>
            {fileName}
          </span>
        ) : null}
      </span>
    </MediaFrame>
  );
}

function MediaFrame({
  node,
  kind,
  className,
  children,
}: {
  node: MessageNode;
  kind: "image" | "video";
  className?: string;
  children: ReactNode;
}) {
  const size = readMediaFrameSize(node);
  return (
    <span
      data-media-frame={kind}
      className={cn("block overflow-hidden rounded bg-muted", className)}
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        aspectRatio: `${size.aspectWidth} / ${size.aspectHeight}`,
      }}
    >
      {children}
    </span>
  );
}

function FadingImage({ src, alt, label }: { src: string; alt: string; label: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    setStatus(image?.complete && image.naturalWidth > 0 ? "loaded" : "loading");
  }, [src]);

  const loaded = status === "loaded";

  return (
    <span className="relative block size-full">
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn(
          "size-full rounded object-contain transition-opacity duration-120",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
      {!loaded ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-xs text-muted-foreground">
          <ImageIcon className="size-5" />
          <span>{status === "error" ? label.replace("加载中", "加载失败") : label}</span>
        </span>
      ) : null}
    </span>
  );
}

function FadingVideo({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <video
      controls
      src={src}
      onLoadedMetadata={() => setLoaded(true)}
      className={cn(
        "size-full rounded object-contain opacity-0 transition-opacity duration-120",
        loaded && "opacity-100"
      )}
    />
  );
}

function readMediaFrameSize(node: MessageNode): {
  width: number;
  height: number;
  aspectWidth: number;
  aspectHeight: number;
} {
  const width = node.media?.width;
  const height = node.media?.height;
  if (!width || !height) {
    return { width: 200, height: 150, aspectWidth: 200, aspectHeight: 150 };
  }

  const maxWidth = 240;
  const maxHeight = 240;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    aspectWidth: width,
    aspectHeight: height,
  };
}

function summarizeChatRecordTypes(node: MessageNode): string[] {
  const labels = new Map<string, string>([
    ["text", "文本"],
    ["image", "图片"],
    ["voice", "语音"],
    ["video", "视频"],
    ["file", "文件"],
    ["emoji", "表情"],
    ["link", "链接"],
    ["mini_program", "小程序"],
    ["chat_record", "聊天记录"],
    ["location", "位置"],
    ["card", "名片"],
    ["transfer", "转账"],
    ["red_packet", "红包"],
    ["system", "系统"],
    ["unsupported", "其他"],
  ]);
  const result: string[] = [];
  for (const item of node.items ?? []) {
    const label = labels.get(item.type) ?? item.type;
    if (!result.includes(label)) result.push(label);
    if (result.length >= 4) break;
  }
  return result.length > 0 ? result : ["摘要"];
}

export function isFramedMessageNode(node: MessageNode): boolean {
  return [
    "image",
    "emoji",
    "voice",
    "video",
    "file",
    "link",
    "mini_program",
    "chat_record",
    "location",
    "card",
    "transfer",
    "red_packet",
  ].includes(node.type);
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readFileInfo(fileName: string, mimeType?: string): {
  extensionLabel: string;
  typeLabel: string;
  icon: typeof File;
} {
  const extension = readFileExtension(fileName);
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";
  const extensionLabel = extension ? extension.slice(0, 4).toUpperCase() : "FILE";

  if (normalizedMimeType.includes("pdf") || extension === "pdf") {
    return { extensionLabel: "PDF", typeLabel: "PDF 文件", icon: FileText };
  }
  if (normalizedMimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"].includes(extension)) {
    return { extensionLabel, typeLabel: "图片文件", icon: FileImage };
  }
  if (normalizedMimeType.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "flac", "silk", "amr"].includes(extension)) {
    return { extensionLabel, typeLabel: "音频文件", icon: FileAudio };
  }
  if (normalizedMimeType.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) {
    return { extensionLabel, typeLabel: "视频文件", icon: FileVideo };
  }
  if (
    normalizedMimeType.includes("spreadsheet") ||
    normalizedMimeType.includes("excel") ||
    ["xls", "xlsx", "csv"].includes(extension)
  ) {
    return { extensionLabel, typeLabel: "表格文件", icon: FileSpreadsheet };
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return { extensionLabel, typeLabel: "压缩文件", icon: Archive };
  }
  if (["js", "ts", "tsx", "jsx", "json", "xml", "html", "css", "md", "sql", "log"].includes(extension)) {
    return { extensionLabel, typeLabel: "文本文件", icon: Code2 };
  }
  if (normalizedMimeType.startsWith("text/") || ["txt", "doc", "docx", "ppt", "pptx"].includes(extension)) {
    return { extensionLabel, typeLabel: "文档文件", icon: FileText };
  }
  return { extensionLabel, typeLabel: "文件", icon: File };
}

function readFileExtension(fileName: string): string {
  const normalizedName = fileName.trim().toLowerCase();
  const lastDotIndex = normalizedName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) return "";
  return normalizedName.slice(lastDotIndex + 1);
}

function readFileNameFromText(text: string): string {
  return text.replace(/^\[文件\]\s*/, "").trim() || "文件";
}

function readMediaTitleFromText(text: string, label: string): string {
  return text.replace(new RegExp(`^\\[${label}\\]\\s*`), "").trim();
}

function formatFileSize(size: number | undefined): string | null {
  if (typeof size !== "number" || !Number.isFinite(size)) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, size);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
