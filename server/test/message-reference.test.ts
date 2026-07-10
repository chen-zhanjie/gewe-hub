import { describe, expect, it } from "vitest";
import type { MessageEnvelope } from "@gewehub/contracts";
import {
  buildQuoteReferenceWhere,
  hydrateMessageReferencesFromLocalMessages,
  hydrateQuoteFromLocalMessage,
  mergeQuoteFromReferencedPayload,
} from "../src/modules/messages/message-reference.js";

function envelopeWithEmptyQuotedChatRecord(): MessageEnvelope {
  return {
    schemaVersion: 1,
    eventType: "message.created",
    messageId: "msg_quote",
    status: "normal",
    isSelf: false,
    isAtMe: false,
    account: { wxid: "wxid_bot" },
    conversation: { id: "cvs_1", type: "group", wxid: "48315023241@chatroom" },
    sender: { wxid: "wxid_sender", isOwner: false },
    mentions: [],
    content: { type: "text", text: "引用" },
    quote: {
      type: "chat_record",
      text: "群聊的聊天记录",
      items: [],
      senderName: "陈可乐",
      sourceMessageId: "msg_8103115687525853092"
    },
    renderedText: "引用: [聊天记录] 群聊的聊天记录",
    sentAt: "2026-07-06T03:56:09.000Z"
  };
}

