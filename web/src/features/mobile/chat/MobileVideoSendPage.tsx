import type { VideoDraft } from "@/features/workbench/MessageComposer";
import { MobileTopBar } from "@/features/mobile/MobileTopBar";

export function MobileVideoSendPage({ draft, sending, error, onDraftChange, onSend, onBack }: {
  draft: VideoDraft;
  sending: boolean;
  error: string | null;
  onDraftChange: (draft: VideoDraft | ((current: VideoDraft) => VideoDraft)) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  return (
    <MobileFormPage title="发送视频" onBack={onBack} error={error}>
      <FileField label="视频文件" hint={draft.file?.name ?? "请选择视频"}>
        <input aria-label="上传视频文件" type="file" accept="video/*" onChange={(event) => onDraftChange((current) => ({ ...current, file: event.currentTarget.files?.[0] ?? null }))} />
      </FileField>
      <FileField label="封面图（可选）" hint={draft.thumbFile?.name ?? "可选择图片作为视频封面"}>
        <input aria-label="上传视频封面图" type="file" accept="image/*" onChange={(event) => onDraftChange((current) => ({ ...current, thumbFile: event.currentTarget.files?.[0] ?? null }))} />
      </FileField>
      <button type="button" disabled={sending || !draft.file} onClick={onSend} className="min-h-12 w-full rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{sending ? "发送中…" : "发送视频"}</button>
    </MobileFormPage>
  );
}

export function MobileFormPage({ title, onBack, error, children }: { title: string; onBack: () => void; error: string | null; children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col bg-muted/30"><MobileTopBar title={title} onBack={onBack} /><main className="flex-1 space-y-4 overflow-y-auto p-4">{children}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</main></div>;
}

export function FileField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label className="block rounded-xl border bg-background p-4"><span className="block font-medium">{label}</span><span className="my-2 block text-sm text-muted-foreground">{hint}</span>{children}</label>;
}
