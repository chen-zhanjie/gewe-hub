import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { dirname, join, resolve } from "node:path";

export type WebhookGatewayRawLogInput = {
  fileStorageDir: string;
  method: string;
  url: string | undefined;
  headers: IncomingHttpHeaders | Record<string, unknown>;
  rawBodySample: string;
  rawBodyBytes: number;
  truncated: boolean;
  remoteAddress?: string;
  receivedAt?: Date;
};

export function isWebhookGatewayRequest(url: string | undefined): boolean {
  return (url?.split("?")[0] ?? "").startsWith("/webhook/gewe/");
}

export async function appendWebhookGatewayRawLog(input: WebhookGatewayRawLogInput): Promise<void> {
  const receivedAt = input.receivedAt ?? new Date();
  const entry = {
    receivedAt: receivedAt.toISOString(),
    stage: "gateway_raw",
    method: input.method,
    url: redactWebhookUrl(input.url),
    remoteAddress: input.remoteAddress,
    headers: normalizeHeaders(input.headers),
    rawBodySample: input.rawBodySample,
    rawBodyBytes: input.rawBodyBytes,
    rawBodySampleSha256: createHash("sha256").update(input.rawBodySample).digest("hex"),
    truncated: input.truncated,
  };
  const filePath = resolveGatewayRawLogPath(input.fileStorageDir, receivedAt);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function resolveGatewayRawLogPath(fileStorageDir: string, receivedAt: Date): string {
  const yyyymmdd = receivedAt.toISOString().slice(0, 10).replace(/-/g, "");
  return join(resolve(fileStorageDir, ".."), "logs", `webhook-gateway-raw-${yyyymmdd}.log`);
}

function normalizeHeaders(headers: IncomingHttpHeaders | Record<string, unknown>): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const normalizedKey = key.toLowerCase();
    if (shouldRedactHeader(normalizedKey)) {
      normalized[normalizedKey] = "[redacted]";
      continue;
    }
    normalized[normalizedKey] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return normalized;
}

function shouldRedactHeader(key: string): boolean {
  return key === "authorization" || key === "cookie" || key === "set-cookie" || key.includes("token") || key.includes("secret");
}

function redactWebhookUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/(\/webhook\/gewe\/)[^/?#]+/u, "$1[redacted]");
}
