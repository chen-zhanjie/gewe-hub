import type { RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { BackendAccount } from "../queries";

export const EMPTY_ACCOUNT_DRAFT = {
  appId: "",
  wxid: "",
  nickname: "",
  platformRemark: "",
};

export type AccountDraft = typeof EMPTY_ACCOUNT_DRAFT;

export function AccountFormDialog({
  open,
  title,
  draft,
  saving,
  error,
  firstFieldRef,
  onDraftChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: AccountDraft;
  saving: boolean;
  error: string | null;
  firstFieldRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: AccountDraft) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>录入 GeWe appId、账号 wxid 与平台备注。</DialogDescription>
        </DialogHeader>
        <fieldset disabled={saving} className="space-y-3 disabled:opacity-70">
          <label className="block text-xs text-muted-foreground">
            GeWe appId
            <input
              ref={firstFieldRef}
              aria-label="GeWe appId"
              value={draft.appId}
              onChange={(event) => onDraftChange({ ...draft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="wx_app"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号 wxid
            <input
              aria-label="账号 wxid"
              value={draft.wxid}
              onChange={(event) => onDraftChange({ ...draft, wxid: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="wxid_bot"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            账号昵称
            <input
              aria-label="账号昵称"
              value={draft.nickname}
              onChange={(event) => onDraftChange({ ...draft, nickname: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="客服主号"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            平台备注
            <input
              aria-label="平台备注"
              value={draft.platformRemark}
              onChange={(event) => onDraftChange({ ...draft, platformRemark: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="主控账号"
            />
          </label>
          {error ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
        </fieldset>
        <DialogFooter>
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
            取消
          </button>
          <button
            type="button"
            disabled={!draft.appId.trim() || !draft.wxid.trim() || saving}
            onClick={onSave}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存账号"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAccountDialog({
  account,
  deleting,
  error,
  confirmText,
  onConfirmTextChange,
  onOpenChange,
  onConfirm,
}: {
  account: BackendAccount | null;
  deleting: boolean;
  error: string | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const accountName = account ? readAccountDisplayName(account) : "";
  const canConfirm = Boolean(account && confirmText === account.wxid && !deleting);

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>确认停用账号</DialogTitle>
          <DialogDescription>
            停用后会保留本地联系人、群聊、会话、消息和发送记录，并终止该账号的后续同步任务。
          </DialogDescription>
        </DialogHeader>
        {account ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <div className="font-medium text-destructive">{accountName}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{account.wxid}</div>
          </div>
        ) : null}
        {account ? (
          <label className="block text-xs text-muted-foreground">
            输入账号 wxid 确认停用
            <input
              aria-label="输入账号 wxid 确认停用"
              value={confirmText}
              disabled={deleting}
              onChange={(event) => onConfirmTextChange(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              placeholder={account.wxid}
            />
          </label>
        ) : null}
        {error ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <DialogFooter>
          <button
            type="button"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "停用中" : "确认停用"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readAccountDisplayName(account: BackendAccount): string {
  return account.platformRemark || account.nickname || account.wxid;
}
