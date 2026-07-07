import type { BackendConversation } from "@/lib/workspace-data";

export function readQueryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "工作台数据加载失败";
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
