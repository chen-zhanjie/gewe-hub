import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messageEnvelopeSchema } from "@gewehub/contracts";
import {
  normalizeGewePayload,
  shouldSkipStandardMessage,
} from "../src/modules/normalizer/normalizer.js";
import { parseWebhookJsonBody } from "../src/modules/gewe/webhook-utils.js";

const fixtureRoot = resolve(
  process.cwd(),
  "../references/gewe-raw-samples/2026-07-05-production",
);

interface SampleFixture {
  relativePath: string;
  payload: Record<string, unknown>;
}

describe("GeWe 178 个生产样本全量标准化", () => {
  it("按 event 顺序重放全部样本，可生成的消息都符合标准消息 schema", () => {
    const samples = readAllSamples();
    const skipped: string[] = [];
    const normalized: Array<{ sample: SampleFixture; type: string }> = [];

    for (const sample of samples) {
      const envelope = normalizeGewePayload(sample.payload);
      if (!envelope) {
        expect(
          shouldSkipStandardMessage(sample.payload),
          `${sample.relativePath} 不应在未声明跳过的情况下返回 null`,
        ).toBe(true);
        skipped.push(sample.relativePath);
        continue;
      }

      expect(
        shouldSkipStandardMessage(sample.payload),
        `${sample.relativePath} 已生成标准消息，不应再被标记为 skipped`,
      ).toBe(false);
      expect(() => messageEnvelopeSchema.parse(envelope)).not.toThrow();
      expect(envelope.renderedText.trim().length, sample.relativePath).toBeGreaterThan(0);
      normalized.push({ sample, type: envelope.content.type });
    }

    expect(samples).toHaveLength(178);
    expect(skipped).toEqual([
      "UNKNOWN/001__event_1__msg_1.json",
      "UNKNOWN/002__event_3__msg_3.json",
      "APP_MSG/001__event_8__msg_3591584383532645877.json",
      "APP_MSG/002__event_13__msg_7785148256962043016.json",
      "APP_MSG/003__event_26__msg_4477287536905918819.json",
      "APP_MSG/004__event_28__msg_3035289689620522492.json",
      "MOD_CONTACTS/001__event_36__msg_36.json",
      "MOD_CONTACTS/002__event_37__msg_37.json",
      "MOD_CONTACTS/003__event_38__msg_38.json",
    ]);
    expect(normalized).toHaveLength(169);
    expect(countByType(normalized.map((item) => item.type))).toMatchObject({
      text: 114,
      image: 8,
      video: 2,
      voice: 11,
      file: 4,
      chat_record: 9,
      link: 1,
      system: 10,
      emoji: 9,
      mini_program: 1,
    });
  });
});

function readAllSamples(): SampleFixture[] {
  const files = walkJsonFiles(fixtureRoot);
  return files
    .map((filePath) => ({
      relativePath: relative(fixtureRoot, filePath),
      payload: parseWebhookJsonBody(readFileSync(filePath, "utf8")),
    }))
    .sort((left, right) => eventNumber(left.relativePath) - eventNumber(right.relativePath));
}

function walkJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function eventNumber(relativePath: string): number {
  const match = relativePath.match(/__event_(\d+)__/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function countByType(types: string[]): Record<string, number> {
  return types.reduce<Record<string, number>>((counts, type) => {
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}
