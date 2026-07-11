import type { ComponentType } from "react";
import {
  ChevronRight,
  Link2,
  LogOut,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { useAccountsQuery, useGeweStatusQuery } from "@/features/admin/queries";
import { useAuthMeQuery, useLogoutMutation } from "@/features/auth/queries";
import { loadMobileAccountId } from "../mobile-selection-storage";
import { MobilePage } from "../MobilePage";

export function MobileMePage() {
  const authQuery = useAuthMeQuery();
  const geweStatusQuery = useGeweStatusQuery();
  const accountsQuery = useAccountsQuery();
  const logoutMutation = useLogoutMutation();
  const selectedAccountId = loadMobileAccountId();
  const currentAccount =
    accountsQuery.data?.find((account) => account.id === selectedAccountId) ??
    null;

  return (
    <MobilePage title="我的" subtitle="账号与接入信息">
      <div className="space-y-4 p-4">
        <section
          aria-label="身份与连接"
          className="overflow-hidden rounded-xl border bg-background"
        >
          <InfoRow
            icon={UserRound}
            label="当前管理员"
            value={
              authQuery.data?.user.username ??
              (authQuery.isLoading ? "加载中" : "未知")
            }
          />
          <InfoRow
            icon={Link2}
            label="GeWe 连接"
            value={
              geweStatusQuery.data?.ok
                ? "连接正常"
                : geweStatusQuery.isLoading
                  ? "检查中"
                  : "连接异常"
            }
            valueClassName={
              geweStatusQuery.data?.ok ? "text-green-700" : undefined
            }
          />
        </section>
        <nav
          aria-label="我的功能"
          className="overflow-hidden rounded-xl border bg-background"
        >
          <MenuLink
            icon={Users}
            label="当前微信账号"
            value={
              currentAccount?.nickname ||
              currentAccount?.wxid ||
              (accountsQuery.isLoading ? "加载中" : "未选择")
            }
            href="/mobile/admin/accounts"
          />
          <MenuLink icon={Settings} label="接入设置" href="/mobile/settings" />
        </nav>
        <button
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => void logoutMutation.mutateAsync()}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-background text-sm font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut className="size-5" />
          {logoutMutation.isPending ? "正在退出" : "退出登录"}
        </button>
        {logoutMutation.error ? (
          <p className="text-center text-sm text-destructive">
            退出失败，请重试
          </p>
        ) : null}
      </div>
    </MobilePage>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 border-b px-4 last:border-b-0">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
        {label}
      </span>
      <span
        className={`max-w-[55%] truncate text-sm font-medium ${valueClassName ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}
function MenuLink({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-16 items-center gap-3 border-b px-4 active:bg-muted last:border-b-0"
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      {value ? (
        <span className="max-w-[40%] truncate text-sm text-muted-foreground">
          {value}
        </span>
      ) : null}
      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </a>
  );
}
