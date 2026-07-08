import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookAuditLogger } from "../src/modules/gewe/webhook-audit-logger.service.js";

const env = {
  DATABASE_URL: "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  GEWE_BASE_URL: "http://api.geweapi.com",
  GEWE_TOKEN: "test-gewe-token",
  WEBHOOK_SECRET: "replace-with-random-secret",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "replace-with-bcrypt-hash",
  SESSION_SECRET: "replace-with-long-random-secret",
  PUBLIC_BASE_URL: "http://localhost:3000",
};

describe("WebhookAuditLogger", () => {
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), "gewehub-webhook-audit-"));
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("FILE_STORAGE_DIR", join(storageRoot, "files"));
  });

  afterEach(() => {
    rmSync(storageRoot, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("把完整 GeWe 回调写入按日期分片的 JSONL 文件", async () => {
    const payload = {
      Appid: "wx_app",
      Data: {
        Wxid: "wxid_bot",
        MsgType: 49,
        MsgId: "711714277",
        NewMsgId: "7117142775293583860",
        Content: {
          string: "<msg><appmsg><title>20260626225550.pdf</title></appmsg></msg>",
        },
      },
    };
    const logger = new WebhookAuditLogger();

    await logger.logReceived(payload);

    const logFiles = readdirSync(join(storageRoot, "logs"));
    expect(logFiles).toHaveLength(1);
    expect(logFiles[0]).toMatch(/^webhook-raw-\d{8}\.log$/);
    const lines = readFileSync(join(storageRoot, "logs", logFiles[0]!), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      eventKind: "message",
      appId: "wx_app",
      wxid: "wxid_bot",
      msgType: "APP_MSG",
      msgId: "711714277",
      newMsgId: "7117142775293583860",
      payload,
    });
  });
});
