import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../../config/env.js";
import { buildWebhookDedupeKey, classifyWebhookPayload, normalizeWebhookPayload } from "./webhook-utils.js";

@Injectable()
export class WebhookAuditLogger {
  private readonly env = loadEnv();
  private readonly logger = new Logger(WebhookAuditLogger.name);

  async logReceived(payload: Record<string, unknown>): Promise<void> {
    const entry = buildAuditEntry(payload);
    this.logger.log(
      `received kind=${entry.eventKind} appId=${entry.appId ?? "-"} wxid=${entry.wxid ?? "-"} msgId=${entry.msgId ?? "-"} newMsgId=${entry.newMsgId ?? "-"} dedupeKey=${entry.dedupeKey}`,
    );
    const filePath = this.resolveLogPath(entry.receivedAt);
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private resolveLogPath(receivedAt: string): string {
    const yyyymmdd = receivedAt.slice(0, 10).replace(/-/g, "");
    return join(resolve(this.env.FILE_STORAGE_DIR, ".."), "logs", `webhook-raw-${yyyymmdd}.log`);
  }
}

function buildAuditEntry(payload: Record<string, unknown>) {
  const normalized = normalizeWebhookPayload(payload);
  const data = asRecord(payload.Data);
  return {
    receivedAt: new Date().toISOString(),
    eventKind: classifyWebhookPayload(payload),
    dedupeKey: buildWebhookDedupeKey(payload),
    appId: asString(normalized.appid ?? normalized.appId),
    wxid: asString(normalized.wxid ?? data?.Wxid ?? data?.wxid),
    fromUser: asString(normalized.fromUser),
    fromGroup: asString(normalized.fromGroup),
    msgType: asString(normalized.msgType),
    msgId: asString(normalized.msgId),
    newMsgId: asString(normalized.newMsgId),
    payload,
  };
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
