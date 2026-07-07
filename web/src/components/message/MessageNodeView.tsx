import type { MessageNode } from "@gewehub/contracts";
import { Banknote, Contact, Gift, MapPin, MessagesSquare, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
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
    return (
      <div className="w-64 rounded-md border bg-background p-3 text-sm">
        <div className="font-medium">{node.media?.fileName ?? node.text}</div>
        <div className="text-xs text-muted-foreground">{node.media?.status === "failed" ? "下载失败" : node.text}</div>
      </div>
    );
  }

  if (node.type === "image" || node.type === "emoji") {
    if (node.media?.url) {
      return <ImagePreview node={node} />;
    }

    return <div className="text-sm text-muted-foreground">{node.media?.status === "failed" ? `${node.text} 下载失败` : node.text}</div>;
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

    return <div className="text-sm text-muted-foreground">{node.text}</div>;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
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
    </div>
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
          <FadingImage src={imageUrl} alt={node.text} />
        </MediaFrame>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 rounded-md bg-background/90 p-2 text-foreground shadow"
            >
              <X className="size-4" />
            </button>
            <img src={node.media?.url ?? imageUrl} alt={node.text} className="max-h-[92vh] max-w-[92vw] rounded-md object-contain" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function MediaFrame({
  node,
  kind,
  children,
}: {
  node: MessageNode;
  kind: "image" | "video";
  children: ReactNode;
}) {
  const size = readMediaFrameSize(node);
  return (
    <span
      data-media-frame={kind}
      className="block overflow-hidden rounded bg-muted"
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

function FadingImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={cn(
        "size-full rounded object-contain opacity-0 transition-opacity duration-120",
        loaded && "opacity-100"
      )}
    />
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
