import Fastify from "fastify";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerJsonContentParser } from "../src/http/json-content-parser.js";
import { registerWebhookGatewayRawLoggingHook } from "../src/http/webhook-gateway-raw-logging-hook.js";

describe("JSON content parser", () => {
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), "gewehub-json-parser-"));
  });

  afterEach(() => {
    rmSync(storageRoot, { force: true, recursive: true });
  });

  it("默认不写 gateway raw 诊断日志，避免公开 webhook 在鉴权前落盘完整请求", async () => {
    const app = Fastify({ bodyLimit: 1024 * 1024 });
    registerWebhookGatewayRawLoggingHook(app, {
      FILE_STORAGE_DIR: join(storageRoot, "files"),
      JSON_BODY_LIMIT_BYTES: 1024 * 1024,
    });
    registerJsonContentParser(app, {
      JSON_BODY_LIMIT_BYTES: 1024 * 1024,
    });
    app.post("/webhook/gewe/:secret", async () => ({ ok: true }));

    const rawBody = "{\"Data\":{\"Content\":{\"string\":\"unterminated";
    const response = await app.inject({
      method: "POST",
      url: "/webhook/gewe/secret",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    expect(() => readdirSync(join(storageRoot, "logs"))).toThrow();
  });

  it("开启 gateway raw 诊断日志后只写摘要并保留 JSON 解析行为", async () => {
    const app = Fastify({ bodyLimit: 1024 * 1024 });
    registerWebhookGatewayRawLoggingHook(app, {
      FILE_STORAGE_DIR: join(storageRoot, "files"),
      JSON_BODY_LIMIT_BYTES: 1024 * 1024,
      WEBHOOK_GATEWAY_RAW_LOG_ENABLED: true,
      WEBHOOK_GATEWAY_RAW_LOG_SAMPLE_BYTES: 64,
    });
    registerJsonContentParser(app, {
      JSON_BODY_LIMIT_BYTES: 1024 * 1024,
    });
    app.post("/webhook/gewe/:secret", async () => ({ ok: true }));

    const rawBody = "{\"Data\":{\"Content\":{\"string\":\"unterminated";
    const response = await app.inject({
      method: "POST",
      url: "/webhook/gewe/secret",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    const logFiles = readdirSync(join(storageRoot, "logs"));
    expect(logFiles).toHaveLength(1);
    const line = readFileSync(join(storageRoot, "logs", logFiles[0]!), "utf8").trim();
    expect(JSON.parse(line)).toMatchObject({
      stage: "gateway_raw",
      method: "POST",
      url: "/webhook/gewe/[redacted]",
      rawBodySample: rawBody,
      rawBodyBytes: Buffer.byteLength(rawBody),
      truncated: false,
    });
  });

  it("开启 gateway raw 诊断日志时不会读取超过 JSON bodyLimit 的完整请求体", async () => {
    const app = Fastify({ bodyLimit: 16 });
    registerWebhookGatewayRawLoggingHook(app, {
      FILE_STORAGE_DIR: join(storageRoot, "files"),
      JSON_BODY_LIMIT_BYTES: 16,
      WEBHOOK_GATEWAY_RAW_LOG_ENABLED: true,
      WEBHOOK_GATEWAY_RAW_LOG_SAMPLE_BYTES: 8,
    });
    registerJsonContentParser(app, {
      JSON_BODY_LIMIT_BYTES: 16,
    });
    app.post("/webhook/gewe/:secret", async () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/webhook/gewe/secret",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ oversized: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }),
    });

    expect(response.statusCode).toBe(413);
    const logFiles = readdirSync(join(storageRoot, "logs"));
    const line = readFileSync(join(storageRoot, "logs", logFiles[0]!), "utf8").trim();
    expect(JSON.parse(line)).toMatchObject({
      stage: "gateway_raw",
      url: "/webhook/gewe/[redacted]",
      rawBodySample: "{\"oversi",
      rawBodyBytes: 17,
      truncated: true,
    });
  });
});
