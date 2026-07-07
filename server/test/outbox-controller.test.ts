import { describe, expect, it, vi } from "vitest";
import { OutboxController } from "../src/modules/outbox/outbox.controller.js";

describe("OutboxController", () => {
  it("按任务 ID 查询 outbox 任务状态", async () => {
    const prisma = {
      outboxTask: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "task_sync_group",
          taskType: "sync_group_members",
          refId: "group_1",
          status: "done",
          lastError: null
        }))
      }
    };
    const controller = new OutboxController(prisma as never, {} as never);

    const result = await controller.get("task_sync_group");

    expect(prisma.outboxTask.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "task_sync_group" }
    });
    expect(result).toMatchObject({
      id: "task_sync_group",
      status: "done"
    });
  });
});
