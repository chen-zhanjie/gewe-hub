import { describe, expect, it } from "vitest";
import {
  applyMentionTextChange,
  createMentionDraft,
  getActiveMentionQuery,
  getEffectiveMentionWxids,
  insertMention,
} from "./mention-draft";

describe("mention 草稿", () => {
  it("识别光标前的裸 @ 查询", () => {
    expect(getActiveMentionQuery(createMentionDraft("请 @负", 4))).toEqual({ start: 2, query: "负" });
    expect(getActiveMentionQuery(createMentionDraft("请 @负 名", "请 @负 名".length))).toBeNull();
    expect(getActiveMentionQuery(createMentionDraft("请 @负", 2))).toBeNull();
  });

  it("选择成员会替换当前 @ 查询并自动插入空格", () => {
    const next = insertMention(createMentionDraft("请 @负", 4), { wxid: "wxid_kele", label: "负责人" }, 4);

    expect(next.text).toBe("请 @负责人 ");
    expect(next.selectionStart).toBe("请 @负责人 ".length);
    expect(getEffectiveMentionWxids(next)).toEqual(["wxid_kele"]);
  });

  it("删除自动空格只移除实际 mention，保留 @名称 文本", () => {
    const selected = insertMention(createMentionDraft("@", 1), { wxid: "wxid_kele", label: "负责人" }, 1);
    const changed = applyMentionTextChange(selected, "@负责人", "@负责人".length);

    expect(changed.text).toBe("@负责人");
    expect(getEffectiveMentionWxids(changed)).toEqual([]);
  });

  it("编辑 @名称 内部文字会移除陈旧 mention 元数据", () => {
    const selected = insertMention(createMentionDraft("@", 1), { wxid: "wxid_kele", label: "负责人" }, 1);
    const changed = applyMentionTextChange(selected, "@负责X人 ", "@负责X人 ".length);

    expect(changed.text).toBe("@负责X人 ");
    expect(getEffectiveMentionWxids(changed)).toEqual([]);
  });

  it("在 token 外编辑会重定位 token，仍保留真实 mention", () => {
    const selected = insertMention(createMentionDraft("@", 1), { wxid: "wxid_kele", label: "负责人" }, 1);
    const changed = applyMentionTextChange(selected, "请 " + selected.text, 2);

    expect(changed.text).toBe("请 @负责人 ");
    expect(getEffectiveMentionWxids(changed)).toEqual(["wxid_kele"]);
  });
});
