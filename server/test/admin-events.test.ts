import { describe, expect, it, vi } from "vitest";
import { AdminEventsController } from "../src/modules/admin-events/admin-events.controller.js";
import { AdminEventsService } from "../src/modules/admin-events/admin-events.service.js";

describe("AdminEvents", () => {
  it("管理员 SSE 连接写入消息事件帧", async () => {
    vi.useFakeTimers();
    const service = new AdminEventsService();
    const reply = buildSseReply();

    await service.open(reply as never);
    service.publishMessageChanged({
      eventType: "message.created",
      conversationId: "conv_1",
      messageId: "msg_1",
    });

    expect(reply.raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "text/event-stream; charset=utf-8",
    }));
    expect(reply.raw.write).toHaveBeenCalledWith(expect.stringContaining("event: message.created"));
    expect(reply.raw.write).toHaveBeenCalledWith(expect.stringContaining('"conversationId":"conv_1"'));

    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it("管理员 SSE 连接建立后立即写入注释帧以刷新响应头", async () => {
    vi.useFakeTimers();
    const service = new AdminEventsService();
    const reply = buildSseReply();

    await service.open(reply as never);

    expect(reply.raw.write).toHaveBeenCalledWith(": connected\n\n");

    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it("控制器把 /api/admin/events 连接交给管理员事件服务", async () => {
    const events = {
      open: vi.fn(async () => undefined),
    };
    const controller = new AdminEventsController(events as never);
    const reply = buildSseReply();

    await controller.events(reply as never);

    expect(events.open).toHaveBeenCalledWith(reply);
  });
});

function buildSseReply() {
  return {
    raw: {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      once: vi.fn(),
    },
  };
}
