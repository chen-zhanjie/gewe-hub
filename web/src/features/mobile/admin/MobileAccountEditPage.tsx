import { useEffect, useState } from "react";
import type { BackendAccount, SaveAccountPayload } from "@/features/admin/queries";
import { MobilePage } from "../MobilePage";

export function MobileAccountEditPage({ account, saving, error, onBack, onSave }: { account: BackendAccount | null; saving: boolean; error: string | null; onBack: () => void; onSave: (payload: SaveAccountPayload) => void }) {
  const [draft, setDraft] = useState<SaveAccountPayload>({ appId: "", wxid: "", nickname: "", platformRemark: "" });
  useEffect(() => setDraft({ appId: account?.appId ?? "", wxid: account?.wxid ?? "", nickname: account?.nickname ?? "", platformRemark: account?.platformRemark ?? "" }), [account]);
  return <MobilePage title={account ? "编辑账号" : "新增账号"} subtitle="沿用当前账号字段" onBack={onBack}>
    <form className="grid gap-4 p-4" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <AccountField label="GeWe appId" value={draft.appId} onChange={(appId) => setDraft({ ...draft, appId })} required />
      <AccountField label="微信 wxid" value={draft.wxid} onChange={(wxid) => setDraft({ ...draft, wxid })} required />
      <AccountField label="账号昵称" value={draft.nickname ?? ""} onChange={(nickname) => setDraft({ ...draft, nickname })} />
      <AccountField label="平台备注" value={draft.platformRemark ?? ""} onChange={(platformRemark) => setDraft({ ...draft, platformRemark })} />
      {error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      <button type="submit" disabled={!draft.appId.trim() || !draft.wxid.trim() || saving} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{saving ? "保存中" : "保存账号"}</button>
    </form>
  </MobilePage>;
}

function AccountField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}<input aria-label={label} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}
