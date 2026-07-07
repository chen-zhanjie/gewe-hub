import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Avatar } from "@/components/ui/Avatar";
import { DetailSheet } from "@/components/ui/DetailSheet";
import type { BindingDraft } from "@/features/workbench/DetailPanel";
import type { HubAppSummary } from "@/features/workbench/queries";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";
import type { ReactNode } from "react";

interface ConversationManagementSheetProps {
  open: boolean;
  conversation?: ConversationSummary;
  account?: AccountSummary;
  apps: HubAppSummary[];
  bindingDraft: BindingDraft;
  bindingSaving: boolean;
  bindingError: string | null;
  conversationRemarkDraft: string;
  remarkSaving: boolean;
  remarkError: string | null;
  confirmingUnbind: boolean;
  onOpenChange: (open: boolean) => void;
  onBindingDraftChange: (draft: BindingDraft) => void;
  onRemarkChange: (remark: string) => void;
  onSaveRemark: () => void | Promise<void>;
  onSaveBinding: () => void;
  onUnbind: () => void;
  onConfirmUnbind: () => void;
  onCancelUnbind: () => void;
}

export function ConversationManagementSheet({
  open,
  conversation,
  account,
  apps,
  bindingDraft,
  bindingSaving,
  bindingError,
  conversationRemarkDraft,
  remarkSaving,
  remarkError,
  confirmingUnbind,
  onOpenChange,
  onBindingDraftChange,
  onRemarkChange,
  onSaveRemark,
  onSaveBinding,
  onUnbind,
  onConfirmUnbind,
  onCancelUnbind,
}: ConversationManagementSheetProps) {
  const isBound = Boolean(conversation?.raw.app?.id);
  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title="会话管理"
      description={conversation?.name ?? "请选择会话"}
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-medium">会话信息</h3>
          <div className="flex items-center gap-3 rounded-md border bg-background p-3">
            <Avatar name={conversation?.name ?? "会"} src={conversation?.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{conversation?.name ?? "未选择会话"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{conversation?.raw.peerWxid ?? "未接入"}</div>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow label="类型" value={conversation?.type === "group" ? "群聊" : "私聊"} />
            <InfoRow label="wxid" value={<span className="font-mono text-xs">{conversation?.raw.peerWxid ?? "-"}</span>} />
            <InfoRow label="所属微信账号" value={account?.name ?? conversation?.raw.accountId ?? "未绑定账号"} />
            <InfoRow label="消息数" value="当前页已加载" />
            <InfoRow label="最后消息时间" value={conversation?.lastAt || "-"} />
          </dl>
          <div className="space-y-2 rounded-md border p-3">
            <label className="block text-xs text-muted-foreground">
              平台会话备注
              <input
                aria-label="平台会话备注"
                value={conversationRemarkDraft}
                onChange={(event) => onRemarkChange(event.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
                placeholder={conversation?.originalName ?? conversation?.raw.peerWxid}
              />
            </label>
            {remarkError ? <p className="text-sm text-destructive">{remarkError}</p> : null}
            <button
              type="button"
              disabled={!conversation || remarkSaving}
              onClick={() => {
                void onSaveRemark();
              }}
              className="w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {remarkSaving ? "保存中" : "保存备注"}
            </button>
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">应用绑定</h3>
          <InfoRow label="当前绑定应用" value={conversation?.raw.app?.name ?? "未绑定"} />
          <label className="block text-xs text-muted-foreground">
            绑定应用
            <select
              aria-label="绑定应用"
              value={bindingDraft.appId}
              onChange={(event) => onBindingDraftChange({ ...bindingDraft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">未绑定</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            投递过滤
            <select
              aria-label="投递过滤"
              value={bindingDraft.deliveryFilter}
              onChange={(event) =>
                onBindingDraftChange({
                  ...bindingDraft,
                  deliveryFilter: event.target.value === "at_only" ? "at_only" : "all",
                })
              }
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="all">全部消息</option>
              <option value="at_only">只投递 @ 我</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted-foreground">
              防抖毫秒
              <input
                aria-label="防抖毫秒"
                inputMode="numeric"
                value={bindingDraft.debounceMs}
                onChange={(event) => onBindingDraftChange({ ...bindingDraft, debounceMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
                placeholder="默认"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              最大等待毫秒
              <input
                aria-label="最大等待毫秒"
                inputMode="numeric"
                value={bindingDraft.maxWaitMs}
                onChange={(event) => onBindingDraftChange({ ...bindingDraft, maxWaitMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
                placeholder="默认"
              />
            </label>
          </div>
          {bindingError ? <p className="text-sm text-destructive">{bindingError}</p> : null}
          <button
            type="button"
            disabled={!conversation || !bindingDraft.appId || bindingSaving}
            onClick={onSaveBinding}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bindingSaving ? "保存中" : "保存绑定"}
          </button>
          {isBound ? (
            <button
              type="button"
              disabled={!conversation || bindingSaving}
              onClick={onUnbind}
              className="w-full rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              解绑应用
            </button>
          ) : null}
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">投递统计</h3>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="近 24h 成功" value="-" />
            <MetricCard label="近 24h 失败" value="-" />
          </div>
          <p className="text-xs text-muted-foreground">统计聚合接口未返回时保留占位，避免误报数据。</p>
        </section>
      </div>
      <AlertDialog open={confirmingUnbind} onOpenChange={(nextOpen) => !nextOpen && onCancelUnbind()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解绑应用</AlertDialogTitle>
            <AlertDialogDescription>解绑后该会话消息将停止投递</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bindingSaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!conversation || bindingSaving}
              onClick={(event) => {
                event.preventDefault();
                onConfirmUnbind();
              }}
              className="bg-destructive text-primary-foreground hover:bg-destructive/90"
            >
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailSheet>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
