import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ClipboardList, ExternalLink, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { MobilePage } from "@/features/mobile/MobilePage";
import { apiFetch } from "@/lib/api";

interface BackendHtmlPage {
  id: string;
  title?: string | null;
  desc?: string | null;
  publicUrl: string;
  sizeBytes?: number | null;
  status: string;
  createdAt?: string | Date;
  conversation?: { platformRemark?: string | null; name?: string | null; peerWxid?: string | null } | null;
  app?: { name?: string | null } | null;
  sendRequest?: { id?: string | null; status?: string | null } | null;
}

type StatusFilter = "" | "active" | "archived" | "deleted";

export function MobileHtmlPagesPage({ onBack, onOpenSendRequest }: { onBack?: () => void; onOpenSendRequest?: (sendRequestId: string) => void }) {
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<BackendHtmlPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState<BackendHtmlPage | null>(null);
  const [archiving, setArchiving] = useState(false);
  const pageSize = 20;

  const loadPages = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ take: String(pageSize), skip: String((page - 1) * pageSize) });
    if (status) params.set("status", status);
    try { setPages(await apiFetch<BackendHtmlPage[]>(`/api/html-pages?${params.toString()}`)); }
    catch (loadError) { setPages([]); setError(loadError instanceof Error ? loadError.message : "HTML 页面加载失败"); }
    finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { void loadPages(); }, [loadPages]);

  const keyword = search.trim().toLowerCase();
  const visiblePages = useMemo(() => pages.filter((item) => !keyword || [item.id, item.title ?? "", item.desc ?? "", item.publicUrl, item.conversation?.platformRemark ?? item.conversation?.name ?? item.conversation?.peerWxid ?? "", item.app?.name ?? "", item.sendRequest?.id ?? "", item.status].some((value) => value.toLowerCase().includes(keyword))), [keyword, pages]);

  async function archivePage() {
    if (!confirmingArchive || archiving) return;
    setArchiving(true);
    try { await apiFetch(`/api/html-pages/${confirmingArchive.id}/archive`, { method: "POST" }); setConfirmingArchive(null); await loadPages(); }
    catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : "归档失败"); }
    finally { setArchiving(false); }
  }

  return <MobilePage title="HTML 页面" subtitle="管理已托管的 HTML 内容" onBack={onBack}>
    <div className="grid gap-3 p-3">
      <div className="flex gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 text-muted-foreground"><Search className="size-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 HTML 页面" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
        <select aria-label="HTML 页面状态" value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(1); }} className="min-h-11 rounded-xl border bg-background px-3 text-sm">
          <option value="">全部</option><option value="active">可访问</option><option value="archived">已归档</option><option value="deleted">已删除</option>
        </select>
      </div>
      {loading ? <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">正在加载 HTML 页面</p> : null}
      {error ? <p className="rounded-xl border border-destructive/30 bg-background p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && pages.length === 0 ? <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">暂无 HTML 页面</p> : null}
      {!loading && pages.length > 0 && visiblePages.length === 0 ? <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">无匹配 HTML 页面</p> : null}
      <div role="list" aria-label="HTML 页面列表" className="grid gap-3">
        {visiblePages.map((item) => {
          const title = item.title || item.id;
          const conversation = item.conversation?.platformRemark || item.conversation?.name || item.conversation?.peerWxid || "未关联会话";
          return <article role="listitem" key={item.id} className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-medium">{title}</h2><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.desc || item.id}</p></div><StatusBadge status={item.status} /></div>
            <dl className="mt-3 grid gap-2 text-xs"><Row label="会话" value={conversation} /><Row label="应用" value={item.app?.name || "—"} /><Row label="发送请求" value={item.sendRequest?.id || "—"} /><Row label="文件大小" value={formatBytes(item.sizeBytes)} /><Row label="创建时间" value={<TimeText value={item.createdAt} />} /></dl>
            <code className="mt-3 block break-all rounded-lg bg-muted p-2 text-[11px]">{item.publicUrl}</code>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={item.publicUrl} target="_blank" rel="noreferrer" aria-label={`打开公网页面 ${title}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border text-sm"><ExternalLink className="size-4" />打开</a>
              <CopyButton value={item.publicUrl} label={`复制公网链接 ${title}`} className="min-h-10 h-auto" />
              <button type="button" aria-label={`查看发送详情 ${item.sendRequest?.id ?? item.id}`} disabled={!item.sendRequest?.id} onClick={() => item.sendRequest?.id && onOpenSendRequest?.(item.sendRequest.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border text-sm disabled:opacity-40"><ClipboardList className="size-4" />发送详情</button>
              <button type="button" aria-label={`归档 ${title}`} disabled={item.status !== "active" || archiving} onClick={() => setConfirmingArchive(item)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border text-sm text-destructive disabled:opacity-40"><Archive className="size-4" />归档</button>
            </div>
          </article>;
        })}
      </div>
      <div className="grid grid-cols-2 gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-xl border bg-background disabled:opacity-40">上一页</button><button type="button" disabled={pages.length < pageSize || loading} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-xl border bg-background disabled:opacity-40">下一页</button></div>
    </div>
    <AlertDialog open={Boolean(confirmingArchive)} onOpenChange={(open) => { if (!open && !archiving) setConfirmingArchive(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>归档 HTML 页面</AlertDialogTitle><AlertDialogDescription>归档后公开访问入口会停止返回页面内容。{confirmingArchive ? ` 页面：${confirmingArchive.id}` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={archiving}>取消</AlertDialogCancel><AlertDialogAction disabled={archiving} onClick={(event) => { event.preventDefault(); void archivePage(); }}>{archiving ? "归档中" : "确认归档"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </MobilePage>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) { return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 text-right">{value}</dd></div>; }
function formatBytes(value?: number | null) { if (!value) return "0 B"; if (value < 1024) return `${value} B`; return `${(value / 1024).toFixed(1)} KB`; }
