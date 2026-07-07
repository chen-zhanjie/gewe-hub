import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MediaService } from "./media.service.js";
import { verifyFileSignature, verifyOutboundFileSignature } from "./media-url.js";

@Controller()
export class MediaController {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService
  ) {}

  @Get("/files/outbound/:id")
  async getOutboundFile(
    @Param("id") id: string,
    @Query("exp") exp: string | undefined,
    @Query("sig") sig: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const ok = verifyOutboundFileSignature({
      fileId: id,
      exp,
      sig,
      secret: this.env.SESSION_SECRET
    });
    if (!ok) throw new ForbiddenException("媒体签名无效或已过期");

    const file = await this.media.getOutboundFile(id);
    if (!file) throw new NotFoundException("媒体文件不存在");

    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Length", String(file.size));
    reply.header("Cache-Control", "private, max-age=3600");
    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return reply.send(createReadStream(file.path));
  }

  @Get("/files/:id")
  async getFile(
    @Param("id") id: string,
    @Query("exp") exp: string | undefined,
    @Query("sig") sig: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const ok = verifyFileSignature({
      assetId: id,
      exp,
      sig,
      secret: this.env.SESSION_SECRET
    });
    if (!ok) throw new ForbiddenException("媒体签名无效或已过期");

    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.status !== "ready" || !asset.localPath) throw new NotFoundException("媒体文件不存在");

    const info = await stat(asset.localPath).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("媒体文件不存在");

    reply.header("Content-Type", asset.mimeType ?? "application/octet-stream");
    reply.header("Content-Length", String(info.size));
    reply.header("Cache-Control", "private, max-age=3600");
    if (asset.fileName) {
      reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`);
    }
    return reply.send(createReadStream(asset.localPath));
  }

  @Post("/api/media/assets/:id/retry")
  async retry(@Param("id") id: string) {
    return this.media.retryDownload(id);
  }
}
