import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlPagesController } from "../src/modules/html-pages/html-pages.controller.js";

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

describe("HtmlPagesController", () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = join(tmpdir(), `gewehub-html-controller-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(storageDir, "html", "20260708"), { recursive: true });
    await writeFile(join(storageDir, "html", "20260708", "token_1.html"), "<!doctype html><html>ok</html>", "utf8");
    for (const [key, value] of Object.entries(baseEnv)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv("FILE_STORAGE_DIR", storageDir);
  });

  afterEach(async () => {
    await rm(storageDir, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("GET /h/:token 返回 text/html 页面流", async () => {
    const prisma = {
      htmlPage: {
        findUnique: vi.fn(async () => ({
          token: "token_1",
          status: "active",
          storageKey: "html/20260708/token_1.html",
          size: 28,
        })),
      },
    };
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const controller = new HtmlPagesController(prisma as never);

    await controller.getPage("token_1", reply as never);

    expect(reply.header).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "public, max-age=300");
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ readable: true }));
  });

  it("非 active、缺失记录或越界 storageKey 返回 404", async () => {
    const archived = new HtmlPagesController({
      htmlPage: {
        findUnique: vi.fn(async () => ({
          token: "token_archived",
          status: "archived",
          storageKey: "html/20260708/token_archived.html",
        })),
      },
    } as never);

    await expect(archived.getPage("token_archived", replyStub() as never)).rejects.toBeInstanceOf(NotFoundException);

    const missing = new HtmlPagesController({
      htmlPage: { findUnique: vi.fn(async () => null) },
    } as never);
    await expect(missing.getPage("missing", replyStub() as never)).rejects.toBeInstanceOf(NotFoundException);

    const escape = new HtmlPagesController({
      htmlPage: {
        findUnique: vi.fn(async () => ({
          token: "token_escape",
          status: "active",
          storageKey: "../secret.html",
        })),
      },
    } as never);
    await expect(escape.getPage("token_escape", replyStub() as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("管理端可分页查询 HTML 页面列表", async () => {
    const prisma = {
      htmlPage: {
        findMany: vi.fn(async () => [
          {
            id: "html_1",
            title: "日报",
            publicUrl: "https://gewehub.yunzxu.com/h/html_token",
            status: "active",
          },
        ]),
      },
    };
    const controller = new HtmlPagesController(prisma as never);

    const result = await controller.list("active", "20", "40");

    expect(result).toEqual([
      {
        id: "html_1",
        title: "日报",
        publicUrl: "https://gewehub.yunzxu.com/h/html_token",
        status: "active",
      },
    ]);
    expect(prisma.htmlPage.findMany).toHaveBeenCalledWith({
      where: { status: "active" },
      include: {
        account: true,
        conversation: true,
        app: true,
        sendRequest: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 40,
    });
  });

  it("管理端可归档 HTML 页面", async () => {
    const prisma = {
      htmlPage: {
        update: vi.fn(async () => ({ id: "html_1", status: "archived" })),
      },
    };
    const controller = new HtmlPagesController(prisma as never);

    await expect(controller.archive("html_1")).resolves.toEqual({ id: "html_1", status: "archived" });
    expect(prisma.htmlPage.update).toHaveBeenCalledWith({
      where: { id: "html_1" },
      data: { status: "archived" },
    });
  });

  it("管理端查询 HTML 页面列表时拒绝非法状态", async () => {
    const controller = new HtmlPagesController({ htmlPage: { findMany: vi.fn() } } as never);

    await expect(controller.list("pending", "20", "0")).rejects.toBeInstanceOf(BadRequestException);
  });
});

function replyStub() {
  return {
    header: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
}
