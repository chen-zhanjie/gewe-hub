import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const baseEnv = {
  DATABASE_URL: "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  GEWE_BASE_URL: "https://api.gewe.example",
  GEWE_TOKEN: "replace-with-gewe-token",
  WEBHOOK_SECRET: "replace-with-random-secret",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "replace-with-bcrypt-hash",
  SESSION_SECRET: "replace-with-long-random-secret",
  FILE_STORAGE_DIR: "./storage/files",
  PUBLIC_BASE_URL: "http://localhost:3000",
};

describe("env 配置", () => {
  it("默认允许较大的 JSON 请求体，支持 base64 语音上传", () => {
    expect(loadEnv(baseEnv).JSON_BODY_LIMIT_BYTES).toBe(16 * 1024 * 1024);
  });

  it("GeWe 普通请求和发送请求使用不同默认超时", () => {
    expect(loadEnv(baseEnv).GEWE_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(loadEnv(baseEnv).GEWE_SEND_TIMEOUT_MS).toBe(120_000);
  });

  it("允许通过环境变量调整 JSON 请求体上限", () => {
    expect(loadEnv({ ...baseEnv, JSON_BODY_LIMIT_BYTES: "33554432" }).JSON_BODY_LIMIT_BYTES).toBe(32 * 1024 * 1024);
  });
});
