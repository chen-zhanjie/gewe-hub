import type { LinkDraft } from "@/features/workbench/MessageComposer";
import { FileField, MobileFormPage } from "./MobileVideoSendPage";

export function MobileLinkSendPage({ draft, sending, parsing, error, onDraftChange, onParse, onSend, onBack }: {
  draft: LinkDraft;
  sending: boolean;
  parsing: boolean;
  error: string | null;
  onDraftChange: (draft: LinkDraft | ((current: LinkDraft) => LinkDraft)) => void;
  onParse: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const update = (field: keyof LinkDraft, value: string | File | null) => onDraftChange((current) => ({ ...current, [field]: value }));
  return <MobileFormPage title="发送链接" onBack={onBack} error={error}>
    <Field label="链接 URL"><div className="flex gap-2"><input aria-label="链接 URL" value={draft.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2" placeholder="https://..." /><button type="button" disabled={parsing || !draft.linkUrl.trim()} onClick={onParse} className="rounded-lg border px-3">{parsing ? "解析中…" : "解析链接"}</button></div></Field>
    <Field label="链接标题"><input aria-label="链接标题" value={draft.title} onChange={(e) => update("title", e.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field>
    <Field label="链接描述"><textarea aria-label="链接描述" value={draft.desc} onChange={(e) => update("desc", e.target.value)} className="min-h-20 w-full rounded-lg border px-3 py-2" /></Field>
    <Field label="缩略图 URL"><input aria-label="链接缩略图 URL" value={draft.thumbUrl} onChange={(e) => update("thumbUrl", e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="https://..." /></Field>
    <FileField label="缩略图文件（可选）" hint={draft.thumbFile?.name ?? "本地图片优先于缩略图 URL"}><input aria-label="上传链接缩略图" type="file" accept="image/*" onChange={(e) => update("thumbFile", e.currentTarget.files?.[0] ?? null)} /></FileField>
    <button type="button" disabled={sending || !draft.linkUrl.trim()} onClick={onSend} className="min-h-12 w-full rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{sending ? "发送中…" : "发送链接"}</button>
  </MobileFormPage>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 rounded-xl border bg-background p-4"><span className="block text-sm font-medium">{label}</span>{children}</label>; }
