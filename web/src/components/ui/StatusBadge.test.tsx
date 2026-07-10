import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("使用统一状态色板渲染成功状态", () => {
    render(<StatusBadge status="delivered" />);

    expect(screen.getByText("已投递")).toHaveClass("bg-green-100", "text-green-700");
  });

  it.each([
    ["confirm", "待确认", ["bg-amber-100", "text-amber-700"]],
    ["discard", "未发送", ["bg-muted", "text-muted-foreground"]],
  ] as const)("为 %s 展示对应投递语义", (status, label, classes) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toHaveClass(...classes);
  });

  it("未知状态回落为中性徽标", () => {
    render(<StatusBadge status="custom-state" />);

    expect(screen.getByText("custom-state")).toHaveClass("bg-muted", "text-muted-foreground");
  });
});
