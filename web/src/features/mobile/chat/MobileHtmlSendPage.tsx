import type { HtmlDraft } from "@/features/workbench/MessageComposer";
import { MobileFormPage } from "./MobileVideoSendPage";
import { Field } from "./MobileLinkSendPage";

export function MobileHtmlSendPage({ draft, sending, error, onDraftChange, onSend, onBack }: {
  draft: HtmlDraft;
  sending: boolean;
  error: string | null;
  onDraftChange: (draft: HtmlDraft | ((current: HtmlDraft) => HtmlDraft)) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const update = (field: keyof HtmlDraft, value: string | File | null) => onDraftChange((current) => ({ ...current, [field]: value }));
  const ready = draft.source === "content" ? Boolean(draft.htmlContent.trim()) : draft.source === "file" ? Boolean(draft.file) : Boolean(draft.linkUrl.trim());
  return <MobileFormPage title="发送 HTML" onBack={onBack} error={error}>
    <div className="grid grid-cols-3 rounded-xl border bg-background p-1">{(["content", "file", "url"] as const).map((source) => <button key={source} type="button" aria-label={source === "content" ? "内容" : source === "file" ? "文件" : "URL"} onClick={() => update("source", source)} className={draft.source === source ? "min-h-10 rounded-lg bg-primary text-primary-foreground" : "min-h-10 rounded-lg"}>{source === "content" ? "内容" : source === "file" ? "文件" : "URL"}</button>)}</div>
    <Field label="HTML 标题"><input aria-label="HTML 标题" value={draft.title} onChange={(e) => update("title", e.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field>
    <Field label="HTML 描述"><input aria-label="HTML 描述" value={draft.desc} onChange={(e) => update("desc", e.target.value)} className="w-full rounded-lg border px-3 py-2" /></Field>
    <Field label="缩略图 URL"><input aria-label="HTML 缩略图 URL" value={draft.thumbUrl} onChange={(e) => update("thumbUrl", e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="https://..." /></Field>
    {draft.source === "content" ? <Field label="HTML 内容"><textarea aria-label="HTML 内容" value={draft.htmlContent} onChange={(e) => update("htmlContent", e.target.value)} className="min-h-48 w-full rounded-lg border px-3 py-2 font-mono" /></Field> : null}
    {draft.source === "file" ? <Field label="HTML 文件"><input aria-label="上传 HTML 文件" type="file" accept="text/html,.html,.htm" onChange={(e) => update("file", e.currentTarget.files?.[0] ?? null)} /></Field> : null}
    {draft.source === "url" ? <Field label="HTML 地址"><input aria-label="HTML 地址" value={draft.linkUrl} onChange={(e) => update("linkUrl", e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="https://..." /></Field> : null}
    <button type="button" disabled={sending || !ready} onClick={onSend} className="min-h-12 w-full rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{sending ? "发送中…" : "发送 HTML"}</button>
  </MobileFormPage>;
}
