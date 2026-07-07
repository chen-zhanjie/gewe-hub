import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render } from "../AdminPages.test-utils";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("可以编辑回调 URL 前缀并提交给 GeWe 回调设置接口", async () => {
    vi.stubEnv("VITE_CALLBACK_BASE_URL", "http://3i2956l679.51vip.biz");
    const fetchMock = mockFetch({
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        callbackBaseUrl: "http://3i2956l679.51vip.biz",
        baseUrl: "https://gewe.example",
      },
      "/api/gewe/set-callback": {
        ok: true,
        callbackUrl: "http://3i2956l679.51vip.biz/webhook/gewe/dev-secret",
      },
    });

    render(<SettingsPage />);

    expect(await screen.findByText("http://3i2956l679.51vip.biz/webhook/gewe/dev-secret")).toBeInTheDocument();
    expect(screen.getByLabelText("回调 URL 前缀")).toHaveValue("http://3i2956l679.51vip.biz");
    fireEvent.click(screen.getByRole("button", { name: "一键设置回调" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gewe/set-callback",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ baseUrl: "http://3i2956l679.51vip.biz" }),
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).replace("http://localhost", "") === "/api/gewe/status" && !init?.method,
      ),
    ).toHaveLength(2);
  });

  it("前端 env 配置的回调前缀优先于后端状态里的默认前缀", async () => {
    vi.stubEnv("VITE_CALLBACK_BASE_URL", "http://3i2956l679.51vip.biz");
    const fetchMock = mockFetch({
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        callbackBaseUrl: "http://localhost:8090",
        baseUrl: "https://gewe.example",
      },
      "/api/gewe/set-callback": {
        ok: true,
        callbackUrl: "http://3i2956l679.51vip.biz/webhook/gewe/dev-secret",
      },
    });

    render(<SettingsPage />);

    expect(await screen.findByText("http://3i2956l679.51vip.biz/webhook/gewe/dev-secret")).toBeInTheDocument();
    expect(screen.getByLabelText("回调 URL 前缀")).toHaveValue("http://3i2956l679.51vip.biz");
    fireEvent.click(screen.getByRole("button", { name: "一键设置回调" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gewe/set-callback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ baseUrl: "http://3i2956l679.51vip.biz" }),
        }),
      ),
    );
  });

  it("没有前端 env 配置时使用当前浏览器地址作为回调默认前缀", async () => {
    const fetchMock = mockFetch({
      "/api/gewe/status": {
        ok: true,
        callbackUrl: "http://localhost:8090/webhook/gewe/dev-secret",
        callbackBaseUrl: "http://configured-server.example",
        baseUrl: "https://gewe.example",
      },
      "/api/gewe/set-callback": {
        ok: true,
        callbackUrl: "http://localhost/webhook/gewe/dev-secret",
      },
    });

    render(<SettingsPage />);

    const input = await screen.findByLabelText("回调 URL 前缀");
    expect(input).toHaveValue(window.location.origin);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "一键设置回调" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gewe/set-callback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ baseUrl: window.location.origin }),
        }),
      ),
    );
  });
});
