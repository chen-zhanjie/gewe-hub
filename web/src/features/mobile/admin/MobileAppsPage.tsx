import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DeleteAppDialog } from "@/features/admin/apps/DeleteAppDialog";
import { ResetTokenDialog } from "@/features/admin/apps/ResetTokenDialog";
import {
  buildAccountRemarksPayload,
  optionalText,
  parseOptionalInteger,
  type AppConversationsResponse,
  type BackendAppConversation,
  type BackendHubApp,
  EMPTY_APP_DRAFT,
} from "@/features/admin/apps/types";
import type { BackendAccount } from "@/features/admin/queries";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { apiFetch } from "@/lib/api";
import { MobilePage } from "../MobilePage";
import { MobileAppBindingsPage } from "./MobileAppBindingsPage";
import { MobileAppEditPage } from "./MobileAppEditPage";
import { MobileCardAction, MobileEntityCard } from "./MobileEntityCard";

type AppDraft = typeof EMPTY_APP_DRAFT;
type View = { kind: "list" } | { kind: "edit"; app: BackendHubApp | null } | { kind: "bindings"; app: BackendHubApp };

export function MobileAppsPage({ onBack, onOpenConversation }: { onBack?: () => void; onOpenConversation?: (conversationId: string) => void }) {
  const [apps, setApps] = useState<BackendHubApp[]>([]);
  const [accounts, setAccounts] = useState<BackendAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetApp, setResetApp] = useState<BackendHubApp | null>(null);
  const [resetText, setResetText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteApp, setDeleteApp] = useState<BackendHubApp | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<BackendAppConversation[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsError, setBindingsError] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextApps, nextAccounts] = await Promise.all([apiFetch<BackendHubApp[]>("/api/apps"), apiFetch<BackendAccount[]>("/api/accounts")]);
      setApps(nextApps);
      setAccounts(nextAccounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "应用加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadResources(); }, [loadResources]);

  async function saveApp(draft: AppDraft, remarkDrafts: Record<string, { remark: string; tags: string }>) {
    if (view.kind !== "edit" || saving || !draft.name.trim()) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch(view.app ? `/api/apps/${view.app.id}` : "/api/apps", {
        method: view.app ? "PATCH" : "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          ownerWxid: optionalText(draft.ownerWxid),
          mainConversationId: optionalText(draft.mainConversationId),
          defaultDebounceMs: parseOptionalInteger(draft.defaultDebounceMs),
          defaultMaxWaitMs: parseOptionalInteger(draft.defaultMaxWaitMs),
          deliverSelfMessages: draft.deliverSelfMessages,
          ...(view.app ? { accountRemarks: buildAccountRemarksPayload(remarkDrafts) } : {}),
        }),
      });
      toast.success(view.app ? "应用已保存" : "应用已创建");
      await loadResources(); setView({ kind: "list" });
    } catch (saveError) { setActionError(saveError instanceof Error ? saveError.message : "保存应用失败"); }
    finally { setSaving(false); }
  }

  async function openBindings(app: BackendHubApp) {
    setView({ kind: "bindings", app }); setBindingsLoading(true); setBindingsError(null);
    try {
      const response = await apiFetch<AppConversationsResponse | BackendAppConversation[]>(`/api/apps/${app.id}/conversations?take=50&skip=0`);
      setConversations(Array.isArray(response) ? response : response.items);
    } catch (loadError) { setBindingsError(loadError instanceof Error ? loadError.message : "绑定会话加载失败"); setConversations([]); }
    finally { setBindingsLoading(false); }
  }

  async function resetToken(app: BackendHubApp) {
    if (resettingId || resetText !== app.name) return;
    setResettingId(app.id);
    try { await apiFetch(`/api/apps/${app.id}/reset-token`, { method: "POST" }); await loadResources(); toast.success("token 已重置"); setResetApp(null); setResetText(""); }
    catch (resetError) { setActionError(resetError instanceof Error ? resetError.message : "重置 token 失败"); }
    finally { setResettingId(null); }
  }

  async function deleteCurrentApp(app: BackendHubApp) {
    if (deletingId || deleteText !== app.name) return;
    setDeletingId(app.id); setDeleteError(null);
    try { await apiFetch(`/api/apps/${app.id}`, { method: "DELETE" }); await loadResources(); toast.success("应用已停用"); setDeleteApp(null); setDeleteText(""); }
    catch (deleteFailure) { setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "停用应用失败"); }
    finally { setDeletingId(null); }
  }

  if (view.kind === "edit") return <MobileAppEditPage app={view.app} accounts={accounts} saving={saving} error={actionError} onBack={() => setView({ kind: "list" })} onSave={(draft, remarks) => void saveApp(draft, remarks)} />;
  if (view.kind === "bindings") return <MobileAppBindingsPage app={view.app} conversations={conversations} loading={bindingsLoading} error={bindingsError} onBack={() => setView({ kind: "list" })} onOpenConversation={onOpenConversation} />;

  return <MobilePage title="应用管理" subtitle="管理应用与会话绑定" onBack={onBack} actions={<button type="button" aria-label="新增应用" onClick={() => { setActionError(null); setView({ kind: "edit", app: null }); }} className="mobile-icon-button"><Plus className="size-5" /></button>}>
    <div className="grid gap-3 p-4">
      {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : null}
      {error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && apps.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">暂无应用</p> : null}
      <div role="list" aria-label="应用列表" className="grid gap-3">
        {apps.map((app) => <div role="listitem" key={app.id}><MobileEntityCard title={app.name} subtitle={app.id} badge={<StatusBadge status={app.status === "active" ? "online" : "disabled"} />} details={<><span>Owner {app.ownerWxid || "未设置"}</span><span>绑定会话 {app._count?.conversations ?? 0} 个</span><span>创建时间 <TimeText value={app.createdAt} /></span></>} actions={<><MobileCardAction aria-label={`编辑应用 ${app.name}`} onClick={() => { setActionError(null); setView({ kind: "edit", app }); }}>编辑</MobileCardAction><MobileCardAction aria-label={`查看绑定会话 ${app.name}`} onClick={() => void openBindings(app)}>绑定</MobileCardAction><MobileCardAction aria-label={`重置 token ${app.name}`} disabled={resettingId === app.id} onClick={() => { setResetApp(app); setResetText(""); }}>重置 Token</MobileCardAction><MobileCardAction destructive aria-label={`停用应用 ${app.name}`} disabled={deletingId === app.id} onClick={() => { setDeleteApp(app); setDeleteText(""); setDeleteError(null); }}>停用</MobileCardAction></>} /></div>)}
      </div>
      {actionError ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{actionError}</p> : null}
    </div>
    <ResetTokenDialog app={resetApp} resettingId={resettingId} confirmText={resetText} onConfirmTextChange={setResetText} onOpenChange={(open) => { if (!open && !resettingId) { setResetApp(null); setResetText(""); } }} onConfirm={() => resetApp && void resetToken(resetApp)} />
    <DeleteAppDialog app={deleteApp} deletingId={deletingId} error={deleteError} confirmText={deleteText} onConfirmTextChange={setDeleteText} onOpenChange={(open) => { if (!open && !deletingId) { setDeleteApp(null); setDeleteText(""); setDeleteError(null); } }} onConfirm={() => deleteApp && void deleteCurrentApp(deleteApp)} />
  </MobilePage>;
}
