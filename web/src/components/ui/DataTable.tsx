import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef, Row, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Database, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right" | "center";
    sticky?: "right";
    className?: string;
  }
}

export interface DataTableToolbar {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchDebounceMs?: number;
  facets?: DataTableFacet[];
  onRefresh?: () => void;
  isFetching?: boolean;
}

export interface DataTableFacet {
  label: string;
  value: string;
  options: DataTableFacetOption[];
  onValueChange: (value: string) => void;
}

export interface DataTableFacetOption {
  label: string;
  value: string;
  count?: number;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  onFirstPage?: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onLastPage?: () => void;
  canPreviousPage?: boolean;
  canNextPage?: boolean;
}

export interface DataTableProps<TData> {
  ariaLabel?: string;
  columns: ColumnDef<TData>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyText?: string;
  toolbar?: DataTableToolbar;
  pagination?: DataTablePagination;
  onRowClick?: (row: TData) => void;
  className?: string;
}

export function DataTable<TData>({
  ariaLabel,
  columns,
  data,
  getRowId,
  loading = false,
  skeletonRows = 5,
  emptyText = "暂无数据",
  toolbar,
  pagination,
  onRowClick,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
  });
  const skeletonCells = useMemo(() => Array.from({ length: Math.max(1, skeletonRows) }), [skeletonRows]);
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const showEmpty = !loading && rows.length === 0;

  return (
    <section className={cn("space-y-3", className)}>
      {toolbar ? <DataTableToolbarView toolbar={toolbar} /> : null}
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="overflow-x-auto">
          <table aria-label={ariaLabel} className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortState = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "px-3 py-2 font-medium",
                          alignClass(header.column.columnDef.meta?.align),
                          header.column.columnDef.meta?.sticky === "right" && "sticky right-0 bg-muted/40 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]",
                          header.column.columnDef.meta?.className,
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            aria-label={`排序 ${String(flexRender(header.column.columnDef.header, header.getContext()))}`}
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 text-left hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span aria-hidden="true" className="text-[10px]">
                              {sortState === "asc" ? "↑" : sortState === "desc" ? "↓" : "↕"}
                            </span>
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {loading ? (
                skeletonCells.map((_, index) => (
                  <tr key={index} data-testid="data-table-skeleton-row">
                    {table.getAllLeafColumns().map((column) => (
                      <td key={column.id} className="px-3 py-2">
                        <div className="h-4 w-full max-w-40 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : showEmpty ? (
                <tr>
                  <td colSpan={table.getAllLeafColumns().length} className="px-3 py-10">
                    <EmptyState icon={Database} title={emptyText} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <DataTableRow key={row.id} row={row} onRowClick={onRowClick} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {pagination ? <DataTablePaginationView pagination={pagination} /> : null}
    </section>
  );
}

function DataTableRow<TData>({ row, onRowClick }: { row: Row<TData>; onRowClick?: (row: TData) => void }) {
  const clickable = Boolean(onRowClick);
  return (
    <tr
      className={cn(clickable && "cursor-pointer hover:bg-muted/50")}
      onClick={() => onRowClick?.(row.original)}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className={cn(
            "px-3 py-2 align-middle",
            alignClass(cell.column.columnDef.meta?.align),
            cell.column.columnDef.meta?.sticky === "right" && "sticky right-0 bg-background shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]",
            cell.column.columnDef.meta?.className,
          )}
          onClick={(event) => {
            if (cell.column.columnDef.meta?.sticky === "right") {
              event.stopPropagation();
            }
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

function DataTableToolbarView({ toolbar }: { toolbar: DataTableToolbar }) {
  const [searchDraft, setSearchDraft] = useState(toolbar.searchValue ?? "");
  const debounceMs = toolbar.searchDebounceMs ?? 300;

  useEffect(() => {
    setSearchDraft(toolbar.searchValue ?? "");
  }, [toolbar.searchValue]);

  useEffect(() => {
    if (!toolbar.onSearchChange) return;
    const timer = window.setTimeout(() => {
      if (searchDraft !== (toolbar.searchValue ?? "")) {
        toolbar.onSearchChange?.(searchDraft);
      }
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, searchDraft, toolbar]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-64 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
          <Search className="size-4 shrink-0" />
          <span className="sr-only">{toolbar.searchPlaceholder ?? "搜索"}</span>
          <input
            aria-label={toolbar.searchPlaceholder ?? "搜索"}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={toolbar.searchPlaceholder ?? "搜索"}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
          />
        </label>
        {toolbar.facets?.map((facet) => <DataTableFacetChips key={facet.label} facet={facet} />)}
      </div>
      {toolbar.onRefresh ? (
        <button
          type="button"
          aria-label="刷新"
          onClick={toolbar.onRefresh}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw
            data-testid="data-table-refresh-icon"
            className={cn("size-4", toolbar.isFetching && "animate-spin")}
          />
          刷新
        </button>
      ) : null}
    </div>
  );
}

function DataTableFacetChips({ facet }: { facet: DataTableFacet }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={`${facet.label}分面筛选`}>
      {facet.options.map((option) => {
        const selected = option.value === facet.value;
        const label = `${facet.label}: ${option.label}${typeof option.count === "number" ? ` ${option.count}` : ""}`;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => facet.onValueChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs text-muted-foreground hover:text-foreground",
              selected && "border-primary/50 bg-primary/10 text-primary",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? <span className="ml-1 tabular-nums">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function DataTablePaginationView({ pagination }: { pagination: DataTablePagination }) {
  const totalPages = typeof pagination.total === "number" ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : undefined;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>{typeof pagination.total === "number" ? `共 ${pagination.total} 条` : `每页 ${pagination.pageSize} 条`}</span>
      <span>{totalPages ? `第 ${pagination.page} / ${totalPages} 页` : `第 ${pagination.page} 页`}</span>
      {pagination.pageSizeOptions?.length && pagination.onPageSizeChange ? (
        <label className="inline-flex items-center gap-2">
          每页
          <select
            aria-label="每页数量"
            value={pagination.pageSize}
            onChange={(event) => pagination.onPageSizeChange?.(Number(event.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-foreground outline-none"
          >
            {pagination.pageSizeOptions.map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        disabled={pagination.canPreviousPage === false}
        onClick={pagination.onFirstPage}
        className="rounded-md border px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        首页
      </button>
      <button
        type="button"
        disabled={pagination.canPreviousPage === false}
        onClick={pagination.onPreviousPage}
        className="rounded-md border px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        上一页
      </button>
      <button
        type="button"
        disabled={pagination.canNextPage === false}
        onClick={pagination.onNextPage}
        className="rounded-md border px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        下一页
      </button>
      <button
        type="button"
        disabled={pagination.canNextPage === false}
        onClick={pagination.onLastPage}
        className="rounded-md border px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        末页
      </button>
    </div>
  );
}

function alignClass(align?: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}
