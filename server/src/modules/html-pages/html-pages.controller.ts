import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { resolveStoragePath } from "./html-pages.service.js";

@Controller()
export class HtmlPagesController {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  @Get("/api/html-pages")
  async list(
    @Query("status") status: string | undefined,
    @Query("take") rawTake: string | undefined,
    @Query("skip") rawSkip: string | undefined
  ) {
    const where = status ? { status: parseHtmlPageStatus(status) } : {};
    return this.prisma.htmlPage.findMany({
      where,
      include: {
        account: true,
        conversation: true,
        app: true,
        sendRequest: true,
      },
      orderBy: { createdAt: "desc" },
      take: parseTake(rawTake),
      skip: parseSkip(rawSkip),
    });
  }

  @Post("/api/html-pages/:id/archive")
  async archive(@Param("id") id: string) {
    return this.prisma.htmlPage.update({
      where: { id },
      data: { status: "archived" },
    });
  }

  @Get("/h/:token")
  async getPage(@Param("token") token: string, @Res() reply: FastifyReply) {
    const page = await this.prisma.htmlPage.findUnique({
      where: { token },
    });
    if (!page || page.status !== "active") {
      throw new NotFoundException("HTML 页面不存在");
    }

    let path: string;
    try {
      path = resolveStoragePath(this.env.FILE_STORAGE_DIR, page.storageKey);
    } catch {
      throw new NotFoundException("HTML 页面不存在");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("HTML 页面不存在");

    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Content-Length", String(info.size));
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(createReadStream(path));
  }
}

function parseHtmlPageStatus(status: string): "active" | "archived" | "deleted" {
  if (status === "active" || status === "archived" || status === "deleted") return status;
  throw new BadRequestException("HTML 页面状态不正确");
}

function parseTake(rawTake: string | undefined): number {
  if (!rawTake) return 20;
  const take = Number.parseInt(rawTake, 10);
  if (!Number.isFinite(take) || take < 1) return 20;
  return Math.min(take, 100);
}

function parseSkip(rawSkip: string | undefined): number {
  if (!rawSkip) return 0;
  const skip = Number.parseInt(rawSkip, 10);
  if (!Number.isFinite(skip) || skip < 0) return 0;
  return skip;
}
