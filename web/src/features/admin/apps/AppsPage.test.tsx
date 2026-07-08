import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "../AdminPages.test-utils";
import { AppsPage } from "./AppsPage";

const routerNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: routerNavigateMock }),
}));

describe("AppsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerNavigateMock.mockReset();
  });

  it("应用列表可以输入应用名确认后停用应用并刷新列表", async () => {
    const fetchMock = mockFetch({
      "/api/apps": [
        {
          id: "app_real",
          name: "真实 Hermes 应用",
          status: "active",
          ownerWxid: "wxid_owner_real",
          token: "ghub_real_token_123456",
          defaultDebounceMs: 1500,
          _count: { conversations: 7, deliveries: 3 },
        },
      ],
      "/api/accounts": [],
      "/api/apps/app_real": {
        id: "app_real",
      },
    });

    render(<AppsPage />);

    const appsTable = await screen.findByRole("table", { name: "应用列表" });
    fireEvent.click(within(appsTable).getByRole("button", { name: "停用应用 真实 Hermes 应用" }));

    const confirmDialog = await screen.findByRole("alertdialog", { name: "停用应用" });
    expect(within(confirmDialog).getByText("真实 Hermes 应用")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("7 个绑定会话")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("3 条推送记录")).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "停用应用" })).not.toBeInTheDocument());
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/apps/app_real" && init?.method === "DELETE",
      ),
    ).toHaveLength(0);

    fireEvent.click(within(appsTable).getByRole("button", { name: "停用应用 真实 Hermes 应用" }));
    const secondConfirmDialog = await screen.findByRole("alertdialog", { name: "停用应用" });
    expect(within(secondConfirmDialog).getByRole("button", { name: "确认停用" })).toBeDisabled();
    fireEvent.change(within(secondConfirmDialog).getByLabelText("输入应用名确认停用"), { target: { value: "真实 Hermes 应用" } });
    fireEvent.click(within(secondConfirmDialog).getByRole("button", { name: "确认停用" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/apps/app_real",
        expect.objectContaining({ method: "DELETE", credentials: "include" }),
      ),
    );
    expect(fetchMock.mock.calls.filter(([input]) => String(input).replace("http://localhost", "") === "/api/apps")).toHaveLength(2);
  });

  it("停用应用失败时在确认弹窗内显示错误并保持可重试", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://localhost", "");
      if (path === "/api/apps" && !init?.method) {
        return new Response(
          JSON.stringify([
            {
              id: "app_real",
              name: "真实 Hermes 应用",
              status: "active",
              ownerWxid: "wxid_owner_real",
              token: "ghub_real_token_123456",
              _count: { conversations: 7, deliveries: 3 },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (path === "/api/accounts" && !init?.method) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path === "/api/apps/app_real" && init?.method === "DELETE") {
        return new Response(JSON.stringify({ error: { message: "应用仍有关联投递" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { message: "not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AppsPage />);

    const appsTable = await screen.findByRole("table", { name: "应用列表" });
    fireEvent.click(within(appsTable).getByRole("button", { name: "停用应用 真实 Hermes 应用" }));
    const confirmDialog = await screen.findByRole("alertdialog", { name: "停用应用" });
    fireEvent.change(within(confirmDialog).getByLabelText("输入应用名确认停用"), { target: { value: "真实 Hermes 应用" } });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "确认停用" }));

    expect(await within(confirmDialog).findByText("应用仍有关联投递")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog", { name: "停用应用" })).toBeInTheDocument();
    expect(within(confirmDialog).getByRole("button", { name: "确认停用" })).not.toBeDisabled();
  });
});
