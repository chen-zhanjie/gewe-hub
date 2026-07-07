import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "../AdminPages.test-utils";
import { AccountsPage } from "./AccountsPage";

describe("AccountsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("可以手动更新账号头像昵称和在线状态", async () => {
    const fetchMock = mockFetch({
      "/api/accounts": [
        {
          id: "acc_real_1",
          appId: "wx_app",
          wxid: "wxid_bot",
          nickname: "旧昵称",
          onlineStatus: "unknown",
        },
      ],
      "/api/accounts/acc_real_1/sync-profile": {
        id: "acc_real_1",
        appId: "wx_app",
        wxid: "wxid_bot",
        nickname: "GeWe 昵称",
        avatarUrl: "https://avatar.example/bot.jpg",
        onlineStatus: "online",
      },
    });

    render(<AccountsPage />);

    await screen.findByText("旧昵称");
    const accountTable = await screen.findByRole("table", { name: "微信账号列表" });
    fireEvent.click(within(accountTable).getByRole("button", { name: "更新信息 旧昵称" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts/acc_real_1/sync-profile",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/accounts" && !init?.method,
      ),
    ).toHaveLength(2);
  });
});
