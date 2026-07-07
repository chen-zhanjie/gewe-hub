import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForOutboxTaskDone } from "./outbox-task";

describe("waitForOutboxTaskDone", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("默认轮询足够覆盖较慢的后台同步任务", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "task_1", status: fetchMock.mock.calls.length >= 10 ? "done" : "running" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = waitForOutboxTaskDone("task_1");
    for (let index = 0; index < 10; index += 1) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expect(resultPromise).resolves.toMatchObject({ id: "task_1", status: "done" });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
