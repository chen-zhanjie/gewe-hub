import { UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/modules/auth/auth.controller.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { signSession } from "../src/modules/auth/session.js";

const sessionSecret = "test-session-secret-at-least-16";

describe("auth controller", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379/0");
    vi.stubEnv("GEWE_BASE_URL", "https://api.gewe.example");
    vi.stubEnv("GEWE_TOKEN", "replace-with-gewe-token");
    vi.stubEnv("WEBHOOK_SECRET", "replace-with-random-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "replace-with-bcrypt-hash");
    vi.stubEnv("SESSION_SECRET", sessionSecret);
    vi.stubEnv("FILE_STORAGE_DIR", "./storage/files");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  });

  it("已登录会话可以读取当前管理员", async () => {
    const controller = new AuthController(new AuthService());
    const token = signSession({ username: "admin", exp: Date.now() + 60_000 }, sessionSecret);

    const result = await controller.me(({
      cookies: {
        gewehub_session: token
      }
    } as unknown) as FastifyRequest);

    expect(result).toEqual({
      user: {
        username: "admin",
        role: "admin"
      }
    });
  });

  it("缺失会话时拒绝访问当前管理员", async () => {
    const controller = new AuthController(new AuthService());

    await expect(controller.me(({ cookies: {} } as unknown) as FastifyRequest)).rejects.toThrow(
      UnauthorizedException
    );
  });
});
