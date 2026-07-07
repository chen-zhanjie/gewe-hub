import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const maxTsxLines = 800;

describe("文件规模架构", () => {
  it("所有 tsx 文件不超过 800 行", () => {
    const srcRoot = resolve(__dirname);
    const oversized = collectTsxFiles(srcRoot)
      .map((filePath) => ({
        filePath,
        lineCount: readFileSync(filePath, "utf8").split("\n").length,
      }))
      .filter((item) => item.lineCount > maxTsxLines)
      .map((item) => `${relative(srcRoot, item.filePath)}:${item.lineCount}`);

    expect(oversized).toEqual([]);
  });
});

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) return collectTsxFiles(filePath);
    return filePath.endsWith(".tsx") ? [filePath] : [];
  });
}
