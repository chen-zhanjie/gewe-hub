import { useEffect, useState } from "react";
import type { BackendAccount } from "@/features/admin/queries";
import {
  EMPTY_APP_DRAFT,
  buildRemarkDrafts,
  formatNullableNumber,
  readAccountDisplayName,
  type BackendHubApp,
} from "@/features/admin/apps/types";
import { MobilePage } from "../MobilePage";

type AppDraft = typeof EMPTY_APP_DRAFT;

export function MobileAppEditPage({
  app,
  accounts,
  saving,
  error,
  onBack,
  onSave,
}: {
  app: BackendHubApp | null;
  accounts: BackendAccount[];
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (draft: AppDraft, remarkDrafts: Record<string, { remark: string; tags: string }>) => void;
}) {
  const [draft, setDraft] = useState<AppDraft>(EMPTY_APP_DRAFT);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, { remark: string; tags: string }>>({});

  useEffect(() => {
    setDraft(app ? {
      name: app.name,
      ownerWxid: app.ownerWxid ?? "",
      mainConversationId: app.mainConversationId ?? "",
      defaultDebounceMs: formatNullableNumber(app.defaultDebounceMs),
      defaultMaxWaitMs: formatNullableNumber(app.defaultMaxWaitMs),
      deliverSelfMessages: app.deliverSelfMessages ?? false,
    } : EMPTY_APP_DRAFT);
    setRemarkDrafts(buildRemarkDrafts(app, accounts));
  }, [accounts, app]);

  return (
    <MobilePage title={app ? "编辑应用" : "新增应用"} subtitle="沿用当前应用配置字段" onBack={onBack}>
      <form className="grid gap-4 p-4" onSubmit={(event) => { event.preventDefault(); onSave(draft, remarkDrafts); }}>
        <AppField label="应用名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} required />
        <AppField label="Owner wxid" value={draft.ownerWxid} onChange={(ownerWxid) => setDraft({ ...draft, ownerWxid })} />
        <AppField label="主会话 ID" value={draft.mainConversationId} onChange={(mainConversationId) => setDraft({ ...draft, mainConversationId })} />
        <AppField label="默认防抖（ms）" value={draft.defaultDebounceMs} onChange={(defaultDebounceMs) => setDraft({ ...draft, defaultDebounceMs })} inputMode="numeric" />
        <AppField label="默认最大等待（ms）" value={draft.defaultMaxWaitMs} onChange={(defaultMaxWaitMs) => setDraft({ ...draft, defaultMaxWaitMs })} inputMode="numeric" />
        <label className="flex items-center justify-between rounded-xl border bg-background p-4 text-sm">
          投递自己发送的消息
          <input aria-label="投递自己发送的消息" type="checkbox" checked={draft.deliverSelfMessages} onChange={(event) => setDraft({ ...draft, deliverSelfMessages: event.target.checked })} />
        </label>
        {app && accounts.length ? (
          <section className="grid gap-3 rounded-xl border bg-background p-4">
            <h2 className="text-sm font-medium">账号备注与标签</h2>
            {accounts.map((account) => {
              const label = readAccountDisplayName(account);
              const accountDraft = remarkDrafts[account.id] ?? { remark: "", tags: "" };
              return <div key={account.id} className="grid gap-3 rounded-lg bg-muted/40 p-3">
                <AppField label={`账号备注：${label}`} value={accountDraft.remark} onChange={(remark) => setRemarkDrafts({ ...remarkDrafts, [account.id]: { ...accountDraft, remark } })} />
                <AppField label={`账号标签：${label}`} value={accountDraft.tags} onChange={(tags) => setRemarkDrafts({ ...remarkDrafts, [account.id]: { ...accountDraft, tags } })} />
              </div>;
            })}
          </section>
        ) : null}
        {app ? <section className="rounded-xl border bg-background p-4"><h2 className="text-sm font-medium">Token</h2><code className="mt-2 block break-all text-xs text-muted-foreground">{app.token}</code></section> : null}
        {error ? <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</div> : null}
        <button type="submit" disabled={!draft.name.trim() || saving} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {saving ? "保存中" : "保存应用"}
        </button>
      </form>
    </MobilePage>
  );
}

function AppField({ label, value, onChange, required, inputMode }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; inputMode?: "numeric" }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}<input aria-label={label} required={required} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}
