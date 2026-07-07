import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const rootDir = resolve(process.cwd(), "..");
const scriptPath = resolve(rootDir, "scripts/generate-admin-hash.ts");

describe("generate-admin-hash script", () => {
  it("根目录脚本生成可用于 ADMIN_PASSWORD_HASH 的 bcrypt hash", async () => {
    expect(existsSync(scriptPath)).toBe(true);

    const password = "gewehub-admin-test-password";
    const hash = execFileSync("pnpm", ["--filter", "@gewehub/server", "exec", "tsx", "../scripts/generate-admin-hash.ts", password], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    }).trim();

    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare(password, hash)).resolves.toBe(true);
  });
});
