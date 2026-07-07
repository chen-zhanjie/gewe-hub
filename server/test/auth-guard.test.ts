import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuthGuard } from "../src/common/admin-auth.guard.js";
import { signSession } from "../src/modules/auth/session.js";

const sessionSecret = "test-session-secret-at-least-16";

describe("AdminAuthGuard", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379/0");
    vi.stubEnv("GEWE_BASE_URL", "http://api.geweapi.com");
    vi.stubEnv("GEWE_TOKEN", "replace-with-gewe-token");
    vi.stubEnv("WEBHOOK_SECRET", "replace-with-random-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "replace-with-bcrypt-hash");
    vi.stubEnv("SESSION_SECRET", sessionSecret);
    vi.stubEnv("FILE_STORAGE_DIR", "./storage/files");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  });

  it("未登录访问管理 API 时拒绝", () => {
    const guard = new AdminAuthGuard();

    expect(() => guard.canActivate(contextFor("GET", "/api/accounts"))).toThrow(UnauthorizedException);
  });

  it("有效管理员会话可以访问管理 API", () => {
    const guard = new AdminAuthGuard();
    const token = signSession({ username: "admin", exp: Date.now() + 60_000 }, sessionSecret);

    expect(guard.canActivate(contextFor("GET", "/api/accounts", token))).toBe(true);
  });

  it("公开入口不需要管理员会话", () => {
    const guard = new AdminAuthGuard();

    expect(guard.canActivate(contextFor("GET", "/api/health"))).toBe(true);
    expect(guard.canActivate(contextFor("POST", "/api/auth/login"))).toBe(true);
    expect(guard.canActivate(contextFor("POST", "/webhook/gewe/secret"))).toBe(true);
  });

  it("SSE 应用 token 接口不走管理员会话", () => {
    const guard = new AdminAuthGuard();

    expect(guard.canActivate(contextFor("GET", "/api/apps/events"))).toBe(true);
    expect(guard.canActivate(contextFor("POST", "/api/apps/events/ack"))).toBe(true);
  });

  it("发送接口带应用 token 时不走管理员会话", () => {
    const guard = new AdminAuthGuard();

    expect(guard.canActivate(contextFor("POST", "/api/send", undefined, "Bearer app-token"))).toBe(true);
  });

  it("发送接口无应用 token 时必须有管理员会话", () => {
    const guard = new AdminAuthGuard();
    const token = signSession({ username: "admin", exp: Date.now() + 60_000 }, sessionSecret);

    expect(() => guard.canActivate(contextFor("POST", "/api/send"))).toThrow(UnauthorizedException);
    expect(guard.canActivate(contextFor("POST", "/api/send", token))).toBe(true);
  });
});

function contextFor(method: string, url: string, sessionToken?: string, authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url,
        headers: authorization ? { authorization } : {},
        cookies: sessionToken ? { gewehub_session: sessionToken } : {}
      })
    })
  } as never;
}
