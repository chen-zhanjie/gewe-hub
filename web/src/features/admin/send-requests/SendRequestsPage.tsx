import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, ClipboardList, Undo2 } from "lucide-react";
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
import type { SendRequestFilters } from "../AdminPages";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50] as const;
const SEND_REQUEST_STATUS_FACETS = [
  { label: "全部", value: "" },
  { label: "成功", value: "success" },
  { label: "失败", value: "failed" },
  { label: "结果未知", value: "unknown" },
  { label: "进行中", value: "in_progress" },
] as const;

type SendRequestRow = ReturnType<typeof mapSendRow>;

const DEFAULT_SEND_REQUEST_FILTERS: SendRequestFilters = {
  status: "",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

interface BackendSendRequest {
  id: string;
  type: string;
  status: string;
  resultMsgId?: string | null;
  resultNewMsgId?: string | null;
  updatedAt?: string | Date;
  requestPayload?: unknown;
  geweRequest?: unknown;
  geweResponse?: unknown;
  conversation?: {
    platformRemark?: string | null;
    name?: string | null;
    peerWxid?: string | null;
  } | null;
}

export function SendRequestsPage({
  initialFilters = DEFAULT_SEND_REQUEST_FILTERS,
  onFiltersChange,
}: {
  initialFilters?: SendRequestFilters;
  onFiltersChange?: (filters: SendRequestFilters) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  useEffect(() => setFilters(initialFilters), [initialFilters]);
  const sendRequestPath = buildSendRequestPath(filters);
  const { data: sendRows, loading, error, reload } = useApiData<BackendSendRequest[]>(sendRequestPath, []);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<BackendSendRequest | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<BackendSendRequest | null>(null);
  const [selectedSendRequest, setSelectedSendRequest] = useState<BackendSendRequest | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [sendSearch, setSendSearch] = useState("");
  const rows = sendRows.map(mapSendRow);
  const visibleRows = rows.filter((row) => matchesSendRequestSearch(row, sendSearch));
  const canGoPrevious = filters.page > 1;
  const canGoNext = sendRows.length === filters.pageSize;
  const sendRequestColumns = useMemo<ColumnDef<SendRequestRow>[]>(() => [
    {
      accessorKey: "id",
      header: "请求 ID",
      cell: ({ row }) => <code className="font-mono text-xs">{row.original.id}</code>,
    },
    {
      accessorKey: "conversation",
      header: "会话",
      cell: ({ row }) => <EntityCell entity={row.original.conversationEntity} />,
    },
    {
      accessorKey: "type",
      header: "类型",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={sendRequestBadgeStatus(row.original.status)} />,
    },
    {
      accessorKey: "resultMsgId",
      header: "结果消息",
      cell: ({ row }) => sendRequestResultText(row.original),
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
            onClick={() => setSelectedSendRequest(row.original.source)}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <ClipboardList className="size-4" />
          </button>
          <button
            type="button"
            title="撤回"
            aria-label="撤回"
            disabled={row.original.status !== "sent" || revokingId === row.original.id}
            onClick={() => {
              setConfirmingRevoke(row.original.source);
              setRevokeError(null);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            title="取消发送重试"
            aria-label="取消发送重试"
            disabled={!canCancelSendRequest(row.original.status) || cancellingId === row.original.id}
            onClick={() => {
              setConfirmingCancel(row.original.source);
              setCancelError(null);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Ban className="size-4" />
          </button>
        </div>
      ),
    },
  ], [cancellingId, revokingId]);

  function updateFilters(nextFilters: SendRequestFilters) {
    setFilters(nextFilters);
    onFiltersChange?.(nextFilters);
  }

  async function handleRevoke(row: BackendSendRequest) {
    if (row.status !== "sent" || revokingId) return;
    setRevokingId(row.id);
    setRevokeError(null);
    try {
      await apiFetch(`/api/send/${row.id}/revoke`, { method: "POST" });
      await reload();
      setConfirmingRevoke(null);
    } catch (error) {
      setRevokeError(error instanceof Error ? error.message : "撤回失败");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCancel(row: BackendSendRequest) {
    if (!canCancelSendRequest(row.status) || cancellingId) return;
    setCancellingId(row.id);
    setCancelError(null);
    try {
      await apiFetch(`/api/send/${row.id}/cancel`, { method: "POST" });
      await reload();
      setConfirmingCancel(null);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "取消发送重试失败");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <PageShell description="追踪后台和应用发起的发送请求。">
      <QuickStatusTabs
        label="发送记录状态"
        value={filters.status}
        rows={rows}
        options={SEND_REQUEST_STATUS_FACETS}
        onChange={(status) => updateFilters({ ...filters, status, page: 1 })}
      />
      <LoadState loading={loading} error={error} empty={!loading && rows.length === 0} emptyText="暂无发送记录" />
      {revokeError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{revokeError}</div> : null}
      {cancelError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{cancelError}</div> : null}
      <DataTable
        ariaLabel="发送记录列表"
        columns={sendRequestColumns}
        data={visibleRows}
        getRowId={(row) => row.id}
        loading={loading}
        emptyText={sendSearch ? "没有匹配的发送记录" : "暂无发送记录"}
        toolbar={{
          searchPlaceholder: "搜索发送记录",
          searchValue: sendSearch,
          onSearchChange: setSendSearch,
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
      <SendRequestDetailSheet request={selectedSendRequest} onOpenChange={(open) => !open && setSelectedSendRequest(null)} />
      <AlertDialog
        open={confirmingRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revokingId) setConfirmingRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤回发送消息</AlertDialogTitle>
            <AlertDialogDescription>撤回后将调用 GeWe 撤回接口，微信侧消息会尝试显示为已撤回。</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingRevoke ? (
            <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-[88px_1fr]">
              <dt className="text-xs text-muted-foreground">请求 ID</dt>
              <dd className="font-mono text-xs">{confirmingRevoke.id}</dd>
              <dt className="text-xs text-muted-foreground">会话</dt>
              <dd>{getSendRequestConversationName(confirmingRevoke)}</dd>
              <dt className="text-xs text-muted-foreground">结果消息</dt>
              <dd className="font-mono text-xs">{confirmingRevoke.resultMsgId || confirmingRevoke.resultNewMsgId || "—"}</dd>
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(revokingId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingRevoke || revokingId === confirmingRevoke.id}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingRevoke) void handleRevoke(confirmingRevoke);
              }}
            >
              {revokingId === confirmingRevoke?.id ? "撤回中" : "确认撤回"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmingCancel !== null}
        onOpenChange={(open) => {
          if (!open && !cancellingId) setConfirmingCancel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消发送重试</AlertDialogTitle>
            <AlertDialogDescription>取消后会终止关联发送任务，避免同一文件或图片继续重复发送。</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingCancel ? (
            <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-[88px_1fr]">
              <dt className="text-xs text-muted-foreground">请求 ID</dt>
              <dd className="font-mono text-xs">{confirmingCancel.id}</dd>
              <dt className="text-xs text-muted-foreground">会话</dt>
              <dd>{getSendRequestConversationName(confirmingCancel)}</dd>
              <dt className="text-xs text-muted-foreground">状态</dt>
              <dd><StatusBadge status={sendRequestBadgeStatus(confirmingCancel.status)} /></dd>
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(cancellingId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingCancel || cancellingId === confirmingCancel.id}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingCancel) void handleCancel(confirmingCancel);
              }}
            >
              {cancellingId === confirmingCancel?.id ? "取消中" : "确认取消"}
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
  onChange,
}: {
  label: string;
  value: SendRequestFilters["status"];
  rows: SendRequestRow[];
  options: typeof SEND_REQUEST_STATUS_FACETS;
  onChange: (status: SendRequestFilters["status"]) => void;
}) {
  return (
    <section aria-label={label} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-4 py-3">
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
    </section>
  );
}

function SendRequestSummary({ row }: { row: BackendSendRequest }) {
  const payload = asRecord(row.requestPayload);
  const geweRequest = asRecord(row.geweRequest);
  const geweResponse = asRecord(row.geweResponse);
  const fileName = firstString(payload, ["fileName", "name", "title"]);
  const apiName = firstString(geweRequest, ["api", "method", "endpoint"]);
  const responseMessage = firstString(geweResponse, ["msg", "message", "error"]);

  return (
    <DescriptionList
      className="rounded-md border bg-muted/40 p-3"
      items={[
        { label: "文件/标题", value: fileName },
        { label: "GeWe API", value: apiName },
        { label: "响应消息", value: responseMessage },
      ]}
    />
  );
}

function SendRequestDetailSheet({
  request,
  onOpenChange,
}: {
  request: BackendSendRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DetailSheet
      open={request !== null}
      onOpenChange={onOpenChange}
      title="发送详情"
      description={request?.id ?? "查看发送请求、GeWe 请求与 GeWe 响应。"}
      status={request ? <StatusBadge status={sendRequestBadgeStatus(request.status)} /> : null}
    >
      {request ? (
        <div className="space-y-4">
          <DescriptionList
            className="rounded-md border p-3"
            items={[
              { label: "请求 ID", value: <code className="font-mono text-xs">{request.id}</code> },
              { label: "会话", value: getSendRequestConversationName(request) },
              { label: "类型", value: request.type },
              { label: "状态", value: <StatusBadge status={sendRequestBadgeStatus(request.status)} /> },
              { label: "结果消息", value: <code className="font-mono text-xs">{request.resultMsgId || request.resultNewMsgId || "—"}</code> },
            ]}
          />
          <SendRequestSummary row={request} />
          <JsonViewer title="请求 payload" value={request.requestPayload ?? {}} />
          <JsonViewer title="GeWe 请求" value={request.geweRequest ?? {}} />
          <JsonViewer title="GeWe 响应" value={request.geweResponse ?? {}} />
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

function mapSendRow(row: BackendSendRequest) {
  return {
    id: row.id,
    conversation: getSendRequestConversationName(row),
    conversationEntity: mapConversationEntity(row.conversation),
    type: row.type,
    status: row.status,
    resultMsgId: row.resultMsgId || row.resultNewMsgId || "",
    updatedAt: row.updatedAt,
    source: row,
  };
}

function getSendRequestConversationName(row: BackendSendRequest): string {
  return row.conversation?.platformRemark || row.conversation?.name || row.conversation?.peerWxid || "未知会话";
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

function matchesSendRequestSearch(row: SendRequestRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [row.id, row.conversation, row.type, row.status, row.resultMsgId, String(row.updatedAt ?? "")]
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildSendRequestPath(filters: SendRequestFilters): string {
  const params = new URLSearchParams({
    take: String(filters.pageSize),
    skip: String((filters.page - 1) * filters.pageSize),
  });
  if (filters.status) params.set("status", filters.status);
  return `/api/send-requests?${params.toString()}`;
}

function asPageSize(value: number): number {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : DEFAULT_PAGE_SIZE;
}

function countRowsByFacet(rows: SendRequestRow[], status: SendRequestFilters["status"]): number {
  if (!status) return rows.length;
  if (status === "success") return rows.filter((row) => row.status === "sent").length;
  if (status === "in_progress") return rows.filter((row) => row.status === "pending").length;
  return rows.filter((row) => row.status === status).length;
}

function sendRequestBadgeStatus(status: string): string {
  return status === "unknown" ? "result_unknown" : status;
}

function sendRequestResultText(row: SendRequestRow): string {
  if (row.resultMsgId) return row.resultMsgId;
  if (row.status === "pending") return "等待中";
  if (row.status === "unknown") return "结果未知";
  return "—";
}

function canCancelSendRequest(status: string): boolean {
  return status === "pending" || status === "failed" || status === "unknown";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
