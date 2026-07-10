import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  it("groups 表包含平台备注字段，支撑群聊备注展示和搜索", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const groupModel = schema.match(/model Group \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(groupModel).toMatch(/platformRemark\s+String\?\s+@map\("platform_remark"\)/);
  });

  it("conversations 表包含置顶、隐藏、打开时间和未读数字段", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const conversationModel = schema.match(/model Conversation \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(conversationModel).toMatch(/pinnedAt\s+DateTime\?\s+@map\("pinned_at"\)/);
    expect(conversationModel).toMatch(/isHidden\s+Boolean\s+@default\(false\)\s+@map\("is_hidden"\)/);
    expect(conversationModel).toMatch(/lastOpenedAt\s+DateTime\?\s+@map\("last_opened_at"\)/);
    expect(conversationModel).toMatch(/unreadCount\s+Int\s+@default\(0\)\s+@map\("unread_count"\)/);
  });

  it("头像 URL 字段使用 Text，避免 GeWe 长签名头像地址同步失败", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

    for (const modelName of ["WechatAccount", "Contact", "Group", "GroupMember", "Conversation"]) {
      const model = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
      expect(model).toMatch(/avatarUrl\s+String\?\s+@db\.Text\s+@map\("avatar_url"\)/);
    }
  });

  it("send_requests 表包含列表排序索引，避免宽表按创建时间排序触发 MySQL filesort", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const sendRequestModel = schema.match(/model SendRequest \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(sendRequestModel).toMatch(/@@index\(\[createdAt, id\](?:,\s*map:\s*"send_requests_created_at_id_idx")?\)/);
    expect(sendRequestModel).toMatch(/@@index\(\[status, createdAt, id\](?:,\s*map:\s*"send_requests_status_created_at_id_idx")?\)/);
  });

  it("send_requests 保存三态发送策略，执行状态与策略分离", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const modeEnum = schema.match(/enum SendDeliveryMode \{[\s\S]*?\n\}/)?.[0] ?? "";
    const sendRequestModel = schema.match(/model SendRequest \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(modeEnum).toMatch(/\n\s+immediate\n/);
    expect(modeEnum).toMatch(/\n\s+discard\n/);
    expect(modeEnum).toMatch(/\n\s+confirm\n/);
    expect(sendRequestModel).toMatch(/deliveryMode\s+SendDeliveryMode\s+@default\(immediate\)\s+@map\("delivery_mode"\)/);
  });

  it("支持 held 发送状态和消息是否实际发送标识", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const sendStatusEnum = schema.match(/enum SendStatus \{[\s\S]*?\n\}/)?.[0] ?? "";
    const messageModel = schema.match(/model Message \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(sendStatusEnum).toMatch(/\n\s+held\n/);
    expect(messageModel).toMatch(/isSent\s+Boolean\s+@default\(true\)\s+@map\("is_sent"\)/);
  });

  it("Message 统一保存稳定 ID 与平台映射，SendRequest 只保存执行策略", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const executionModeEnum = schema.match(/enum SendExecutionMode \{[\s\S]*?\n\}/)?.[0] ?? "";
    const messageModel = schema.match(/model Message \{[\s\S]*?\n\}/)?.[0] ?? "";
    const sendRequestModel = schema.match(/model SendRequest \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(executionModeEnum).toMatch(/\n\s+sync\n/);
    expect(executionModeEnum).toMatch(/\n\s+async\n/);
    expect(messageModel).toMatch(/platformMsgId\s+String\?\s+@map\("platform_msg_id"\)/);
    expect(messageModel).toMatch(/platformNewMsgId\s+String\?\s+@map\("platform_new_msg_id"\)/);
    expect(messageModel).toMatch(/platformCreateTime\s+String\?\s+@map\("platform_create_time"\)/);
    expect(messageModel).not.toContain("rawMessageId");
    expect(sendRequestModel).toMatch(/executionMode\s+SendExecutionMode\s+@default\(sync\)\s+@map\("execution_mode"\)/);
    expect(sendRequestModel).not.toContain("resultMsgId");
    expect(sendRequestModel).not.toContain("resultNewMsgId");
    expect(sendRequestModel).not.toContain("resultCreateTime");
  });

  it("HTML 页面模型支持托管页面、发送记录关联和公开访问状态", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const standardTypeEnum = schema.match(/enum StandardMessageType \{[\s\S]*?\n\}/)?.[0] ?? "";
    const htmlPageModel = schema.match(/model HtmlPage \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(standardTypeEnum).toMatch(/\n\s+html\n/);
    expect(schema).toContain("enum HtmlPageStatus");
    expect(htmlPageModel).toMatch(/token\s+String\s+@unique/);
    expect(htmlPageModel).toMatch(/sendRequestId\s+String\?\s+@unique\s+@map\("send_request_id"\)/);
    expect(htmlPageModel).toMatch(/storageKey\s+String\s+@db\.VarChar\(1024\)\s+@map\("storage_key"\)/);
    expect(htmlPageModel).toMatch(/publicUrl\s+String\s+@db\.Text\s+@map\("public_url"\)/);
    expect(htmlPageModel).toMatch(/sizeBytes\s+Int\s+@map\("size_bytes"\)/);
    expect(htmlPageModel).toMatch(/sha256\s+String/);
    expect(htmlPageModel).toMatch(/@@map\("html_pages"\)/);
  });
});
