import type { RefObject } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BackendAccount } from "../queries";
import {
  EMPTY_APP_DRAFT,
  maskToken,
  readAccountDisplayName,
  type BackendHubApp,
} from "./types";

export function AppFormSheet({
  open,
  title,
  app,
  accounts,
  draft,
  remarkDrafts,
  saving,
  error,
  firstFieldRef,
  onDraftChange,
  onRemarkDraftsChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  title: string;
  app: BackendHubApp | null;
  accounts: BackendAccount[];
  draft: typeof EMPTY_APP_DRAFT;
  remarkDrafts: Record<string, { remark: string; tags: string }>;
  saving: boolean;
  error: string | null;
  firstFieldRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: typeof EMPTY_APP_DRAFT) => void;
  onRemarkDraftsChange: (drafts: Record<string, { remark: string; tags: string }>) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const tokenPreview = app ? maskToken(app.token) : "";

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={app ? app.id : "创建新的 Hub 应用"}
      status={app ? <StatusBadge status={app.status === "active" ? "online" : "disabled"} /> : null}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
            取消
          </button>
          <button
            type="button"
            disabled={!draft.name.trim() || saving}
            onClick={onSave}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存应用"}
          </button>
        </div>
      }
    >
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">基本信息</h2>
          <label className="block text-xs text-muted-foreground">
            应用名称
            <input
              ref={firstFieldRef}
              aria-label="应用名称"
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Hermes 应用"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Owner wxid
            <input
              aria-label="Owner wxid"
              value={draft.ownerWxid}
              onChange={(event) => onDraftChange({ ...draft, ownerWxid: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="wxid_owner"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            主渠道
            <input
              aria-label="主渠道"
              value={draft.mainConversationId}
              onChange={(event) => onDraftChange({ ...draft, mainConversationId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="conversationId"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">
              默认防抖毫秒
              <input
                aria-label="默认防抖毫秒"
                inputMode="numeric"
                value={draft.defaultDebounceMs}
                onChange={(event) => onDraftChange({ ...draft, defaultDebounceMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="2000"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              默认最大等待毫秒
              <input
                aria-label="默认最大等待毫秒"
                inputMode="numeric"
                value={draft.defaultMaxWaitMs}
                onChange={(event) => onDraftChange({ ...draft, defaultMaxWaitMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="8000"
              />
            </label>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <span>投递自己发送的消息</span>
            <input
              aria-label="投递自己发送的消息"
              type="checkbox"
              checked={draft.deliverSelfMessages}
              onChange={(event) => onDraftChange({ ...draft, deliverSelfMessages: event.target.checked })}
              className="size-4"
            />
          </label>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium">应用级账号备注</h2>
          {accounts.length === 0 ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">暂无微信账号</div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const label = readAccountDisplayName(account);
                const accountDraft = remarkDrafts[account.id] ?? { remark: "", tags: "" };
                return (
                  <div key={account.id} className="space-y-2 rounded-md border p-3">
                    <EntityCell entity={{ platformRemark: account.platformRemark, displayName: account.nickname, wxid: account.wxid }} />
                    <label className="block text-xs text-muted-foreground">
                      账号备注：{label}
                      <input
                        aria-label={`账号备注：${label}`}
                        value={accountDraft.remark}
                        onChange={(event) =>
                          onRemarkDraftsChange({
                            ...remarkDrafts,
                            [account.id]: { ...accountDraft, remark: event.target.value },
                          })
                        }
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      账号标签：{label}
                      <input
                        aria-label={`账号标签：${label}`}
                        value={accountDraft.tags}
                        onChange={(event) =>
                          onRemarkDraftsChange({
                            ...remarkDrafts,
                            [account.id]: { ...accountDraft, tags: event.target.value },
                          })
                        }
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="owner,prod"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {app ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Token 与接入片段</h2>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <code className="min-w-0 truncate font-mono text-xs">{tokenPreview}</code>
              <CopyButton value={app.token} label="复制 token" />
            </div>
            <div className="rounded-md bg-muted p-3 text-xs font-mono">
              GEWEHUB_BASE_URL={window.location.origin}
              <br />
              GEWEHUB_APP_TOKEN={tokenPreview}
            </div>
          </section>
        ) : null}
        {error ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
      </fieldset>
    </DetailSheet>
  );
}
