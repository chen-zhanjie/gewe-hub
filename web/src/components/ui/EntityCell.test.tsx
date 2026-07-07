import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityCell } from "./EntityCell";

describe("EntityCell", () => {
  it("按备注优先级渲染微信实体，并用头像展示名称首字符", () => {
    render(
      <EntityCell
        entity={{
          wxid: "wxid_customer",
          nickname: "陈可乐",
          displayName: "客户昵称",
          platformRemark: "VIP 客户",
          avatarUrl: "https://example.test/avatar.jpg",
        }}
      />,
    );

    expect(screen.getByText("VIP 客户")).toBeInTheDocument();
    expect(screen.getByText("wxid_customer")).toBeInTheDocument();

    fireEvent.error(screen.getByRole("img", { name: "VIP 客户" }));
    expect(screen.getByText("V")).toBeInTheDocument();
  });
});
