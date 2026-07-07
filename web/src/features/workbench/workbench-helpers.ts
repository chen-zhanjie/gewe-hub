import type { BackendConversation, MessageItem } from "@/lib/workspace-data";

export function readQueryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "工作台数据加载失败";
}

export function readCopyableMessageText(message: MessageItem): string {
  if (message.status === "revoked") return "[已撤回]";
  return message.content.text || stringifyForClipboard(message.standardJson);
}

export function readStandardJsonForCopy(message: MessageItem): unknown {
  if (message.standardJson && typeof message.standardJson === "object" && !Array.isArray(message.standardJson)) {
    return {
      messageId: message.messageId,
      ...(message.standardJson as Record<string, unknown>),
    };
  }
  return {
    messageId: message.messageId,
    payload: message.standardJson,
  };
}

export function stringifyForClipboard(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function asBackendConversation(value: unknown): BackendConversation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as BackendConversation;
}

export function formatNullableNumber(value: number | null | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
