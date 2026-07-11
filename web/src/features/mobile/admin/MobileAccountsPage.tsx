import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DeleteAccountDialog } from "@/features/admin/accounts/AccountDialogs";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import {
  type BackendAccount,
  type SaveAccountPayload,
  useAccountsQuery,
  useDeleteAccountMutation,
  useSaveAccountMutation,
  useSyncAccountProfileMutation,
} from "@/features/admin/queries";
import { MobilePage } from "../MobilePage";
import { MobileAccountEditPage } from "./MobileAccountEditPage";
import { MobileCardAction, MobileEntityCard } from "./MobileEntityCard";

export function MobileAccountsPage({ onBack, onOpenContacts }: { onBack?: () => void; onOpenContacts?: (account: BackendAccount) => void }) {
  const accountsQuery = useAccountsQuery();
  const saveMutation = useSaveAccountMutation();
  const deleteMutation = useDeleteAccountMutation();
  const syncProfileMutation = useSyncAccountProfileMutation();
  const accounts = accountsQuery.data ?? [];
  const [editingAccount, setEditingAccount] = useState<BackendAccount | null | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<BackendAccount | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function saveAccount(payload: SaveAccountPayload) {
    if (editingAccount === undefined || saveMutation.isPending) return;
    setSaveError(null);
    try {
      await saveMutation.mutateAsync({ accountId: editingAccount?.id, payload: { appId: payload.appId.trim(), wxid: payload.wxid.trim(), nickname: optionalText(payload.nickname), platformRemark: optionalText(payload.platformRemark) } });
      toast.success(editingAccount ? "账号已保存" : "账号已创建"); setEditingAccount(undefined);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "保存账号失败"); }
  }

  async function syncProfile(account: BackendAccount) {
    if (syncProfileMutation.isPending || syncingId) return;
    if (!account.appId) { toast.error("账号缺少 GeWe appId，无法更新信息"); return; }
    setSyncingId(account.id);
    try { await syncProfileMutation.mutateAsync(account.id); toast.success("账号信息已更新"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "更新账号信息失败"); }
    finally { setSyncingId(null); }
  }

  async function deleteAccount() {
    if (!deletingAccount || deleteText !== deletingAccount.wxid || deleteMutation.isPending) return;
    setDeleteError(null);
    try { await deleteMutation.mutateAsync(deletingAccount.id); toast.success("账号已停用"); setDeletingAccount(null); setDeleteText(""); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "停用账号失败"); }
  }

  if (editingAccount !== undefined) return <MobileAccountEditPage account={editingAccount} saving={saveMutation.isPending} error={saveError} onBack={() => setEditingAccount(undefined)} onSave={(payload) => void saveAccount(payload)} />;

  const active = accounts.filter((account) => account.status !== "disabled").length;
  const online = accounts.filter((account) => account.status !== "disabled" && account.onlineStatus === "online").length;
  const offline = accounts.filter((account) => account.status !== "disabled" && account.onlineStatus === "offline").length;

  return <MobilePage title="微信账号" subtitle="管理账号与联系人数据" onBack={onBack} actions={<button type="button" aria-label="新增账号" onClick={() => { setSaveError(null); setEditingAccount(null); }} className="mobile-icon-button"><Plus className="size-5" /></button>}>
    <div className="grid gap-3 p-4">
      <section aria-label="账号在线摘要" className="grid grid-cols-3 gap-2">
        <Summary label="启用" value={active} /><Summary label="在线" value={online} /><Summary label="离线" value={offline} />
      </section>
      {accountsQuery.isLoading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
      {accountsQuery.error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{readError(accountsQuery.error)}</p> : null}
      {!accountsQuery.isLoading && accounts.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">暂无微信账号</p> : null}
      <div role="list" aria-label="微信账号列表" className="grid gap-3">
        {accounts.map((account) => {
          const name = displayName(account); const disabled = account.status === "disabled";
          return <div role="listitem" key={account.id}><MobileEntityCard title={name} subtitle={account.wxid} badge={<StatusBadge status={disabled ? "disabled" : account.onlineStatus ?? "unknown"} />} details={<><span>GeWe appId {account.appId || "未设置"}</span><span>来源 {account.source === "manual" ? "手动" : "自动"}</span><span>最后同步 <TimeText value={account.lastSyncedAt} /></span></>} actions={<><MobileCardAction aria-label={`更新信息 ${name}`} disabled={disabled || !account.appId || syncingId === account.id} onClick={() => void syncProfile(account)}>{syncingId === account.id ? "更新中" : "更新信息"}</MobileCardAction><MobileCardAction aria-label={`联系人 ${name}`} disabled={disabled} onClick={() => onOpenContacts?.(account)}>通讯录</MobileCardAction><MobileCardAction aria-label={`编辑账号 ${name}`} disabled={disabled} onClick={() => { setSaveError(null); setEditingAccount(account); }}>编辑</MobileCardAction><MobileCardAction destructive aria-label={`停用账号 ${name}`} disabled={disabled || deleteMutation.isPending} onClick={() => { setDeletingAccount(account); setDeleteText(""); setDeleteError(null); }}>停用</MobileCardAction></>} /></div>;
        })}
      </div>
    </div>
    <DeleteAccountDialog account={deletingAccount} deleting={deleteMutation.isPending} error={deleteError} confirmText={deleteText} onConfirmTextChange={setDeleteText} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) { setDeletingAccount(null); setDeleteText(""); setDeleteError(null); } }} onConfirm={() => void deleteAccount()} />
  </MobilePage>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border bg-background p-3 text-center"><div className="text-lg font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label} {value}</div></div>; }
function displayName(account: BackendAccount) { return account.platformRemark || account.nickname || account.wxid; }
function optionalText(value?: string) { const trimmed = value?.trim(); return trimmed || undefined; }
function readError(error: unknown) { return error instanceof Error ? error.message : "账号加载失败"; }