describe("消息引用本地回查", () => {
  it("只按稳定消息 ID 构建精确查询", () => {
    expect(buildQuoteReferenceWhere(envelopeWithEmptyQuotedChatRecord(), "account_1", "conversation_1")).toEqual({
      accountId: "account_1",
      conversationId: "conversation_1",
      messageId: "msg_8103115687525853092"
    });
  });

  it("quote 中 chat_record items 为空时使用本地原消息补全并重新渲染", () => {
    const referencedPayload: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      messageId: "msg_8103115687525853000",
      content: {
        type: "chat_record",
        text: "群聊的聊天记录",
        items: [
          { type: "text", text: "小道消息是说 7号GPT出新模型吗", senderName: "🍞" },
          { type: "image", text: "[图片]", media: { status: "failed", url: null } }
        ]
      },
      quote: null,
      renderedText: "[聊天记录] 群聊的聊天记录"
    };

    const merged = mergeQuoteFromReferencedPayload(envelopeWithEmptyQuotedChatRecord(), referencedPayload);

    expect(merged.quote?.type).toBe("chat_record");
    expect(merged.quote?.items?.length).toBe(2);
    expect(merged.quote?.senderName).toBe("陈可乐");
    expect(merged.quote?.sourceMessageId).toBe("msg_8103115687525853092");
    expect(merged.renderedText).toBe("引用: [聊天记录] 群聊的聊天记录");
    expect(merged.renderedMd).toContain("[引用]");
    expect(merged.renderedMd).toContain(
      "> 引用 陈可乐（消息ID: msg_8103115687525853092）：",
    );
    expect(merged.renderedMd).toContain("[聊天记录] 群聊的聊天记录");
  });

  it("quote 中媒体仍是 pending 时使用本地已下载媒体快照补全", () => {
    const envelope: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      quote: {
        type: "emoji",
        text: "[动画表情]",
        media: {
          status: "pending",
          url: null
        },
        senderName: "陈可乐",
        sourceMessageId: "msg_8238055644346920962"
      },
      renderedText: "5: [动画表情]",
      content: {
        type: "text",
        text: "5"
      }
    };
    const referencedPayload: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      messageId: "msg_8238055644346920962",
      content: {
        type: "emoji",
        text: "[动画表情]",
        media: {
          status: "ready",
          url: "http://localhost:3000/files/asset_emoji?exp=1783922848&sig=test",
          mimeType: "image/gif",
          size: 1381236,
          width: 300,
          height: 263,
          md5: "fc2e00714e7497246500f1ab9358deea"
        }
      },
      quote: null,
      renderedText: "[动画表情]"
    };

    const merged = mergeQuoteFromReferencedPayload(envelope, referencedPayload);

    expect(merged.quote?.type).toBe("emoji");
    expect(merged.quote?.media).toEqual({
      status: "ready",
      url: "http://localhost:3000/files/asset_emoji?exp=1783922848&sig=test",
      mimeType: "image/gif",
      size: 1381236,
      width: 300,
      height: 263,
      md5: "fc2e00714e7497246500f1ab9358deea"
    });
    expect(merged.quote?.senderName).toBe("陈可乐");
    expect(merged.quote?.sourceMessageId).toBe("msg_8238055644346920962");
    expect(merged.renderedText).toBe("5: [动画表情]");
  });

  it("同会话未命中时允许同账号范围兜底回查媒体消息里的 refermsg", async () => {
    const envelope: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      content: {
        type: "voice",
        text: "[语音]",
        media: {
          status: "pending",
          url: null,
        },
      },
      quote: {
        type: "unsupported",
        text: "引用了一条消息，暂未解析内容",
        sourceMessageId: "msg_5484099934145465483",
      },
      renderedText: "[语音]: 引用了一条消息，暂未解析内容",
    };
    const referencedPayload: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      messageId: "msg_5484099934145465000",
      content: {
        type: "text",
        text: "Cronjob Response: 每日热点推送到微信和Wiki",
      },
      quote: null,
      renderedText: "Cronjob Response: 每日热点推送到微信和Wiki",
    };
    const calls: unknown[] = [];
    const prisma = {
      message: {
        findFirst: async (args: unknown) => {
          calls.push(args);
          return calls.length === 1
            ? null
            : { payload: referencedPayload as never };
        },
      },
    };

    const hydrated = await hydrateQuoteFromLocalMessage(
      prisma,
      envelope,
      "account_1",
      "conversation_voice",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      where: {
        accountId: "account_1",
        conversationId: "conversation_voice",
      },
    });
    expect(calls[1]).toMatchObject({
      where: {
        accountId: "account_1",
      },
    });
    expect(calls[1]).not.toMatchObject({
      where: {
        conversationId: "conversation_voice",
      },
    });
    expect(hydrated.quote?.type).toBe("text");
    expect(hydrated.quote?.text).toBe(
      "Cronjob Response: 每日热点推送到微信和Wiki",
    );
    expect(hydrated.metadata?.reference).toMatchObject({
      crossConversationLookup: true,
    });
    expect(hydrated.renderedText).toBe(
      "[语音]: Cronjob Response: 每日热点推送到微信和Wiki",
    );
    expect(hydrated.renderedMd).toContain("[引用]");
    expect(hydrated.renderedMd).toContain(
      "Cronjob Response: 每日热点推送到微信和Wiki",
    );
  });

  it("chat_record 条目引用本地已下载语音时回填 MP3 媒体", async () => {
    const envelope: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      content: {
        type: "chat_record",
        text: "陈可乐与陳可乐的聊天记录",
        items: [
          {
            type: "voice",
            text: "[语音]",
            media: {
              status: "failed",
              url: null,
              durationMs: 5000,
            },
            sourceMessageId: "msg_5649845438500538903",
          },
        ],
      },
      quote: null,
      renderedText: "[聊天记录] 陈可乐与陳可乐的聊天记录",
    };
    const referencedPayload: MessageEnvelope = {
      ...envelopeWithEmptyQuotedChatRecord(),
      messageId: "msg_5649845438500538903",
      content: {
        type: "voice",
        text: "[语音]",
        media: {
          status: "ready",
          url: "http://localhost:3000/files/asset_voice?exp=1783922854&sig=test",
          mimeType: "audio/mpeg",
          size: 6935,
          durationMs: 5314,
        },
      },
      quote: null,
      renderedText: "[语音]",
    };
    const prisma = {
      message: {
        findFirst: async () => ({ payload: referencedPayload as never }),
      },
    };

    const hydrated = await hydrateMessageReferencesFromLocalMessages(
      prisma,
      envelope,
      "account_1",
      "conversation_1",
    );

    expect(hydrated.content.items?.[0]?.type).toBe("voice");
    expect(hydrated.content.items?.[0]?.media).toEqual({
      status: "ready",
      url: "http://localhost:3000/files/asset_voice?exp=1783922854&sig=test",
      mimeType: "audio/mpeg",
      size: 6935,
      durationMs: 5314,
    });
    expect(hydrated.renderedMd).toContain(
      "[语音 5.3s](http://localhost:3000/files/asset_voice?exp=1783922854&sig=test)",
    );
  });
});
