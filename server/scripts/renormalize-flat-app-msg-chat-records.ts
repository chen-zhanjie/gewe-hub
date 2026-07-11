import { PrismaClient, type Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { normalizeGewePayload } from "../src/modules/normalizer/normalizer.js";

export interface RenormalizeFlatAppMsgChatRecordsOptions {
  apply?: boolean;
  limit?: number | null;
  log?: (line: string) => void;
}

interface RenormalizePrisma {
  message: {
    findMany: (args: {
      where: {
        source: "callback";
        type: "unsupported";
        webhookEvent: { isNot: null };
      };
      select: {
        id: true;
        messageId: true;
        webhookEvent: { select: { rawPayload: true } };
      };
      orderBy: { createdAt: "asc" };
      take?: number;
    }) => Promise<Array<{
      id: string;
      messageId: string;
      webhookEvent: { rawPayload: unknown } | null;
    }>>;
    update: (args: {
      where: { id: string };
      data: {
        type: "chat_record";
        payload: Prisma.InputJsonValue;
        renderedText: string;
        payloadVersion: number;
      };
    }) => Promise<unknown>;
  };
}

export interface RenormalizeSummary {
  mode: "dry-run" | "apply";
  limit: number | null;
  scanned: number;
  candidates: Array<{
    id: string;
    messageId: string;
    type: "chat_record";
    renderedText: string;
    payloadVersion: number;
  }>;
  updated: number;
}

export function parseRenormalizeFlatAppMsgChatRecordsArgs(
  args: string[],
): Required<Pick<RenormalizeFlatAppMsgChatRecordsOptions, "apply">> & {
  limit: number | null;
} {
  let apply = false;
  let limit: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--limit") {
      const rawLimit = args[index + 1];
      if (!rawLimit || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
        throw new Error("--limit 必须是大于 0 的整数");
      }
      limit = Number(rawLimit);
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { apply, limit };
}

export async function renormalizeFlatAppMsgChatRecords(
  input: RenormalizeFlatAppMsgChatRecordsOptions & { prisma: RenormalizePrisma },
): Promise<RenormalizeSummary> {
  const apply = input.apply ?? false;
  const limit = input.limit ?? null;
  const log = input.log ?? console.log;
  const messages = await input.prisma.message.findMany({
    where: {
      source: "callback",
      type: "unsupported",
      webhookEvent: { isNot: null },
    },
    select: {
      id: true,
      messageId: true,
      webhookEvent: { select: { rawPayload: true } },
    },
    orderBy: { createdAt: "asc" },
    ...(limit === null ? {} : { take: limit }),
  });

  const candidates: RenormalizeSummary["candidates"] = [];
  let updated = 0;

  for (const message of messages) {
    const rawPayload = message.webhookEvent?.rawPayload;
    if (!isRecord(rawPayload)) continue;

    const envelope = normalizeGewePayload(rawPayload, message.messageId);
    if (envelope?.content.type !== "chat_record") continue;

    const candidate = {
      id: message.id,
      messageId: message.messageId,
      type: "chat_record" as const,
      renderedText: envelope.renderedText,
      payloadVersion: envelope.schemaVersion,
    };
    candidates.push(candidate);

    if (!apply) continue;

    await input.prisma.message.update({
      where: { id: message.id },
      data: {
        type: "chat_record",
        payload: envelope as unknown as Prisma.InputJsonValue,
        renderedText: envelope.renderedText,
        payloadVersion: envelope.schemaVersion,
      },
    });
    updated += 1;
  }

  const summary: RenormalizeSummary = {
    mode: apply ? "apply" : "dry-run",
    limit,
    scanned: messages.length,
    candidates,
    updated,
  };
  log(JSON.stringify(summary));
  return summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const options = parseRenormalizeFlatAppMsgChatRecordsArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    await renormalizeFlatAppMsgChatRecords({ prisma, ...options });
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main();
}
