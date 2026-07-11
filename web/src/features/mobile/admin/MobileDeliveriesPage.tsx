import { useEffect, useMemo, useState } from "react";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import type { DeliveryFilters } from "@/features/admin/AdminPages";
import { apiFetch } from "@/lib/api";
import { MobilePage } from "../MobilePage";
import { MobileCardAction, MobileEntityCard } from "./MobileEntityCard";
import {
  getMobileDeliveryConversationName,
  MobileDeliveryDetailPage,
  type MobileDeliveryRecord,
} from "./MobileDeliveryDetailPage";

const DEFAULT_FILTERS: DeliveryFilters = { status: "failed", messageId: undefined, page: 1, pageSize: 20 };
const STATUS_OPTIONS: Array<{ label: string; value: DeliveryFilters["status"] }> = [
  { label: "全部", value: "" }, { label: "成功", value: "success" },
  { label: "失败", value: "failed" }, { label: "进行中", value: "in_progress" },
];

export function MobileDeliveriesPage({
  initialFilters = DEFAULT_FILTERS,
  onFiltersChange,
  onBack,
  onOpenConversation,
}: {
  initialFilters?: DeliveryFilters;
  onFiltersChange?: (filters: DeliveryFilters) => void;
  onBack?: () => void;
  onOpenConversation?: (conversationId: string) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [records, setRecords] = useState<MobileDeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MobileDeliveryRecord | null>(null);
  const [confirmingRetry, setConfirmingRetry] = useState<MobileDeliveryRecord | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const path = useMemo(() => buildDeliveryPath(filters), [filters]);

  useEffect(() => setFilters(initialFilters), [initialFilters]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiFetch<MobileDeliveryRecord[]>(path)
      .then((data) => { if (!cancelled) { setRecords(data); setError(null); } })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "数据加载失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  const visibleRecords = records.filter((record) => matchesDeliverySearch(record, search));
  const updateFilters = (next: DeliveryFilters) => { setFilters(next); onFiltersChange?.(next); };
  const reload = async () => {
    setLoading(true);
    try { setRecords(await apiFetch<MobileDeliveryRecord[]>(path)); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "数据加载失败"); }
    finally { setLoading(false); }
  };
  const retry = async () => {
    if (!confirmingRetry || retryingId) return;
    setRetryingId(confirmingRetry.eventId); setRetryError(null);
    try {
      await apiFetch(`/api/deliveries/${confirmingRetry.eventId}/retry`, { method: "POST" });
      await reload(); setConfirmingRetry(null);
    } catch (failure) { setRetryError(failure instanceof Error ? failure.message : "重投失败"); }
    finally { setRetryingId(null); }
  };

  if (selected) return <MobileDeliveryDetailPage delivery={selected} onBack={() => setSelected(null)} />;

  return (
    <MobilePage title="推送日志" subtitle="查询投递状态、失败原因和人工重投入口" onBack={onBack}>
      <div className="grid gap-3 p-4">
        <div role="region" aria-label="推送日志状态" className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={filters.status === option.value} onClick={() => updateFilters({ ...filters, status: option.value, page: 1 })} className="min-h-10 shrink-0 rounded-full border px-4 text-sm aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary">{option.label}</button>)}
        </div>
        {filters.messageId ? <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-3 text-xs"><span className="break-all">消息定位：{filters.messageId}</span><button type="button" className="shrink-0 text-primary" onClick={() => updateFilters({ ...filters, messageId: undefined, page: 1 })}>清除</button></div> : null}
        <div className="flex gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索投递记录" className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm" />
          <button type="button" aria-label="刷新" disabled={loading} onClick={() => void reload()} className="min-h-11 rounded-xl border bg-background px-4 text-sm disabled:opacity-50">刷新</button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">正在加载</p> : null}
        {error ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
        {retryError ? <p className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{retryError}</p> : null}
        {!loading && !error && visibleRecords.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">{search ? "没有匹配的投递记录" : "暂无投递记录"}</p> : null}
        <div role="list" aria-label="推送日志列表" className="grid gap-3">
          {visibleRecords.map((record) => {
            const conversation = getMobileDeliveryConversationName(record);
            const conversationId = record.message?.conversation?.id;
            return <div role="listitem" key={record.eventId}><MobileEntityCard title={record.app?.name ?? "未知应用"} subtitle={<code>{record.eventId}</code>} badge={<StatusBadge status={record.status} />} details={<><span>会话 {conversation}</span><span>尝试 {record.attempts} 次</span><span>更新时间 <TimeText value={record.updatedAt} /></span></>} actions={<><MobileCardAction aria-label={`查看投递详情 ${record.eventId}`} onClick={() => setSelected(record)}>详情</MobileCardAction><MobileCardAction aria-label={`打开会话 ${conversation}`} disabled={!conversationId || !onOpenConversation} onClick={() => conversationId && onOpenConversation?.(conversationId)}>打开会话</MobileCardAction><MobileCardAction aria-label={`重投 ${record.eventId}`} disabled={retryingId === record.eventId} onClick={() => { setConfirmingRetry(record); setRetryError(null); }}>重投</MobileCardAction></>} /></div>;
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-label="上一页" disabled={filters.page <= 1 || loading} onClick={() => updateFilters({ ...filters, page: Math.max(1, filters.page - 1) })} className="min-h-11 rounded-xl border disabled:opacity-40">上一页</button>
          <button type="button" aria-label="下一页" disabled={records.length < filters.pageSize || loading} onClick={() => updateFilters({ ...filters, page: filters.page + 1 })} className="min-h-11 rounded-xl border disabled:opacity-40">下一页</button>
        </div>
      </div>
      <AlertDialog open={confirmingRetry !== null} onOpenChange={(open) => { if (!open && !retryingId) setConfirmingRetry(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重投投递事件</AlertDialogTitle><AlertDialogDescription>重投会将该投递记录重新置为 queued，并清空失败状态。</AlertDialogDescription></AlertDialogHeader>{confirmingRetry ? <p className="break-all rounded-xl border p-3 text-sm">{confirmingRetry.eventId}</p> : null}<AlertDialogFooter><AlertDialogCancel disabled={Boolean(retryingId)}>取消</AlertDialogCancel><AlertDialogAction disabled={!confirmingRetry || Boolean(retryingId)} onClick={(event) => { event.preventDefault(); void retry(); }}>{retryingId ? "重投中" : "确认重投"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </MobilePage>
  );
}

function buildDeliveryPath(filters: DeliveryFilters): string {
  const params = new URLSearchParams({ take: String(filters.pageSize), skip: String((filters.page - 1) * filters.pageSize) });
  if (filters.status) params.set("status", filters.status);
  if (filters.messageId) params.set("messageId", filters.messageId);
  return `/api/deliveries?${params.toString()}`;
}

function matchesDeliverySearch(record: MobileDeliveryRecord, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [record.eventId, record.app?.name, getMobileDeliveryConversationName(record), record.status, record.message?.messageId, record.updatedAt]
    .some((value) => String(value ?? "").toLowerCase().includes(query));
}
