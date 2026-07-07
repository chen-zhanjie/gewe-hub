import { describe, expect, it } from "vitest";
import {
  buildWebhookDedupeKey,
  classifyWebhookPayload,
  normalizeWebhookPayload,
  parseWebhookJsonBody,
  preserveLargeIntegerFields,
  stableJsonStringify
} from "../src/modules/gewe/webhook-utils.js";

describe("webhook 工具", () => {
  it("优先使用 appid:newMsgId 作为去重键，且 newMsgId 保持字符串", () => {
    const dedupeKey = buildWebhookDedupeKey({
      appid: "wx_app",
      wxid: "wxid_bot",
      newMsgId: "9154866412345678"
    });

    expect(dedupeKey).toBe("wx_app:9154866412345678");
  });

  it("解析回调 JSON 时保留超大消息 ID 精度", () => {
    const raw = '{"appid":"wx_app","newMsgId":6692899871431281247,"msgId":1725836602,"createTime":1782932724220}';
    const parsed = parseWebhookJsonBody(raw);

    expect(parsed.newMsgId).toBe("6692899871431281247");
    expect(parsed.createTime).toBe(1782932724220);
    expect(parsed.msgId).toBe(1725836602);
    expect(preserveLargeIntegerFields(raw)).toContain('"newMsgId":"6692899871431281247"');
  });

  it("解析 GeWe AddMsg 外层时保留 Data.NewMsgId 精度", () => {
    const raw = '{"TypeName":"AddMsg","Appid":"wx_app","Wxid":"wxid_bot","Data":{"MsgType":1,"NewMsgId":5004026754542010999,"CreateTime":1783308565,"Content":{"string":"hello"}}}';
    const parsed = parseWebhookJsonBody(raw);

    expect((parsed.Data as Record<string, unknown>).NewMsgId).toBe("5004026754542010999");
  });

  it("GeWe AddMsg 外层使用 Appid 和 Data.NewMsgId 去重并归为消息", () => {
    const payload = {
      TypeName: "AddMsg",
      Appid: "wx_app",
      Wxid: "wxid_bot",
      Data: {
        MsgType: 1,
        NewMsgId: "5004026754542010999",
        Content: { string: "hello" }
      }
    };

    expect(buildWebhookDedupeKey(payload)).toBe("wx_app:5004026754542010999");
    expect(classifyWebhookPayload(payload)).toBe("message");
  });

  it("GeWe AddMsg 收藏聊天记录 type=40 realinnertype=19 入口归一为 CHAT_RECORD", () => {
    const payload = {
      TypeName: "AddMsg",
      Appid: "wx_app",
      Wxid: "wxid_bot",
      Data: {
        MsgType: 49,
        NewMsgId: "7629605734086202297",
        Content: {
          string:
            "<msg><appmsg><title>聊天记录</title><des>摘要</des><type>40</type><realinnertype>19</realinnertype></appmsg></msg>",
        },
      },
    };

    expect(classifyWebhookPayload(payload)).toBe("message");
    expect(normalizeWebhookPayload(payload).msgType).toBe("CHAT_RECORD");
  });

  it("联系人变更回调归类为 contact", () => {
    expect(classifyWebhookPayload({
      appid: "wx_app",
      wxid: "wxid_bot",
      msgType: "MOD_CONTACTS",
      fromUser: "filehelper"
    })).toBe("contact");
  });

  it("缺失 newMsgId 时使用稳定 JSON 哈希降级", () => {
    const left = buildWebhookDedupeKey({ wxid: "wxid_bot", a: 1, b: 2 });
    const right = buildWebhookDedupeKey({ b: 2, a: 1, wxid: "wxid_bot" });

    expect(left).toBe(right);
    expect(left).toMatch(/^fallback:wxid_bot:/);
  });

  it("稳定 JSON stringify 不受对象 key 顺序影响", () => {
    expect(stableJsonStringify({ b: 2, a: 1 })).toBe(stableJsonStringify({ a: 1, b: 2 }));
  });

  it("缺少 msgType 的探针报文归类为 unknown", () => {
    expect(classifyWebhookPayload({ hello: "world" })).toBe("unknown");
  });
});
