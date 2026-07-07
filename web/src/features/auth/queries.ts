import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";

export interface AdminUser {
  username: string;
  role: "admin";
}

interface AuthMeResponse {
  user: AdminUser;
}

interface LoginPayload {
  username: string;
  password: string;
}

export const authQueryKeys = {
  me: ["auth", "me"] as const,
};

export function useAuthMeQuery() {
  return useQuery({
    queryKey: authQueryKeys.me,
    queryFn: async () => {
      try {
        return await apiFetch<AuthMeResponse>("/api/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      apiFetch<AuthMeResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(authQueryKeys.me, payload);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/auth/logout", {
        method: "POST",
      }),
    onSettled: () => {
      queryClient.setQueryData(authQueryKeys.me, null);
    },
  });
}
