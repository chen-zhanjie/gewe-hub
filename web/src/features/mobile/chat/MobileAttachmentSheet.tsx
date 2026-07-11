import { Code2, FileText, Image, Link2, Mic, Upload, Video } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function MobileAttachmentSheet({
  open,
  disabled,
  voiceRecording,
  onClose,
  onVoiceRecord,
  onChooseVoice,
  onChooseImage,
  onChooseFile,
  onOpenVideo,
  onOpenLink,
  onOpenHtml,
}: {
  open: boolean;
  disabled: boolean;
  voiceRecording: boolean;
  onClose: () => void;
  onVoiceRecord: () => void;
  onChooseVoice: () => void;
  onChooseImage: () => void;
  onChooseFile: () => void;
  onOpenVideo: () => void;
  onOpenLink: () => void;
  onOpenHtml: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;

  const action = (callback: () => void) => () => {
    callback();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="关闭发送内容" className="absolute inset-0 size-full bg-black/40" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-xl rounded-t-2xl bg-background px-4 pb-4 pt-3 shadow-2xl" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <h2 id={titleId} className="mb-3 text-center text-sm font-medium text-muted-foreground">发送内容</h2>
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          <SheetAction label={voiceRecording ? "停止并发送" : "录制语音"} icon={<Mic />} disabled={disabled && !voiceRecording} onClick={action(onVoiceRecord)} />
          <SheetAction label="语音文件" icon={<Upload />} disabled={disabled} onClick={action(onChooseVoice)} />
          <SheetAction label="图片" icon={<Image />} disabled={disabled} onClick={action(onChooseImage)} />
          <SheetAction label="文件" icon={<FileText />} disabled={disabled} onClick={action(onChooseFile)} />
          <SheetAction label="视频" icon={<Video />} disabled={disabled} onClick={action(onOpenVideo)} />
          <SheetAction label="链接" icon={<Link2 />} disabled={disabled} onClick={action(onOpenLink)} />
          <SheetAction label="HTML" icon={<Code2 />} disabled={disabled} onClick={action(onOpenHtml)} />
        </div>
        <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-xl border bg-background font-medium">取消</button>
      </section>
    </div>,
    document.body,
  );
}

function SheetAction({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex min-w-0 flex-col items-center gap-2 text-xs disabled:opacity-50">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted [&>svg]:size-5">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
