import { createHash, randomBytes } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface ResolveHtmlForSendInput {
  accountId: string;
  conversationId: string;
  appId?: string | null;
  sendRequestId?: string | null;
  title?: string | null;
  desc?: string | null;
  linkUrl?: string | null;
  htmlContent?: string | null;
  htmlContentBase64?: string | null;
  htmlFileName?: string | null;
}

export interface ResolveHtmlForSendResult {
  htmlPublicUrl: string;
  htmlPageId: string | null;
  htmlHosted: boolean;
}

@Injectable()
export class HtmlPagesService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  async resolveForSend(input: ResolveHtmlForSendInput): Promise<ResolveHtmlForSendResult> {
    const linkUrl = normalizeText(input.linkUrl);
    if (linkUrl) {
      return {
        htmlPublicUrl: linkUrl,
        htmlPageId: null,
        htmlHosted: false,
      };
    }

    const bytes = decodeHtmlContent(input);
    if (bytes.byteLength === 0) {
      throw new BadRequestException("HTML 内容不能为空");
    }
    if (bytes.byteLength > this.env.HTML_PAGE_MAX_BYTES) {
      throw new BadRequestException(`HTML 内容不能超过 ${this.env.HTML_PAGE_MAX_BYTES} 字节`);
    }

    const token = createToken();
    const yyyymmdd = formatDateKey(new Date());
    const storageKey = `html/${yyyymmdd}/${token}.html`;
    const path = resolveStoragePath(this.env.FILE_STORAGE_DIR, storageKey);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes);
    const info = await stat(path);
    const publicUrl = `${this.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/h/${token}`;
    const title = normalizeText(input.title) || "HTML 页面";
    const page = await this.prisma.htmlPage.create({
      data: {
        token,
        accountId: input.accountId,
        conversationId: input.conversationId,
        appId: input.appId ?? null,
        sendRequestId: input.sendRequestId ?? null,
        title,
        desc: normalizeText(input.desc) ?? null,
        fileName: sanitizeFileName(input.htmlFileName),
        storageKey,
        publicUrl,
        sizeBytes: info.size,
        sha256: createSha256(bytes),
        status: "active",
      } as Prisma.HtmlPageUncheckedCreateInput,
    });

    return {
      htmlPublicUrl: publicUrl,
      htmlPageId: page.id,
      htmlHosted: true,
    };
  }

  async bindSendRequest(htmlPageId: string, sendRequestId: string): Promise<void> {
    await this.prisma.htmlPage.update({
      where: { id: htmlPageId },
      data: { sendRequestId },
    });
  }
}

export function resolveStoragePath(root: string, storageKey: string): string {
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, storageKey);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}/`)) {
    throw new BadRequestException("HTML 文件路径无效");
  }
  return targetPath;
}

function decodeHtmlContent(input: ResolveHtmlForSendInput): Buffer {
  const htmlContent = input.htmlContent ?? undefined;
  if (htmlContent !== undefined && htmlContent !== null) {
    return Buffer.from(htmlContent, "utf8");
  }
  const htmlContentBase64 = normalizeText(input.htmlContentBase64);
  if (htmlContentBase64) {
    return Buffer.from(htmlContentBase64, "base64");
  }
  throw new BadRequestException("HTML 消息必须提供 HTML 内容或页面 URL");
}

function createToken(): string {
  return randomBytes(18).toString("base64url");
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

function sanitizeFileName(fileName: string | null | undefined): string | null {
  const clean = basename(fileName || "").replace(/[^\w.\-()\u4e00-\u9fa5 ]+/g, "_").trim();
  return clean || null;
}

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
