import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("空 body 请求不默认发送 JSON Content-Type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/gewe/set-callback", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gewe/set-callback",
      expect.objectContaining({
        method: "POST",
        headers: {},
      }),
    );
  });

  it("有 body 请求默认发送 JSON Content-Type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ appId: "wx_app", wxid: "wxid_bot" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounts",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
        },
      }),
    );
  });
});
