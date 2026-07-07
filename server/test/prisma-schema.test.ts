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
});
