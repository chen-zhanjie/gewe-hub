import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("scripts/smoke-test.sh", () => {
  it("dry-run 时基于样本生成本次运行唯一消息，避免历史 dedupe 污染", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gewehub-smoke-"));
    try {
      const samplePath = join(directory, "sample.json");
      await writeFile(
        samplePath,
        JSON.stringify({
          appid: "wx_app",
          content: "原始文本",
          createTime: 1,
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

      const { stdout } = await execFileAsync("bash", ["scripts/smoke-test.sh"], {
        cwd: process.cwd().replace(/\/server$/, ""),
        env: {
          ...process.env,
          SAMPLE: samplePath,
          SMOKE_TEST_DRY_RUN: "1",
          SMOKE_TEST_DRY_RUN_DIR: join(directory, "dry-run"),
          SMOKE_TEST_RUN_ID: "flat_run",
        },
      });

      const output = JSON.parse(stdout) as { messageId: string; payloadPath: string };
      const payload = JSON.parse(await readFile(output.payloadPath, "utf8")) as Record<string, string>;

      expect(payload.fromUser).toBe("wxid_smoke_flat_run");
      expect(payload.content).toContain("GeWeHub smoke flat_run");
      expect(payload.newMsgId).toContain("flat_run");
      expect(output.messageId).toBe(`msg_${payload.newMsgId}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("dry-run 能处理原始 GeWe Data.NewMsgId 结构并返回标准 messageId", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gewehub-smoke-raw-"));
    try {
      const samplePath = join(directory, "raw-sample.json");
      await writeFile(
        samplePath,
        JSON.stringify({
          Appid: "wx_app",
          Wxid: "wxid_bot",
          Data: {
            MsgId: 100,
            MsgType: 1,
            NewMsgId: "5004026754542010999",
            CreateTime: 1783308565,
            FromUserName: { string: "wxid_sender" },
            ToUserName: { string: "wxid_bot" },
            PushContent: "陈可乐 : hello",
            Content: { string: "hello" },
          },
        }),
      );

      const { stdout } = await execFileAsync("bash", ["scripts/smoke-test.sh"], {
        cwd: process.cwd().replace(/\/server$/, ""),
        env: {
          ...process.env,
          SAMPLE: samplePath,
          SMOKE_TEST_DRY_RUN: "1",
          SMOKE_TEST_DRY_RUN_DIR: join(directory, "dry-run"),
          SMOKE_TEST_RUN_ID: "raw_run",
        },
      });

      const output = JSON.parse(stdout) as { messageId: string; payloadPath: string };
      const payload = JSON.parse(await readFile(output.payloadPath, "utf8")) as {
        Data: {
          Content: { string: string };
          FromUserName: { string: string };
          NewMsgId: string;
          PushContent: string;
        };
      };

      expect(payload.Data.FromUserName.string).toBe("wxid_smoke_raw_run");
      expect(payload.Data.Content.string).toContain("GeWeHub smoke raw_run");
      expect(payload.Data.NewMsgId).toContain("raw_run");
      expect(output.messageId).toBe(`msg_${payload.Data.NewMsgId}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
