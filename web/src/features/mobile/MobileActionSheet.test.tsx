import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileActionSheet } from "./MobileActionSheet";

describe("MobileActionSheet", () => {
  it("提供 dialog 语义并渲染现有动作", () => {
    render(
      <MobileActionSheet
        open
        title="消息操作"
        actions={[
          { id: "quote", label: "引用", onSelect: vi.fn() },
          { id: "detail", label: "详情", onSelect: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "消息操作" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "引用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "详情" })).toBeInTheDocument();
    expect(screen.queryByText("复制")).not.toBeInTheDocument();
    expect(screen.queryByText("转发")).not.toBeInTheDocument();
  });

  it("点击动作后执行动作并关闭", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        open
        title="消息操作"
        actions={[{ id: "quote", label: "引用", onSelect }]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "引用" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击遮罩或按 Escape 时关闭", () => {
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        open
        title="会话操作"
        actions={[{ id: "hide", label: "隐藏会话", onSelect: vi.fn() }]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("mobile-action-sheet-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("底部面板包含安全区内边距", () => {
    render(
      <MobileActionSheet
        open
        title="消息操作"
        actions={[{ id: "detail", label: "详情", onSelect: vi.fn() }]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "消息操作" })).toHaveStyle({
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    });
  });
});
