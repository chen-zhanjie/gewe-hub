import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AdminAuthGuard } from "../src/common/admin-auth.guard.js";
import { OutboxService } from "../src/modules/outbox/outbox.service.js";
import { PrismaService } from "../src/modules/prisma/prisma.service.js";

describe("AppModule", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379/0");
    vi.stubEnv("GEWE_BASE_URL", "https://api.gewe.example");
    vi.stubEnv("GEWE_TOKEN", "replace-with-gewe-token");
    vi.stubEnv("WEBHOOK_SECRET", "replace-with-random-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "replace-with-bcrypt-hash");
    vi.stubEnv("SESSION_SECRET", "replace-with-long-random-secret");
    vi.stubEnv("FILE_STORAGE_DIR", "./storage/files");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  });

  it("完整依赖图可以编译", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: vi.fn(),
        $disconnect: vi.fn()
      })
      .overrideProvider(OutboxService)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it("管理 API 注册全局管理员鉴权守卫", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: vi.fn(),
        $disconnect: vi.fn()
      })
      .overrideProvider(OutboxService)
      .useValue({})
      .compile();

    const providers = Reflect.getMetadata("providers", AppModule) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_GUARD,
          useClass: AdminAuthGuard
        })
      ])
    );
    await moduleRef.close();
  });
});
