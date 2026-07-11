import { useMemo, useState, type ComponentType } from "react";
import { Activity, Database, Settings, ShieldCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import {
  useGeweStatusQuery,
  useSetGeweCallbackMutation,
} from "@/features/admin/queries";
import { ApiError } from "@/lib/api";
import { MobilePage } from "../MobilePage";

export function MobileSettingsPage({ onBack }: { onBack?: () => void }) {
  const statusQuery = useGeweStatusQuery();
  const setCallbackMutation = useSetGeweCallbackMutation();
  const status = statusQuery.data ?? null;
  const defaultCallbackBaseUrl = useMemo(resolveCallbackBaseUrl, []);
  const [callbackBaseUrl, setCallbackBaseUrl] = useState(
    defaultCallbackBaseUrl,
  );
  const effectiveCallbackBaseUrl =
    normalizeCallbackBaseUrl(callbackBaseUrl) || defaultCallbackBaseUrl;
  const callbackPreviewUrl = buildCallbackPreviewUrl(
    status?.callbackUrl,
    effectiveCallbackBaseUrl,
  );
  const queryError = readError(statusQuery.error);
  const mutationError = readError(setCallbackMutation.error);

  async function handleSetCallback() {
    if (setCallbackMutation.isPending) return;
    await setCallbackMutation.mutateAsync({
      baseUrl: effectiveCallbackBaseUrl,
    });
  }

  return (
    <MobilePage title="接入设置" subtitle="GeWe 连通与回调配置" onBack={onBack}>
      <div className="space-y-4 p-4">
        {statusQuery.isLoading ? <Message>正在加载</Message> : null}
        {queryError ? <Message error>{queryError}</Message> : null}
        <dl className="grid gap-3">
          <StatusItem
            icon={ShieldCheck}
            label="Key 状态"
            value={status?.ok ? "有效" : "未知"}
            healthy={Boolean(status?.ok)}
          />
          <StatusItem
            icon={Database}
            label="回调状态"
            value={status?.callbackUrl ? "已配置" : "未配置"}
            healthy={Boolean(status?.callbackUrl)}
          />
          <StatusItem
            icon={Activity}
            label="GeWe 地址"
            value={status?.baseUrl || "未知"}
            healthy={Boolean(status?.baseUrl)}
          />
        </dl>
        <section className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-medium">回调 URL</h2>
          <label
            htmlFor="mobile-callback-base-url"
            className="mt-4 block text-xs font-medium text-muted-foreground"
          >
            回调 URL 前缀
          </label>
          <input
            id="mobile-callback-base-url"
            aria-label="回调 URL 前缀"
            value={callbackBaseUrl}
            onChange={(event) => setCallbackBaseUrl(event.target.value)}
            placeholder={defaultCallbackBaseUrl}
            className="mt-2 h-11 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">
              {callbackPreviewUrl ?? "未加载"}
            </code>
            <CopyButton
              value={callbackPreviewUrl ?? ""}
              label="复制回调 URL"
              className="shrink-0"
            />
          </div>
          {mutationError ? (
            <Message error className="mt-3">
              {mutationError}
            </Message>
          ) : null}
          <button
            type="button"
            disabled={setCallbackMutation.isPending || !callbackPreviewUrl}
            onClick={() => void handleSetCallback()}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Settings className="size-4" />
            {setCallbackMutation.isPending ? "设置中" : "一键设置回调"}
          </button>
        </section>
      </div>
    </MobilePage>
  );
}

function StatusItem({
  icon: Icon,
  label,
  value,
  healthy,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  healthy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <dt className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          healthy
            ? "max-w-[55%] break-all text-right text-sm font-medium text-green-700"
            : "max-w-[55%] break-all text-right text-sm font-medium text-muted-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
function Message({
  children,
  error = false,
  className = "",
}: {
  children: string;
  error?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${className} rounded-lg border px-3 py-2 text-sm ${error ? "border-destructive/30 text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}
function buildCallbackPreviewUrl(
  callbackUrl: string | undefined,
  baseUrl: string,
): string | null {
  if (!callbackUrl) return null;
  try {
    return `${baseUrl}${new URL(callbackUrl).pathname}`;
  } catch {
    return callbackUrl;
  }
}
function resolveCallbackBaseUrl(): string {
  return (
    normalizeCallbackBaseUrl(import.meta.env.VITE_CALLBACK_BASE_URL) ||
    (typeof window === "undefined" ? "" : window.location.origin)
  );
}
function normalizeCallbackBaseUrl(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}
function readError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "请求失败";
}
