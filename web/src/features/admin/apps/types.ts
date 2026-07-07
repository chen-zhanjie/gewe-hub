import type { BackendAccount } from "../queries";

export const EMPTY_APP_DRAFT = {
  name: "",
  ownerWxid: "",
  mainConversationId: "",
  defaultDebounceMs: "",
  defaultMaxWaitMs: "",
  deliverSelfMessages: false,
};

export interface BackendHubApp {
  id: string;
  name: string;
  token: string;
  status: "active" | "disabled";
  ownerWxid?: string | null;
  mainConversationId?: string | null;
  defaultDebounceMs?: number | null;
  defaultMaxWaitMs?: number | null;
  deliverSelfMessages?: boolean;
  createdAt?: string | Date | null;
  accountRemarks?: BackendAppAccountRemark[];
  _count?: { conversations?: number };
}

export interface BackendAppAccountRemark {
  accountId: string;
  remark?: string | null;
  tags?: string[] | null;
}

export interface BackendAppConversation {
  id: string;
  peerWxid: string;
  type?: "private" | "group";
  name?: string | null;
  platformRemark?: string | null;
  deliveryFilter?: "all" | "at_only";
  debounceMs?: number | null;
  maxWaitMs?: number | null;
  boundAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface AppConversationsResponse {
  items: BackendAppConversation[];
  total: number;
  take: number;
  skip: number;
  nextSkip: number;
  hasMore: boolean;
}

export function mapBoundConversationRow(conversation: BackendAppConversation) {
  return {
    id: conversation.id,
    name: readConversationDisplayName(conversation),
    type: conversation.type === "group" ? "群聊" : "私聊",
    entity: {
      platformRemark: conversation.platformRemark,
      displayName: conversation.name,
      wxid: conversation.peerWxid,
    },
    deliveryFilter: conversation.deliveryFilter ?? "all",
    deliveryFilterText: conversation.deliveryFilter === "at_only" ? "只投递 @ 我" : "全部消息",
    debounceMs: conversation.debounceMs,
    maxWaitMs: conversation.maxWaitMs,
    boundAt: conversation.boundAt,
    updatedAt: conversation.updatedAt,
  };
}

export type BoundConversationRow = ReturnType<typeof mapBoundConversationRow>;

export function buildRemarkDrafts(app: BackendHubApp | null, accounts: BackendAccount[]): Record<string, { remark: string; tags: string }> {
  const existing = new Map((app?.accountRemarks ?? []).map((remark) => [remark.accountId, remark]));
  return Object.fromEntries(
    accounts.map((account) => {
      const remark = existing.get(account.id);
      return [
        account.id,
        {
          remark: remark?.remark ?? "",
          tags: Array.isArray(remark?.tags) ? remark.tags.join(",") : "",
        },
      ];
    }),
  );
}

export function buildAccountRemarksPayload(remarkDrafts: Record<string, { remark: string; tags: string }>) {
  return Object.entries(remarkDrafts).map(([accountId, draft]) => ({
    accountId,
    remark: optionalText(draft.remark) ?? null,
    tags: parseTags(draft.tags),
  }));
}

export function readAccountDisplayName(account: BackendAccount): string {
  return account.platformRemark || account.nickname || account.wxid;
}

export function maskToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

export function formatNullableNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function formatMs(value: number | null | undefined): string {
  return typeof value === "number" ? `${value} ms` : "继承默认";
}

function readConversationDisplayName(conversation: BackendAppConversation): string {
  return conversation.platformRemark?.trim() || conversation.name?.trim() || conversation.peerWxid;
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
