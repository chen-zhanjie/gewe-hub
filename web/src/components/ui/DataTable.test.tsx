import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, RefreshCcw } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

interface TaskRow {
  id: string;
  status: string;
  attempts: number;
}

const columns: ColumnDef<TaskRow>[] = [
  {
    accessorKey: "id",
    header: "任务 ID",
    cell: ({ row }) => <code>{row.original.id}</code>,
  },
  {
    accessorKey: "status",
    header: "状态",
  },
  {
    accessorKey: "attempts",
    header: "尝试",
  },
  {
    id: "actions",
    header: "操作",
    meta: { align: "right", sticky: "right" },
    cell: ({ row }) => (
      <button type="button" aria-label={`查看 ${row.original.id}`}>
        <Eye className="size-4" />
      </button>
    ),
  },
];

describe("DataTable", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("按列定义渲染表格，支持排序、行点击、刷新和分页信息", () => {
    const onRowClick = vi.fn();
    const onRefresh = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={[
          { id: "task_b", status: "failed", attempts: 2 },
          { id: "task_a", status: "dead", attempts: 5 },
        ]}
        getRowId={(row) => row.id}
        onRowClick={onRowClick}
        toolbar={{ searchPlaceholder: "搜索任务", onRefresh, isFetching: true }}
        pagination={{ page: 2, pageSize: 20, total: 42 }}
      />,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("任务 ID")).toBeInTheDocument();
    expect(within(table).getByText("task_b")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toContainElement(screen.getByTestId("data-table-refresh-icon"));
    expect(screen.getByText("共 42 条")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "排序 任务 ID" }));
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(within(bodyRows[0]!).getByText("task_a")).toBeInTheDocument();

    fireEvent.click(within(bodyRows[0]!).getByText("task_a"));
    expect(onRowClick).toHaveBeenCalledWith({ id: "task_a", status: "dead", attempts: 5 });

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("加载中显示固定数量骨架行，空数据时显示 EmptyState", () => {
    const { rerender } = render(
      <DataTable columns={columns} data={[]} loading skeletonRows={5} emptyText="暂无失败任务" />,
    );

    expect(screen.getAllByTestId("data-table-skeleton-row")).toHaveLength(5);

    rerender(<DataTable columns={columns} data={[]} emptyText="暂无失败任务" />);
    expect(screen.getByText("暂无失败任务")).toBeInTheDocument();
  });

  it("工具栏搜索 300ms 防抖，支持状态分面 chip", () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const onFacetChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={[]}
        toolbar={{
          searchPlaceholder: "搜索任务",
          searchValue: "",
          onSearchChange,
          facets: [
            {
              label: "状态",
              value: "failed",
              options: [
                { label: "全部", value: "" },
                { label: "失败", value: "failed" },
                { label: "死亡", value: "dead", count: 2 },
              ],
              onValueChange: onFacetChange,
            },
          ],
        }}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索任务"), { target: { value: "task_a" } });
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSearchChange).toHaveBeenCalledWith("task_a");

    expect(screen.getByLabelText("状态分面筛选")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "状态: 失败" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "状态: 死亡 2" }));
    expect(onFacetChange).toHaveBeenCalledWith("dead");
  });

  it("分页器支持首页、上一页、下一页、末页和每页数量切换", () => {
    const onFirstPage = vi.fn();
    const onPreviousPage = vi.fn();
    const onNextPage = vi.fn();
    const onLastPage = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={[]}
        pagination={{
          page: 2,
          pageSize: 20,
          total: 90,
          pageSizeOptions: [20, 50],
          onPageSizeChange,
          onFirstPage,
          onPreviousPage,
          onNextPage,
          onLastPage,
          canPreviousPage: true,
          canNextPage: true,
        }}
      />,
    );

    expect(screen.getByText("共 90 条")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 5 页")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    fireEvent.click(screen.getByRole("button", { name: "上一页" }));
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    fireEvent.click(screen.getByRole("button", { name: "末页" }));
    fireEvent.change(screen.getByLabelText("每页数量"), { target: { value: "50" } });

    expect(onFirstPage).toHaveBeenCalledTimes(1);
    expect(onPreviousPage).toHaveBeenCalledTimes(1);
    expect(onNextPage).toHaveBeenCalledTimes(1);
    expect(onLastPage).toHaveBeenCalledTimes(1);
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
