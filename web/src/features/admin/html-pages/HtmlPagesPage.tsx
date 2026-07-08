import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Copy, ExternalLink } from "lucide-react";
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
import { EntityCell } from "@/components/ui/EntityCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TimeText } from "@/components/ui/TimeText";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HtmlPageFilters } from "../AdminPages";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50] as const;
const HTML_PAGE_STATUS_FACETS = [
  { label: "全部", value: "" },
  { label: "可访问", value: "active" },
  { label: "已归档", value: "archived" },
  { label: "已删除", value: "deleted" },
] as const;

type HtmlPageRow = ReturnType<typeof mapHtmlPageRow>;

const DEFAULT_HTML_PAGE_FILTERS: HtmlPageFilters = {
  status: "",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

interface BackendHtmlPage {
  id: string;
  title?: string | null;
  desc?: string | null;
  publicUrl: string;
  status: string;
  createdAt?: string | Date;
  account?: { nickname?: string | null; platformRemark?: string | null; wxid?: string | null } | null;
  conversation?: { platformRemark?: string | null; name?: string | null; peerWxid?: string | null } | null;
  app?: { name?: string | null } | null;
  sendRequest?: { id?: string | null; status?: string | null } | null;
}

export function HtmlPagesPage({
  initialFilters = DEFAULT_HTML_PAGE_FILTERS,
  onFiltersChange,
}: {
  initialFilters?: HtmlPageFilters;
  onFiltersChange?: (filters: HtmlPageFilters) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  useEffect(() => setFilters(initialFilters), [initialFilters]);
  const htmlPagesPath = buildHtmlPagesPath(filters);
  const { data: pages, loading, error, reload } = useApiData<BackendHtmlPage[]>(htmlPagesPath, []);
  const [pageSearch, setPageSearch] = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState<BackendHtmlPage | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const rows = pages.map(mapHtmlPageRow);
  const visibleRows = rows.filter((row) => matchesHtmlPageSearch(row, pageSearch));
  const canGoPrevious = filters.page > 1;
  const canGoNext = pages.length === filters.pageSize;
  const columns = useMemo<ColumnDef<HtmlPageRow>[]>(() => [
    {
      accessorKey: "id",
      header: "页面 ID",
      cell: ({ row }) => <code className="font-mono text-xs">{row.original.id}</code>,
    },
    {
      accessorKey: "title",
      header: "标题",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.title}</div>
          {row.original.desc ? <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.original.desc}</div> : null}
        </div>
      ),
    },
    {
      accessorKey: "conversation",
      header: "会话",
      cell: ({ row }) => <EntityCell entity={row.original.conversationEntity} />,
    },
    {
      accessorKey: "app",
      header: "应用",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: "创建时间",
      cell: ({ row }) => <TimeText value={row.original.createdAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <a
            href={row.original.publicUrl}
            target="_blank"
            rel="noreferrer"
            title="打开公网页面"
            aria-label={`打开公网页面 ${row.original.title}`}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" />
          </a>
          <button
            type="button"
            title="复制公网链接"
            aria-label="复制公网链接"
            onClick={() => {
              void navigator.clipboard?.writeText(row.original.publicUrl);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-4" />
          </button>
          <button
            type="button"
            title="归档"
            aria-label="归档"
            disabled={row.original.status !== "active" || archivingId === row.original.id}
            onClick={() => {
              setConfirmingArchive(row.original.source);
              setArchiveError(null);
            }}
            className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Archive className="size-4" />
          </button>
        </div>
      ),
    },
  ], [archivingId]);

  function updateFilters(nextFilters: HtmlPageFilters) {
    setFilters(nextFilters);
    onFiltersChange?.(nextFilters);
  }

  async function handleArchive(page: BackendHtmlPage) {
    if (page.status !== "active" || archivingId) return;
    setArchivingId(page.id);
    setArchiveError(null);
    try {
      await apiFetch(`/api/html-pages/${page.id}/archive`, { method: "POST" });
      await reload();
      setConfirmingArchive(null);
    } catch (archiveError) {
      setArchiveError(archiveError instanceof Error ? archiveError.message : "归档失败");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <PageShell description="查看由 GeWeHub 托管并通过消息发送出去的 HTML 页面。">
      <QuickStatusTabs
        label="HTML 页面状态"
        value={filters.status}
        rows={rows}
        options={HTML_PAGE_STATUS_FACETS}
        onChange={(status) => updateFilters({ ...filters, status, page: 1 })}
      />
      <LoadState loading={loading} error={error} empty={!loading && rows.length === 0} emptyText="暂无 HTML 页面" />
      {archiveError ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{archiveError}</div> : null}
      <DataTable
        ariaLabel="HTML 页面列表"
        columns={columns}
        data={visibleRows}
        getRowId={(row) => row.id}
        loading={loading}
        emptyText={pageSearch ? "没有匹配的 HTML 页面" : "暂无 HTML 页面"}
        toolbar={{
          searchPlaceholder: "搜索 HTML 页面",
          searchValue: pageSearch,
          onSearchChange: setPageSearch,
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
      <AlertDialog
        open={confirmingArchive !== null}
        onOpenChange={(open) => {
          if (!open && !archivingId) setConfirmingArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档 HTML 页面</AlertDialogTitle>
            <AlertDialogDescription>归档后公开访问入口会停止返回页面内容。</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingArchive ? (
            <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-[88px_1fr]">
              <dt className="text-xs text-muted-foreground">页面 ID</dt>
              <dd className="font-mono text-xs">{confirmingArchive.id}</dd>
              <dt className="text-xs text-muted-foreground">标题</dt>
              <dd>{confirmingArchive.title || "未命名 HTML"}</dd>
              <dt className="text-xs text-muted-foreground">公网链接</dt>
              <dd className="break-all font-mono text-xs">{confirmingArchive.publicUrl}</dd>
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(archivingId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmingArchive || archivingId === confirmingArchive.id}
              onClick={(event) => {
                event.preventDefault();
                if (confirmingArchive) void handleArchive(confirmingArchive);
              }}
            >
              {archivingId === confirmingArchive?.id ? "归档中" : "确认归档"}
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
  value: HtmlPageFilters["status"];
  rows: HtmlPageRow[];
  options: typeof HTML_PAGE_STATUS_FACETS;
  onChange: (status: HtmlPageFilters["status"]) => void;
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

function mapHtmlPageRow(page: BackendHtmlPage) {
  return {
    id: page.id,
    title: page.title || "未命名 HTML",
    desc: page.desc ?? "",
    publicUrl: page.publicUrl,
    conversation: getHtmlPageConversationName(page),
    conversationEntity: mapConversationEntity(page.conversation),
    app: page.app?.name ?? "—",
    status: page.status,
    createdAt: page.createdAt,
    source: page,
  };
}

function getHtmlPageConversationName(page: BackendHtmlPage): string {
  const conversation = page.conversation;
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

function matchesHtmlPageSearch(row: HtmlPageRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [row.id, row.title, row.desc, row.publicUrl, row.conversation, row.app, row.status, String(row.createdAt ?? "")]
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildHtmlPagesPath(filters: HtmlPageFilters): string {
  const params = new URLSearchParams({
    take: String(filters.pageSize),
    skip: String((filters.page - 1) * filters.pageSize),
  });
  if (filters.status) params.set("status", filters.status);
  return `/api/html-pages?${params.toString()}`;
}

function asPageSize(value: number): number {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
    ? value
    : DEFAULT_PAGE_SIZE;
}

function countRowsByFacet(rows: HtmlPageRow[], status: HtmlPageFilters["status"]): number {
  if (!status) return rows.length;
  return rows.filter((row) => row.status === status).length;
}
