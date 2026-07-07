import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { EntityCell } from "@/components/ui/EntityCell";
import { TimeText } from "@/components/ui/TimeText";
import { formatMs, type BackendHubApp, type BoundConversationRow } from "./types";

export function BindingSheet({
  app,
  rows,
  loading,
  error,
  onOpenChange,
  onOpenWorkbench,
}: {
  app: BackendHubApp | null;
  rows: BoundConversationRow[];
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenWorkbench: (conversationId: string) => void;
}) {
  const columns = useMemo<ColumnDef<BoundConversationRow>[]>(() => [
    {
      accessorKey: "name",
      header: "会话",
      cell: ({ row }) => <EntityCell entity={row.original.entity} />,
    },
    {
      accessorKey: "type",
      header: "类型",
      cell: ({ row }) => row.original.type,
    },
    {
      accessorKey: "deliveryFilter",
      header: "过滤器",
      cell: ({ row }) => row.original.deliveryFilterText,
    },
    {
      accessorKey: "debounceMs",
      header: "防抖",
      cell: ({ row }) => formatMs(row.original.debounceMs),
      meta: { align: "right" },
    },
    {
      accessorKey: "boundAt",
      header: "绑定时间",
      cell: ({ row }) => <TimeText value={row.original.boundAt ?? row.original.updatedAt} />,
      meta: { align: "right" },
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      meta: { align: "right", sticky: "right" },
      cell: ({ row }) => (
        <button
          type="button"
          aria-label={`打开工作台会话 ${row.original.name}`}
          onClick={() => onOpenWorkbench(row.original.id)}
          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          打开会话
        </button>
      ),
    },
  ], [onOpenWorkbench]);

  return (
    <DetailSheet
      open={app !== null}
      onOpenChange={onOpenChange}
      title="绑定会话"
      description={app?.name ?? "查看该应用已绑定的会话"}
    >
      {error ? <div className="mb-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <DataTable
        ariaLabel="应用绑定会话列表"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={loading}
        emptyText="该应用暂无绑定会话"
      />
    </DetailSheet>
  );
}
