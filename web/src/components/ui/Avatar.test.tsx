import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("有头像地址时渲染图片，加载失败后降级到首字符占位", () => {
    render(<Avatar name="陈可乐" src="https://example.test/avatar.jpg" size={40} />);

    const image = screen.getByRole("img", { name: "陈可乐" });
    expect(image).toHaveAttribute("src", "https://example.test/avatar.jpg");

    fireEvent.error(image);

    expect(screen.queryByRole("img", { name: "陈可乐" })).not.toBeInTheDocument();
    expect(screen.getByText("陈")).toBeInTheDocument();
  });

  it("只允许 24、32、40 三档尺寸", () => {
    const { rerender } = render(<Avatar name="张三" size={24} />);
    expect(screen.getByLabelText("张三")).toHaveClass("size-6");

    rerender(<Avatar name="张三" size={32} />);
    expect(screen.getByLabelText("张三")).toHaveClass("size-8");

    rerender(<Avatar name="张三" size={40} />);
    expect(screen.getByLabelText("张三")).toHaveClass("size-10");
  });
});
