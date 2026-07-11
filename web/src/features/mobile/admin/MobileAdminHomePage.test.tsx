import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "@/features/admin/AdminPages.test-utils";
import { MobileAdminHomePage } from "./MobileAdminHomePage";
import { MobileSettingsPage } from "./MobileSettingsPage";
import { MobileMePage } from "../me/MobileMePage";

describe("移动端管理与我的", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("管理首页只展示允许的六个管理入口", () => {
    render(<MobileAdminHomePage />);

    const navigation = screen.getByRole("navigation", { name: "管理功能" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(6);
    for (const name of [
      "应用",
      "微信账号",
      "推送日志",
      "发送记录",
      "HTML 页面",
      "运行观测",
    ]) {
      expect(
        within(navigation).getByRole("link", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    expect(within(navigation).queryByText("接入设置")).not.toBeInTheDocument();
    expect(
      within(navigation).queryByText("聊天工作台"),
    ).not.toBeInTheDocument();
  });

  it("我的展示管理员、GeWe 连接、当前账号、接入设置和退出", async () => {
    window.localStorage.setItem("gewehub.mobile.accountId", "account-1");
    const fetchMock = mockFetch({
      "/api/auth/me": { user: { username: "root", role: "admin" } },
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        baseUrl: "https://gewe.example",
      },
      "/api/accounts": [
        {
          id: "account-1",
          wxid: "wxid_root",
          nickname: "主账号",
          onlineStatus: "online",
        },
      ],
      "/api/auth/logout": { ok: true },
    });

    render(<MobileMePage />);

    expect(await screen.findByText("root")).toBeInTheDocument();
    expect(screen.getByText("连接正常")).toBeInTheDocument();
    expect(screen.getByText("主账号")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /当前微信账号/ })).toHaveAttribute(
      "href",
      "/mobile/admin/accounts",
    );
    expect(screen.getByRole("link", { name: /接入设置/ })).toHaveAttribute(
      "href",
      "/mobile/settings",
    );

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
  });

  it("接入设置只复用状态、回调 URL 和一键设置能力，不提供 Key 编辑", async () => {
    vi.stubEnv("VITE_CALLBACK_BASE_URL", "https://hub.example");
    const fetchMock = mockFetch({
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        callbackBaseUrl: "http://localhost:8090",
        baseUrl: "https://gewe.example",
      },
      "/api/gewe/set-callback": {
        ok: true,
        callbackUrl: "https://hub.example/webhook/gewe/dev-secret",
      },
    });

    render(<MobileSettingsPage />);

    expect(await screen.findByText("有效")).toBeInTheDocument();
    expect(screen.getByText("已配置", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("https://gewe.example")).toBeInTheDocument();
    expect(screen.getByLabelText("回调 URL 前缀")).toHaveValue(
      "https://hub.example",
    );
    expect(
      screen.getByText("https://hub.example/webhook/gewe/dev-secret"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制回调 URL" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Key/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键设置回调" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gewe/set-callback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ baseUrl: "https://hub.example" }),
        }),
      ),
    );
  });
});
