import { describe, expect, it } from "vitest";
import { buildDeliveryEventId, buildSseFrame, eventTypeToDbValue, getBearerToken } from "../src/modules/delivery/delivery-utils.js";

describe("delivery 工具", () => {
  it("按标准 SSE 格式生成事件帧", () => {
    const frame = buildSseFrame({
      eventId: "del_msg_1_app_1",
      eventType: "message.created",
      data: { eventId: "del_msg_1_app_1", eventType: "message.created", payload: { ok: true } }
    });

    expect(frame).toContain("id: del_msg_1_app_1\n");
    expect(frame).toContain("event: message.created\n");
    expect(frame).toContain('data: {"eventId":"del_msg_1_app_1","eventType":"message.created","payload":{"ok":true}}\n\n');
  });

  it("提取 Bearer token", () => {
    expect(getBearerToken("Bearer abc")).toBe("abc");
    expect(getBearerToken("bearer abc")).toBe("abc");
    expect(getBearerToken(undefined)).toBeNull();
  });

  it("转换事件类型到数据库枚举值", () => {
    expect(eventTypeToDbValue("message.created")).toBe("message_created");
    expect(eventTypeToDbValue("message.revoked")).toBe("message_revoked");
  });

  it("同一消息的创建和撤回使用不同投递事件 ID", () => {
    expect(buildDeliveryEventId("msg_1", "app_1", "message.created")).toBe("del_msg_1_app_1_created");
    expect(buildDeliveryEventId("msg_1", "app_1", "message.revoked")).toBe("del_msg_1_app_1_revoked");
  });
});
