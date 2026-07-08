import { Readable } from "node:stream";
import type { FastifyInstance, RequestPayload } from "fastify";
import {
  appendWebhookGatewayRawLog,
  isWebhookGatewayRequest,
} from "../modules/gewe/webhook-gateway-raw-logger.js";

export type WebhookGatewayRawLoggingEnv = {
  FILE_STORAGE_DIR: string;
  JSON_BODY_LIMIT_BYTES: number;
  WEBHOOK_GATEWAY_RAW_LOG_ENABLED?: boolean;
  WEBHOOK_GATEWAY_RAW_LOG_SAMPLE_BYTES?: number;
};

export function registerWebhookGatewayRawLoggingHook(
  fastify: FastifyInstance,
  env: WebhookGatewayRawLoggingEnv,
): void {
  fastify.addHook("preParsing", async (request, _reply, payload) => {
    if (!isWebhookGatewayRequest(request.url)) return payload;
    if (!env.WEBHOOK_GATEWAY_RAW_LOG_ENABLED) return payload;

    const rawBody = await readPayloadSummary(payload, {
      bodyLimitBytes: env.JSON_BODY_LIMIT_BYTES,
      sampleBytes: env.WEBHOOK_GATEWAY_RAW_LOG_SAMPLE_BYTES ?? 4096,
    });
    await appendWebhookGatewayRawLog({
      fileStorageDir: env.FILE_STORAGE_DIR,
      method: request.method,
      url: request.url,
      headers: request.headers,
      rawBodySample: rawBody.sample.toString("utf8"),
      rawBodyBytes: rawBody.bytes,
      truncated: rawBody.truncated,
      remoteAddress: request.raw.socket.remoteAddress,
    }).catch((error: unknown) => {
      console.error(
        `GeWe gateway raw webhook log write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    const replay = Readable.from([rawBody.replay]) as RequestPayload;
    replay.receivedEncodedLength = rawBody.bytes;
    return replay;
  });
}

async function readPayloadSummary(
  payload: RequestPayload,
  options: { bodyLimitBytes: number; sampleBytes: number },
): Promise<{ replay: Buffer; sample: Buffer; bytes: number; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  for await (const chunk of payload) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = options.bodyLimitBytes + 1 - bytes;
    if (remaining > 0) {
      chunks.push(buffer.subarray(0, remaining));
    }
    bytes += buffer.length;
    if (bytes > options.bodyLimitBytes) {
      truncated = true;
      break;
    }
  }
  const replay = Buffer.concat(chunks);
  return {
    replay,
    sample: replay.subarray(0, Math.max(0, options.sampleBytes)),
    bytes: truncated ? options.bodyLimitBytes + 1 : bytes,
    truncated,
  };
}
