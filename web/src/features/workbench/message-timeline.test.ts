import { describe, expect, it } from "vitest";
import type { MessageItem } from "@/lib/workspace-data";
import { buildMessageTimeline } from "./message-timeline";

describe("buildMessageTimeline", () => {
  it("按日期插入分隔条，并将同发送者 3 分钟内连续消息合并为同组", () => {
    const first = messageFixture("m1", "wxid_alice", "2026-07-06T07:16:37.000Z");
    const continuation = messageFixture("m2", "wxid_alice", "2026-07-06T07:18:37.000Z");
    const later = messageFixture("m3", "wxid_alice", "2026-07-06T07:22:38.000Z");
    const nextDay = messageFixture("m4", "wxid_alice", "2026-07-07T07:16:37.000Z");

    const timeline = buildMessageTimeline([first, continuation, later, nextDay]);

    expect(timeline.map((item) => item.key)).toEqual([
      "date:2026-07-06",
      "message:m1",
      "message:m2",
      "message:m3",
      "date:2026-07-07",
      "message:m4",
    ]);
    expect(timeline[0]).toMatchObject({ type: "date", label: "2026年7月6日" });
    expect(timeline[1]).toMatchObject({ type: "message", startsGroup: true });
    expect(timeline[2]).toMatchObject({ type: "message", startsGroup: false });
    expect(timeline[3]).toMatchObject({ type: "message", startsGroup: true });
    expect(timeline[5]).toMatchObject({ type: "message", startsGroup: true });
  });
});

function messageFixture(id: string, senderWxid: string, sentAtIso: string): MessageItem {
  return {
    id,
    messageId: id,
    senderName: senderWxid,
    senderProfile: {
      wxid: senderWxid,
      nickname: senderWxid,
      displayName: senderWxid,
      platformRemark: null,
      avatarUrl: null,
      status: "active",
    },
    isSelf: false,
    sentAt: sentAtIso,
    sentAtIso,
    status: "normal",
    content: { type: "text", text: id },
    standardJson: { type: "text", text: id },
    rawPayload: null,
    deliveries: [],
  };
}
