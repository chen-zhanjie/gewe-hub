import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlPagesService } from "../src/modules/html-pages/html-pages.service.js";

const baseEnv = {
  DATABASE_URL: "mysql://gewehub:gewehub@127.0.0.1:3306/gewehub",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  GEWE_BASE_URL: "http://api.geweapi.com",
  GEWE_TOKEN: "test-gewe-token",
  WEBHOOK_SECRET: "replace-with-random-secret",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "replace-with-bcrypt-hash",
  SESSION_SECRET: "replace-with-long-random-secret",
  PUBLIC_BASE_URL: "https://gewehub.yunzxu.com",
};

describe("HtmlPagesService", () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "gewehub-html-"));
    for (const [key, value] of Object.entries(baseEnv)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("FILE_STORAGE_DIR", storageDir);
    vi.stubEnv("HTML_PAGE_MAX_BYTES", "5242880");
  });

  afterEach(async () => {
    await rm(storageDir, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("把 htmlContent 保存到挂载目录并创建 HtmlPage 记录", async () => {
    const prisma = {
      htmlPage: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: "html_1",
          ...args.data,
        })),
      },
    };
    const service = new HtmlPagesService(prisma as never);

    const result = await service.resolveForSend({
      accountId: "account_1",
      conversationId: "conversation_1",
      appId: "app_1",
      sendRequestId: "send_1",
      title: "日报",
      desc: "今日日报",
      htmlContent: "<!doctype html><html><body>报告</body></html>",
      htmlFileName: "../unsafe/report.html",
    });

    expect(result).toEqual({
      htmlPublicUrl: expect.stringMatching(/^https:\/\/gewehub\.yunzxu\.com\/h\/[A-Za-z0-9_-]+$/),
      htmlPageId: "html_1",
      htmlHosted: true,
    });
    expect(prisma.htmlPage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "account_1",
        conversationId: "conversation_1",
        appId: "app_1",
        sendRequestId: "send_1",
        title: "日报",
        desc: "今日日报",
        fileName: "report.html",
        storageKey: expect.stringMatching(/^html\/\d{8}\/[A-Za-z0-9_-]+\.html$/),
        publicUrl: result.htmlPublicUrl,
        size: Buffer.byteLength("<!doctype html><html><body>报告</body></html>"),
        status: "active",
      }),
    });

    const createArg = vi.mocked(prisma.htmlPage.create).mock.calls[0]![0];
    const storageKey = String(createArg.data.storageKey);
    const saved = await readFile(join(storageDir, storageKey), "utf8");
    const info = await stat(join(storageDir, storageKey));
    expect(saved).toBe("<!doctype html><html><body>报告</body></html>");
    expect(info.isFile()).toBe(true);
  });

  it("支持 htmlContentBase64 输入并拒绝超过 5MB 的 HTML", async () => {
    const prisma = {
      htmlPage: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "html_base64", ...args.data })),
      },
    };
    const service = new HtmlPagesService(prisma as never);

    const result = await service.resolveForSend({
      accountId: "account_1",
      conversationId: "conversation_1",
      title: "base64",
      htmlContentBase64: Buffer.from("<html>base64</html>").toString("base64"),
    });

    expect(result.htmlHosted).toBe(true);
    expect(prisma.htmlPage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        size: Buffer.byteLength("<html>base64</html>"),
      }),
    });

    await expect(
      service.resolveForSend({
        accountId: "account_1",
        conversationId: "conversation_1",
        title: "too large",
        htmlContent: "x".repeat(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("linkUrl 模式不落盘也不创建 HtmlPage", async () => {
    const prisma = {
      htmlPage: {
        create: vi.fn(),
      },
    };
    const service = new HtmlPagesService(prisma as never);

    const result = await service.resolveForSend({
      accountId: "account_1",
      conversationId: "conversation_1",
      title: "外部页面",
      linkUrl: "https://example.com/report.html",
    });

    expect(result).toEqual({
      htmlPublicUrl: "https://example.com/report.html",
      htmlPageId: null,
      htmlHosted: false,
    });
    expect(prisma.htmlPage.create).not.toHaveBeenCalled();
  });
});
