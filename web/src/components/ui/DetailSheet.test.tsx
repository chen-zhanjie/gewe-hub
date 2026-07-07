import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";
import { DetailSheet } from "./DetailSheet";

describe("DetailSheet", () => {
  it("使用右侧 Sheet 展示固定头部、滚动正文和底部操作栏", () => {
    render(
      <DetailSheet
        open
        onOpenChange={() => undefined}
        title="投递详情"
        description="del_1"
        status={<StatusBadge status="failed" />}
        footer={<button type="button">确认重投</button>}
      >
        <div>失败原因 timeout</div>
      </DetailSheet>,
    );

    expect(screen.getByRole("dialog", { name: "投递详情" })).toBeInTheDocument();
    expect(screen.getByText("del_1")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("失败原因 timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认重投" })).toBeInTheDocument();
  });
});
