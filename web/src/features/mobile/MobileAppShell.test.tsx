import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileAppShell } from "./MobileAppShell";
import { MobileBottomTabs } from "./MobileBottomTabs";
import { MobileLoginPage } from "./auth/MobileLoginPage";

describe("MobileAppShell", () => {
  it("在一级页面展示四个移动端 Tab，并标记当前页面", () => {
    render(
      <MobileAppShell
        activeTab="conversations"
        username="admin"
        showTabs
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      >
        <div>会话内容</div>
      </MobileAppShell>,
    );

    expect(screen.getByText("会话内容")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "移动端主导航" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "会话" })).toHaveAttribute("aria-current", "page");
  });

  it("在二级页面隐藏底部 Tab", () => {
    render(
      <MobileAppShell
        activeTab="conversations"
        username="admin"
        showTabs={false}
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      >
        <div>聊天详情</div>
      </MobileAppShell>,
    );

    expect(screen.queryByRole("navigation", { name: "移动端主导航" })).not.toBeInTheDocument();
  });

  it("点击 Tab 调用移动端导航", () => {
    const onNavigate = vi.fn();
    render(<MobileBottomTabs activeTab="conversations" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "通讯录" }));
    expect(onNavigate).toHaveBeenCalledWith("/mobile/contacts");
  });
});

describe("MobileLoginPage", () => {
  it("提交现有管理员账号和密码", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<MobileLoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(onLogin).toHaveBeenCalledWith("admin", "secret");
  });
});

describe("移动端路由源码", () => {
  it("注册独立登录、受保护壳和四个一级页面", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "../../routes/app-router.tsx"), "utf8");

    expect(source).toContain("MobileLoginRoute");
    expect(source).toContain("MobileConsoleRoute");
    expect(source).toContain("mobileRoutes.conversations");
    expect(source).toContain("mobileRoutes.contacts");
    expect(source).toContain("mobileRoutes.admin");
    expect(source).toContain("mobileRoutes.me");
  });
});
