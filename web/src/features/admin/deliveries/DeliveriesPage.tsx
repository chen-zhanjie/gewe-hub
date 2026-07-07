import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, RotateCcw } from "lucide-react";
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
import { DataTable } from "@/components/ui/DataTable";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { EntityCell } from "@/components/ui/EntityCell";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DeliveryFilters } from "../AdminPages";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50] as const;
const DELIVERY_STATUS_FACETS = [
  { label: "全部", value: "" },
  { label: "成功", value: "success" },
  { label: "失败", value: "failed" },
  { label: "进行中", value: "in_progress" },
] as const;

type DeliveryRow = ReturnType<typeof mapDeliveryRow>;

const DEFAULT_DELIVERY_FILTERS: DeliveryFilters = {
  status: "failed",
  messageId: undefined,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

interface BackendDelivery {
  eventId: string;
  eventType?: string;
  payload?: unknown;
  status: string;
  attempts: number;
  lastError?: string | null;
  updatedAt?: string | Date;
  app?: { name?: string | null } | null;
  message?: {
    messageId?: string | null;
    renderedText?: string | null;
    conversation?: {
      id?: string | null;
      platformRemark?: string | null;
      name?: string | null;
      peerWxid?: string | null;
    } | null;
  } | null;
}

export function DeliveriesPage({
  initialFilters = DEFAULT_DELIVERY_FILTERS,
  onFiltersChange,
}: {
  initialFilters?: DeliveryFilters;
  onFiltersChange?: (filters: DeliveryFilters) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  useEffect(() => setFilters(initialFilters), [initialFilters]);
  const deliveryPath = buildDeliveryPath(filters);
  const { data: deliveries, loading, error, reload } = useApiData<BackendDelivery[]>(deliveryPath, []);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [confirmingRetry, setConfirmingRetry] = useState<BackendDelivery | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<BackendDelivery | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deliverySearch, setDeliverySearch] = useState("");
  const rows = deliveries.map(mapDeliveryRow);
  const visibleRows = rows.filter((row) => matchesDeliverySearch(row, deliverySearch));
  const canGoPrevious = filters.page > 1;
  const canGoNext = deliveries.length === filters.pageSize;
  const deliveryColumns = useMemo<ColumnDef<DeliveryRow>[]>(() => [
    {
      accessorKey: "id",
      header: "事件 ID",
      cell: ({ row }) => <code className="font-mono text-xs">{row.original.id}</code>,
    },
    {
      accessorKey: "app",
      header: "应用",
    },
    {
      accessorKey: "conversation",
      header: "会话",
      cell: ({ row }) =>
        row.original.conversationId ? (
          <Link
            to="/workbench"
            search={{ conversationId: row.original.conversationId }}
            aria-label={`打开工作台会话 ${row.original.conversation}`}
            className="block rounded-md hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EntityCell entity={row.original.conversationEntity} />
          </Link>
        ) : (
          <EntityCell entity={row.original.conversationEntity} />
        ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "attempts",
      header: "尝试",
      meta: { align: "right" },
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      cell: ({ row }) => <TimeText value={row.original.updatedAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            title="查看详情"
            aria-label="查看详情"
            onClick={() => setSelectedDelivery(row.original.source)}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <ClipboardList className="size-4" />
          </button>
          <button
            type="button"
            title="重投"
            aria-label="重投"
            disabled={retryingEventId === row.original.id}
            onClick={() => {
              setConfirmingRetry(row.original.source);
              setRetryError(null);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      ),
    },
  ], [retryingEventId]);

  function updateFilters(nextFilters: DeliveryFilters) {
    setFilters(nextFilters);
    onFiltersChange?.(nextFilters);
  }

  async function handleRetryDelivery(delivery: BackendDelivery) {
    if (retryingEventId) return;
    setRetryingEventId(delivery.eventId);
    setRetryError(null);
    try {
      await apiFetch(`/api/deliveries/${delivery.eventId}/retry`, { method: "POST" });
      await reload();
      setConfirmingRetry(null);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "重投失败");
    } finally {
      setRetryingEventId(null);
    }
  }

  return (
    <PageShell description="查询投递状态、失败原因和人工重投入口。">
      <QuickStatusTabs
        label="推送日志状态"
        value={filters.status}
        rows={rows}
        options={DELIVERY_STATUS_FACETS}
        messageId={filters.messageId}
        onChange={(status) => updateFilters({ ...filters, status, page: 1 })}
        onClearMessageFilter={() => updateFilters({ ...filters, messageId: undefined, page: 1 })}
      />
      <LoadState loading={loading} error={error} empty={!loading && rows.length === 0} emptyText="暂无投递记录" />
      {retryError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{retryError}</div> : null}
      <DataTable
        ariaLabel="推送日志列表"
        columns={deliveryColumns}
        data={visibleRows}
        getRowId={(row) => row.id}
        loading={loading}
        emptyText={deliverySearch ? "没有匹配的投递记录" : "暂无投递记录"}
        toolbar={{
          searchPlaceholder: "搜索投递记录",
          searchValue: deliverySearch,
          onSearchChange: setDeliverySearch,
          onRefresh: () => {
            void reload();
          },
          isFetching: loading,
        }}
        pagination={{
          page: filters.page,
          pageSize: filters.pageSize,
          pageSizeOptions: [...PAGE_SIZE_OPTIONS],
          onPageSizeChange: (pageSize) => updateFilters({ ...filters, page: 1, pageSize: asPageSize(pageSize) }),
          onFirstPage: () => updateFilters({ ...filters, page: 1 }),
          onPreviousPage: () => updateFilters({ ...filters, page: Math.max(1, filters.page - 1) }),
          onNextPage: () => updateFilters({ ...filters, page: filters.page + 1 }),
          onLastPage: () => updateFilters({ ...filters, page: filters.page + 1 }),
          canPreviousPage: canGoPrevious && !loading,
          canNextPage: canGoNext && !loading,
        }}
      />
      <DeliveryDetailSheet delivery={selectedDelivery} onOpenChange={(open) => !open && setSelectedDelivery(null)} />
      <AlertDialog
        open={confirmingRetry !== null}
        onOpenChange={(open) => {
          if (!open && !retryingEventId) setConfirmingRetry(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重投投递事件</AlertDialogTitle>
            <AlertDialogDescription>重投会将该投递记录重新置为 queued，并清空失败状态。</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingRetry ? (
            <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-[88px_1fr]">
              <dt className="text-xs text-muted-foreground">事件 ID</dt>
              <dd className="font-mono text-xs">{confirmingRetry.eventId}</dd>
              <dt className="text-xs text-muted-foreground">应用</dt>
              <dd>{confirmingRetry.app?.name ?? "未知应用"}</dd>
              <dt className="text-xs text-muted-foreground">会话</dt>
              <dd>{getDeliveryConversationName(confirmingRetry)}</dd>
              <dt className="text-xs text-muted-foreground">失败原因</dt>
              <dd>{confirmingRetry.lastError ?? "—"}</dd>
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(retryingEventId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingRetry || retryingEventId === confirmingRetry.eventId}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingRetry) void handleRetryDelivery(confirmingRetry);
              }}
            >
              {retryingEventId === confirmingRetry?.eventId ? "重投中" : "确认重投"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function QuickStatusTabs({
  label,
  value,
  rows,
  options,
  messageId,
  onChange,
  onClearMessageFilter,
}: {
  label: string;
  value: DeliveryFilters["status"];
  rows: DeliveryRow[];
  options: typeof DELIVERY_STATUS_FACETS;
  messageId?: string;
  onChange: (status: DeliveryFilters["status"]) => void;
  onClearMessageFilter: () => void;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs text-muted-foreground hover:text-foreground",
              value === option.value && "border-primary/50 bg-primary/10 text-primary",
            )}
          >
            {option.label} <span className="ml-1 tabular-nums">{countRowsByFacet(rows, option.value)}</span>
          </button>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {messageId ? (
          <button
            type="button"
            onClick={onClearMessageFilter}
            className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm text-foreground hover:bg-muted"
          >
            清除消息筛选
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DeliverySummary({ delivery }: { delivery: BackendDelivery }) {
  return (
    <DescriptionList
      className="rounded-md border bg-muted/40 p-3"
      items={[
        { label: "消息 ID", value: <code className="font-mono text-xs">{delivery.message?.messageId ?? "—"}</code> },
        { label: "消息摘要", value: delivery.message?.renderedText },
      ]}
    />
  );
}

function DeliveryDetailSheet({
  delivery,
  onOpenChange,
}: {
  delivery: BackendDelivery | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DetailSheet
      open={delivery !== null}
      onOpenChange={onOpenChange}
      title="投递详情"
      description={delivery?.eventId ?? "查看投递状态、失败原因和标准事件 payload。"}
      status={delivery ? <StatusBadge status={delivery.status} /> : null}
    >
      {delivery ? (
        <div className="space-y-4">
          <DescriptionList
            className="rounded-md border p-3"
            items={[
              { label: "事件 ID", value: <code className="font-mono text-xs">{delivery.eventId}</code> },
              { label: "事件类型", value: delivery.eventType },
              { label: "应用", value: delivery.app?.name ?? "未知应用" },
              { label: "会话", value: getDeliveryConversationName(delivery) },
              { label: "状态", value: <StatusBadge status={delivery.status} /> },
              { label: "尝试次数", value: delivery.attempts },
              { label: "失败原因", value: delivery.lastError },
            ]}
          />
          <DeliverySummary delivery={delivery} />
          <JsonViewer title="投递 payload" value={delivery.payload ?? {}} />
        </div>
      ) : null}
    </DetailSheet>
  );
}

function useApiData<T>(path: string, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const nextData = await apiFetch<T>(path);
      setData(nextData);
      setError(null);
      return nextData;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "数据加载失败");
      throw loadError;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const nextData = await apiFetch<T>(path);
        if (cancelled) return;
        setData(nextData);
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, error, reload };
}

function LoadState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
}) {
  if (loading) return <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">正在加载</div>;
  if (error) return <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div>;
  if (empty) return <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>;
  return null;
}

function PageShell({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  );
}

function mapDeliveryRow(delivery: BackendDelivery) {
  const conversation = delivery.message?.conversation;
  return {
    id: delivery.eventId,
    messageId: delivery.message?.messageId ?? "",
    app: delivery.app?.name ?? "未知应用",
    conversation: getDeliveryConversationName(delivery),
    conversationId: conversation?.id ?? null,
    conversationEntity: mapConversationEntity(conversation),
    status: delivery.status,
    attempts: delivery.attempts,
    updatedAt: delivery.updatedAt,
    source: delivery,
  };
}

function getDeliveryConversationName(delivery: BackendDelivery): string {
  const conversation = delivery.message?.conversation;
  return conversation?.platformRemark || conversation?.name || conversation?.peerWxid || "未知会话";
}

function mapConversationEntity(
  conversation: { platformRemark?: string | null; name?: string | null; peerWxid?: string | null } | null | undefined,
) {
  return {
    platformRemark: conversation?.platformRemark ?? null,
    displayName: conversation?.name ?? null,
    wxid: conversation?.peerWxid ?? null,
  };
}

function matchesDeliverySearch(row: DeliveryRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [row.id, row.app, row.conversation, row.status, String(row.attempts), String(row.updatedAt ?? "")]
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildDeliveryPath(filters: DeliveryFilters): string {
  const params = new URLSearchParams({
    take: String(filters.pageSize),
    skip: String((filters.page - 1) * filters.pageSize),
  });
  if (filters.status) params.set("status", filters.status);
  if (filters.messageId) params.set("messageId", filters.messageId);
  return `/api/deliveries?${params.toString()}`;
}

function asPageSize(value: number): number {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : DEFAULT_PAGE_SIZE;
}

function countRowsByFacet(rows: DeliveryRow[], status: DeliveryFilters["status"]): number {
  if (!status) return rows.length;
  if (status === "success") return rows.filter((row) => row.status === "delivered" || row.status === "acked").length;
  if (status === "in_progress") return rows.filter((row) => row.status === "queued" || row.status === "delivering").length;
  return rows.filter((row) => row.status === status).length;
}
