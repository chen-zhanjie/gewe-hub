import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const normalizerRoot = resolve(process.cwd(), "src/modules/normalizer");

const expectedParserFiles = [
  "text.ts",
  "image.ts",
  "voice.ts",
  "video.ts",
  "file.ts",
  "emoji.ts",
  "link.ts",
  "mini-program.ts",
  "quote.ts",
  "chat-record.ts",
  "location.ts",
  "card.ts",
  "transfer.ts",
  "red-packet.ts",
  "system.ts",
  "fallback.ts",
];

describe("normalizer parser 架构", () => {
  it("按消息类型拆分 parser 策略文件", () => {
    for (const fileName of expectedParserFiles) {
      expect(existsSync(resolve(normalizerRoot, "parsers", fileName)), fileName).toBe(true);
    }
  });

  it("normalizer 主入口不再使用 msgType switch 上帝分发", () => {
    const source = readFileSync(resolve(normalizerRoot, "normalizer.ts"), "utf8");

    expect(source).not.toMatch(/switch\s*\(\s*msgType\s*\)/);
    expect(source).toContain("getMessageParser");
  });
});
