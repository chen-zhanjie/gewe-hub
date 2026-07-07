import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export const ADMIN_LIST_STALE_TIME_MS = 30_000;
export const ADMIN_ENTITY_STALE_TIME_MS = 5 * 60_000;
export const OBSERVABILITY_REFETCH_INTERVAL_MS = 30_000;

export interface BackendOutboxTask {
  id: string;
  refId: string;
  taskType: string;
  status: string;
  lastError?: string | null;
  nextRetryAt?: string | null;
  payload?: unknown;
  retryCount?: number | null;
}

export interface ObservabilitySummary {
  webhook24h: number;
  failedTasks: number;
  deliveryBacklog: number;
  accounts: Array<{ onlineStatus: string; _count: number }>;
}

export interface GeweStatus {
  ok: boolean;
  callbackUrl: string;
  baseUrl: string;
}

export interface BackendAccount {
  id: string;
  appId?: string | null;
  wxid: string;
  nickname?: string | null;
  platformRemark?: string | null;
  onlineStatus?: "online" | "offline" | "unknown";
}

export interface SaveAccountPayload {
  appId: string;
  wxid: string;
  nickname?: string;
  platformRemark?: string;
}

export const observabilityQueryKeys = {
  summary: ["admin", "observability", "summary"] as const,
  outboxTasks: ["admin", "observability", "outboxTasks"] as const,
};

export const settingsQueryKeys = {
  geweStatus: ["admin", "settings", "geweStatus"] as const,
};

export const accountsQueryKeys = {
  list: ["admin", "accounts", "list"] as const,
};

export function useObservabilitySummaryQuery() {
  return useQuery({
    queryKey: observabilityQueryKeys.summary,
    queryFn: () => apiFetch<ObservabilitySummary>("/api/observability/summary"),
    staleTime: ADMIN_LIST_STALE_TIME_MS,
    refetchInterval: OBSERVABILITY_REFETCH_INTERVAL_MS,
  });
}

export function useOutboxTasksQuery() {
  return useQuery({
    queryKey: observabilityQueryKeys.outboxTasks,
    queryFn: () => apiFetch<BackendOutboxTask[]>("/api/outbox/tasks"),
    staleTime: ADMIN_LIST_STALE_TIME_MS,
    refetchInterval: OBSERVABILITY_REFETCH_INTERVAL_MS,
  });
}

export function useRetryOutboxTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/outbox/tasks/${taskId}/retry`, {
        method: "POST",
      }),
    onSuccess: async () => {
      // Invalidate summary and outbox task list after retry state changes.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: observabilityQueryKeys.summary }),
        queryClient.invalidateQueries({ queryKey: observabilityQueryKeys.outboxTasks }),
      ]);
    },
  });
}

export function useGeweStatusQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.geweStatus,
    queryFn: () => apiFetch<GeweStatus>("/api/gewe/status"),
    staleTime: ADMIN_ENTITY_STALE_TIME_MS,
  });
}

export function useSetGeweCallbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch("/api/gewe/set-callback", {
        method: "POST",
      }),
    onSuccess: async () => {
      // Invalidate GeWe status after callback configuration changes.
      await queryClient.invalidateQueries({ queryKey: settingsQueryKeys.geweStatus });
    },
  });
}

export function useAccountsQuery() {
  return useQuery({
    queryKey: accountsQueryKeys.list,
    queryFn: () => apiFetch<BackendAccount[]>("/api/accounts"),
    staleTime: ADMIN_LIST_STALE_TIME_MS,
  });
}

export function useSaveAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, payload }: { accountId?: string | null; payload: SaveAccountPayload }) =>
      apiFetch(accountId ? `/api/accounts/${accountId}` : "/api/accounts", {
        method: accountId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      // Invalidate account list after account create or update.
      await queryClient.invalidateQueries({ queryKey: accountsQueryKeys.list });
    },
  });
}

export function useSyncContactsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) =>
      apiFetch("/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ accountId, mode: "full" }),
      }),
    onSuccess: async () => {
      // Invalidate account list after contact sync task creation.
      await queryClient.invalidateQueries({ queryKey: accountsQueryKeys.list });
    },
  });
}
