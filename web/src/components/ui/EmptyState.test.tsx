import { render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("显示圈底图标、具体文案和可选主操作", () => {
    render(
      <EmptyState
        icon={Plus}
        title="还没有应用"
        description="创建应用后可将会话绑定给它"
        action={<button type="button">新建应用</button>}
      />,
    );

    expect(screen.getByText("还没有应用")).toHaveClass("text-sm");
    expect(screen.getByText("创建应用后可将会话绑定给它")).toHaveClass("text-muted-foreground");
    expect(screen.getByRole("button", { name: "新建应用" })).toBeInTheDocument();
  });
});
