import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DescriptionList } from "./DescriptionList";

describe("DescriptionList", () => {
  it("按两列描述列表渲染字段，空值显示破折号", () => {
    render(
      <DescriptionList
        items={[
          { label: "事件 ID", value: "del_1" },
          { label: "失败原因", value: null },
        ]}
      />,
    );

    expect(screen.getByText("事件 ID")).toHaveClass("text-xs", "text-muted-foreground");
    expect(screen.getByText("del_1")).toHaveClass("text-sm");
    expect(screen.getByText("失败原因")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
