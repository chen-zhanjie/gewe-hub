import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("scripts/sse-smoke-test.sh", () => {
  it("dry-run 造数时为本次运行生成唯一会话，避免历史未 ACK 事件阻塞脚本复跑", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gewehub-sse-smoke-"));
    try {
      const samplePath = join(directory, "sample.json");
      await writeFile(
        samplePath,
        JSON.stringify({
          appid: "wx_app",
          content: "原始文本",
          createTime: 1,
          eventCode: "private_msg_event",
          fromUser: "wxid_existing_sender",
          isSelf: false,
          msgId: "msg_existing",
          msgType: "TEXT",
          newMsgId: "new_existing",
          pushContent: "陈可乐 : 原始文本",
          toUser: "wxid_bot",
          wxid: "wxid_bot",
        }),
      );

      const { stdout } = await execFileAsync("bash", ["scripts/sse-smoke-test.sh"], {
        cwd: process.cwd().replace(/\/server$/, ""),
        env: {
          ...process.env,
          SAMPLE: samplePath,
          SSE_SMOKE_DRY_RUN: "1",
          SSE_SMOKE_DRY_RUN_DIR: join(directory, "dry-run"),
          SSE_SMOKE_RUN_ID: "test_run",
        },
      });

      const output = JSON.parse(stdout) as {
        seed: { messageId: string; payloadPath: string };
        first: { messageId: string; payloadPath: string };
        second: { messageId: string; payloadPath: string };
      };
      const seed = JSON.parse(await readFile(output.seed.payloadPath, "utf8")) as Record<string, string>;
      const first = JSON.parse(await readFile(output.first.payloadPath, "utf8")) as Record<string, string>;
      const second = JSON.parse(await readFile(output.second.payloadPath, "utf8")) as Record<string, string>;

      expect(seed.fromUser).toBe("wxid_smoke_test_run");
      expect(first.fromUser).toBe("wxid_smoke_test_run");
      expect(second.fromUser).toBe("wxid_smoke_test_run");
      expect(new Set([seed.newMsgId, first.newMsgId, second.newMsgId]).size).toBe(3);
      expect(output.first.messageId).toBe(`msg_${first.newMsgId}`);
      expect(first.pushContent).toContain("SSE smoke first");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
