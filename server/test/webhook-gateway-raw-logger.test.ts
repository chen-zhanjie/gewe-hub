import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendWebhookGatewayRawLog,
  isWebhookGatewayRequest,
} from "../src/modules/gewe/webhook-gateway-raw-logger.js";

describe("webhook gateway raw logger", () => {
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), "gewehub-webhook-gateway-raw-"));
  });

  afterEach(() => {
    rmSync(storageRoot, { force: true, recursive: true });
  });

  it("只识别 GeWe webhook 入口请求", () => {
    expect(isWebhookGatewayRequest("/webhook/gewe/secret")).toBe(true);
    expect(isWebhookGatewayRequest("/webhook/gewe/secret?retry=1")).toBe(true);
    expect(isWebhookGatewayRequest("/api/gewe/status")).toBe(false);
  });

  it("在 JSON 解析前只把原始 webhook 摘要写入日志并脱敏", async () => {
    const rawBody = "{\"Data\":{\"Content\":{\"string\":\"unterminated";

    await appendWebhookGatewayRawLog({
      fileStorageDir: join(storageRoot, "files"),
      method: "POST",
      url: "/webhook/gewe/super-secret?retry=1",
      headers: {
        "content-type": "application/json",
        "content-length": String(rawBody.length),
        authorization: "Bearer app-secret",
      },
      rawBodySample: rawBody,
      rawBodyBytes: Buffer.byteLength(rawBody),
      truncated: false,
      remoteAddress: "127.0.0.1",
      receivedAt: new Date("2026-07-08T10:20:30.000Z"),
    });

    const logFiles = readdirSync(join(storageRoot, "logs"));
    expect(logFiles).toEqual(["webhook-gateway-raw-20260708.log"]);
    const line = readFileSync(join(storageRoot, "logs", logFiles[0]!), "utf8").trim();
    const entry = JSON.parse(line);
    expect(entry).toMatchObject({
      receivedAt: "2026-07-08T10:20:30.000Z",
      stage: "gateway_raw",
      method: "POST",
      url: "/webhook/gewe/[redacted]?retry=1",
      remoteAddress: "127.0.0.1",
      headers: {
        "content-type": "application/json",
        "content-length": String(rawBody.length),
        authorization: "[redacted]",
      },
      rawBodySample: rawBody,
      rawBodyBytes: Buffer.byteLength(rawBody),
      truncated: false,
    });
    expect(entry.rawBodySampleSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
