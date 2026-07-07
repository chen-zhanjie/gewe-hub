import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from "@nestjs/common";
import { loadEnv } from "../../config/env.js";
import { GeweClientService } from "./gewe-client.service.js";
import { WebhookService } from "./webhook.service.js";

@Controller()
export class WebhookController {
  private readonly env = loadEnv();

  constructor(
    private readonly webhook: WebhookService,
    private readonly geweClient: GeweClientService
  ) {}

  @Post("/webhook/gewe/:secret")
  @HttpCode(200)
  async receive(@Param("secret") secret: string, @Body() payload: Record<string, unknown>) {
    if (secret !== this.env.WEBHOOK_SECRET) {
      throw new NotFoundException();
    }
    const result = await this.webhook.store(payload);
    return {
      ok: true,
      duplicated: result.duplicated
    };
  }

  @Get("/api/gewe/status")
  async status() {
    return {
      ok: true,
      callbackUrl: `${this.env.PUBLIC_BASE_URL}/webhook/gewe/${this.env.WEBHOOK_SECRET}`,
      baseUrl: this.env.GEWE_BASE_URL
    };
  }

  @Post("/api/gewe/set-callback")
  async setCallback() {
    const callbackUrl = `${this.env.PUBLIC_BASE_URL}/webhook/gewe/${this.env.WEBHOOK_SECRET}`;
    const response = await this.geweClient.setCallback(callbackUrl);
    return { ok: true, callbackUrl, response };
  }
}
