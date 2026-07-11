import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/AlertDialog";
import { Avatar } from "@/components/ui/Avatar";
import { MobilePage } from "@/features/mobile/MobilePage";
import type { HubAppSummary } from "@/features/workbench/queries";
import { useRefreshWorkbenchQueries } from "@/features/workbench/queries";
import { useWorkbenchConversationSurfaceController } from "@/features/workbench/useWorkbenchConversationSurfaceController";
import type { AccountSummary, ConversationSummary } from "@/lib/workspace-data";

export function MobileConversationManagePage({
  conversation,
  account,
  apps,
  onBack,
}: {
  conversation?: ConversationSummary;
  account?: AccountSummary;
  apps: HubAppSummary[];
  onBack: () => void;
}) {
  const { refreshWorkspace, refreshGroupMembers, searchGroupMembers, loadMoreGroupMembers } = useRefreshWorkbenchQueries();
  const surface = useWorkbenchConversationSurfaceController({
    selectedConversation: conversation,
    apps,
    refreshWorkspace,
    refreshGroupMembers,
    searchGroupMembers,
    loadMoreGroupMembers,
  });
  const isBound = Boolean(conversation?.raw.app?.id);

  return (
    <MobilePage title="会话管理" subtitle={conversation?.name ?? "未选择会话"} onBack={onBack}>
      <div className="grid gap-4 p-4">
        <section className="grid gap-3 rounded-2xl border bg-background p-4">
          <h2 className="text-sm font-medium">会话信息</h2>
          <div className="flex items-center gap-3">
            <Avatar name={conversation?.name ?? "会"} src={conversation?.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{conversation?.name ?? "未选择会话"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{conversation?.raw.peerWxid ?? "未接入"}</div>
            </div>
          </div>
          <dl className="grid gap-3 text-sm">
            <InfoRow label="类型" value={conversation?.type === "group" ? "群聊" : "私聊"} />
            <InfoRow label="peer wxid" value={conversation?.raw.peerWxid ?? "-"} mono />
            <InfoRow label="所属微信账号" value={account?.name ?? conversation?.raw.accountId ?? "未绑定账号"} />
            <InfoRow label="最后消息时间" value={conversation?.lastAt || "-"} />
          </dl>
        </section>

        <section className="grid gap-3 rounded-2xl border bg-background p-4">
          <h2 className="text-sm font-medium">会话备注</h2>
          <label className="grid gap-1 text-xs text-muted-foreground">
            平台会话备注
            <input
              aria-label="平台会话备注"
              value={surface.conversationRemarkDraft}
              onChange={(event) => surface.setConversationRemarkDraft(event.target.value)}
              className="min-h-11 rounded-xl border bg-background px-3 text-sm text-foreground outline-none"
              placeholder={conversation?.originalName ?? conversation?.raw.peerWxid}
            />
          </label>
          {surface.remarkError ? <p className="text-sm text-destructive">{surface.remarkError}</p> : null}
          <button type="button" disabled={!conversation || surface.remarkSaving} onClick={() => void surface.handleSaveConversationRemark()} className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50">{surface.remarkSaving ? "保存中" : "保存备注"}</button>
        </section>

        <section className="grid gap-3 rounded-2xl border bg-background p-4">
          <h2 className="text-sm font-medium">应用绑定</h2>
          <InfoRow label="当前绑定应用" value={conversation?.raw.app?.name ?? "未绑定"} />
          <label className="grid gap-1 text-xs text-muted-foreground">
            绑定应用
            <select aria-label="绑定应用" value={surface.bindingDraft.appId} onChange={(event) => surface.setBindingDraft({ ...surface.bindingDraft, appId: event.target.value })} className="min-h-11 rounded-xl border bg-background px-3 text-sm text-foreground outline-none">
              <option value="">未绑定</option>
              {apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            投递过滤
            <select aria-label="投递过滤" value={surface.bindingDraft.deliveryFilter} onChange={(event) => surface.setBindingDraft({ ...surface.bindingDraft, deliveryFilter: event.target.value === "at_only" ? "at_only" : "all" })} className="min-h-11 rounded-xl border bg-background px-3 text-sm text-foreground outline-none">
              <option value="all">全部消息</option>
              <option value="at_only">只投递 @ 我</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">防抖毫秒<input aria-label="防抖毫秒" inputMode="numeric" value={surface.bindingDraft.debounceMs} onChange={(event) => surface.setBindingDraft({ ...surface.bindingDraft, debounceMs: event.target.value })} className="min-h-11 min-w-0 rounded-xl border bg-background px-3 text-sm text-foreground outline-none" placeholder="默认" /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">最大等待毫秒<input aria-label="最大等待毫秒" inputMode="numeric" value={surface.bindingDraft.maxWaitMs} onChange={(event) => surface.setBindingDraft({ ...surface.bindingDraft, maxWaitMs: event.target.value })} className="min-h-11 min-w-0 rounded-xl border bg-background px-3 text-sm text-foreground outline-none" placeholder="默认" /></label>
          </div>
          {surface.bindingError ? <p className="text-sm text-destructive">{surface.bindingError}</p> : null}
          <button type="button" disabled={!conversation || !surface.bindingDraft.appId || surface.bindingSaving} onClick={() => void surface.handleSaveBinding()} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{surface.bindingSaving ? "保存中" : "保存绑定"}</button>
          {isBound ? <button type="button" disabled={!conversation || surface.bindingSaving} onClick={surface.requestUnbindConversation} className="min-h-11 rounded-xl border border-destructive/40 px-4 text-sm text-destructive disabled:opacity-50">解绑应用</button> : null}
        </section>
      </div>

      <AlertDialog open={surface.confirmingUnbind} onOpenChange={(open) => { if (!open) surface.setConfirmingUnbind(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>解绑应用</AlertDialogTitle><AlertDialogDescription>解绑后该会话消息将停止投递</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={surface.bindingSaving}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={!conversation || surface.bindingSaving} onClick={(event) => { event.preventDefault(); void surface.confirmUnbindConversation(); }} className="bg-destructive text-primary-foreground hover:bg-destructive/90">确认解绑</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePage>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className={mono ? "min-w-0 break-all text-right font-mono text-xs" : "min-w-0 text-right"}>{value}</dd></div>;
}
