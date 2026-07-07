import { describe, expect, it } from "vitest";
import {
  appConversationsQuerySchema,
  appConversationsResponseSchema,
  appUpdateRequestSchema,
  contactProfileResponseSchema,
  conversationReadResponseSchema,
  conversationSummarySchema,
  conversationUpdateRequestSchema,
  conversationUpdateResponseSchema,
  deliveryListQuerySchema,
} from "../src/index";

describe("API 契约", () => {
  it("会话摘要包含置顶、隐藏、最后打开和未读字段", () => {
    const parsed = conversationSummarySchema.parse({
      id: "conv_1",
      accountId: "acc_1",
      peerWxid: "wxid_customer",
      type: "private",
      name: "陈可乐",
      avatarUrl: null,
      platformRemark: "重点客户",
      appId: "app_1",
      deliveryFilter: "all",
      debounceMs: null,
      maxWaitMs: null,
      lastMessageAt: "2026-07-07T08:00:00.000Z",
      lastMessageText: "你好",
      messageCount: 12,
      status: "active",
      pinnedAt: "2026-07-07T08:10:00.000Z",
      isHidden: false,
      lastOpenedAt: "2026-07-07T08:12:00.000Z",
      unreadCount: 3,
    });

    expect(parsed.unreadCount).toBe(3);
    expect(parsed.pinnedAt).toBeTruthy();
  });

  it("联系人 profile 响应聚合基础联系人、群内身份、私聊会话和共同群", () => {
    const parsed = contactProfileResponseSchema.parse({
      accountId: "acc_1",
      wxid: "wxid_customer",
      contact: {
        id: "contact_1",
        wxid: "wxid_customer",
        nickname: "陈可乐",
        platformRemark: "重点客户",
        status: "active",
      },
      groupMemberships: [
        {
          id: "member_1",
          wxid: "wxid_customer",
          displayName: "陈总",
          platformRemark: "群内负责人",
          status: "active",
          group: {
            id: "group_1",
            wxid: "48315023241@chatroom",
            name: "客户群",
          },
        },
      ],
      privateConversation: null,
      commonGroups: [
        {
          id: "group_1",
          wxid: "48315023241@chatroom",
          name: "客户群",
        },
      ],
    });

    expect(parsed.commonGroups).toHaveLength(1);
  });

  it("应用更新请求支持应用级账号备注批量提交", () => {
    const parsed = appUpdateRequestSchema.parse({
      name: "Hermes 生产应用",
      status: "active",
      accountRemarks: [
        { accountId: "acc_1", remark: "客服主账号", tags: ["prod"] },
        { accountId: "acc_2", remark: null },
      ],
    });

    expect(parsed.accountRemarks?.[0]?.tags).toEqual(["prod"]);
  });

  it("会话状态接口契约支持置顶、隐藏和已读响应", () => {
    expect(conversationUpdateRequestSchema.parse({ pinned: true, hidden: false })).toEqual({
      pinned: true,
      hidden: false,
    });

    const response = {
      id: "conv_1",
      accountId: "acc_1",
      peerWxid: "wxid_customer",
      type: "private",
      deliveryFilter: "all",
      messageCount: 2,
      status: "active",
      isHidden: false,
      unreadCount: 0,
      lastOpenedAt: "2026-07-07T08:12:00.000Z",
    };

    expect(conversationUpdateResponseSchema.parse(response).id).toBe("conv_1");
    expect(conversationReadResponseSchema.parse(response).unreadCount).toBe(0);
  });

  it("应用绑定会话列表契约支持分页查询和分页响应", () => {
    expect(appConversationsQuerySchema.parse({ take: 20, skip: 40 })).toEqual({
      take: 20,
      skip: 40,
    });

    const parsed = appConversationsResponseSchema.parse({
      items: [
        {
          id: "conv_1",
          accountId: "acc_1",
          peerWxid: "wxid_customer",
          type: "private",
          deliveryFilter: "all",
          messageCount: 1,
          status: "active",
          isHidden: false,
          unreadCount: 0,
        },
      ],
      total: 1,
      take: 20,
      skip: 0,
      nextSkip: 1,
      hasMore: false,
    });

    expect(parsed.items[0]?.isHidden).toBe(false);
  });

  it("推送日志查询契约支持 conversationId 与 messageId 预筛", () => {
    const parsed = deliveryListQuerySchema.parse({
      status: "failed",
      appId: "app_1",
      conversationId: "conv_1",
      messageId: "msg_1",
      take: 50,
      skip: 20,
    });

    expect(parsed.messageId).toBe("msg_1");
  });
});
