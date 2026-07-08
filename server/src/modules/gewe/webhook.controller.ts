import { BadRequestException, Body, Controller, Get, HttpCode, Logger, NotFoundException, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { WebhookAuditLogger } from "./webhook-audit-logger.service.js";
import { GeweClientService } from "./gewe-client.service.js";
import { WebhookService } from "./webhook.service.js";

const setCallbackSchema = z
  .object({
    baseUrl: z.string().trim().url().optional()
  })
  .optional();

@Controller()
export class WebhookController {
  private readonly env = loadEnv();
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhook: WebhookService,
    private readonly geweClient: GeweClientService,
    private readonly webhookAudit: WebhookAuditLogger
  ) {}

  @Post("/webhook/gewe/:secret")
  @HttpCode(200)
  async receive(@Param("secret") secret: string, @Body() payload: Record<string, unknown>) {
    if (secret !== this.env.WEBHOOK_SECRET) {
      throw new NotFoundException();
    }
    await this.webhookAudit.logReceived(payload).catch((error: unknown) => {
      this.logger.warn(`GeWe 回调审计日志写入失败: ${error instanceof Error ? error.message : String(error)}`);
    });
    const result = await this.webhook.store(payload);
    return {
      ok: true,
      duplicated: result.duplicated
    };
  }

  @Get("/api/gewe/status")
  async status() {
    const callbackBaseUrl = normalizeBaseUrl(this.env.PUBLIC_BASE_URL);
    return {
      ok: true,
      callbackBaseUrl,
      callbackUrl: buildCallbackUrl(callbackBaseUrl, this.env.WEBHOOK_SECRET),
      baseUrl: this.env.GEWE_BASE_URL
    };
  }

  @Post("/api/gewe/set-callback")
  async setCallback(@Body() body?: unknown) {
    const parsed = setCallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("回调 URL 前缀格式不正确");
    }
    const callbackBaseUrl = normalizeBaseUrl(parsed.data?.baseUrl ?? this.env.PUBLIC_BASE_URL);
    const callbackUrl = buildCallbackUrl(callbackBaseUrl, this.env.WEBHOOK_SECRET);
    const response = await this.geweClient.setCallback(callbackUrl);
    return { ok: true, callbackBaseUrl, callbackUrl, response };
  }
}

function buildCallbackUrl(baseUrl: string, secret: string): string {
  return `${baseUrl}/webhook/gewe/${secret}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
