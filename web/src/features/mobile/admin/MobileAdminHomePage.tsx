import type { ComponentType } from "react";
import {
  Activity,
  AppWindow,
  Bell,
  ChevronRight,
  Code2,
  Send,
  Users,
} from "lucide-react";
import { MobilePage } from "../MobilePage";

interface AdminEntry {
  label: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const adminEntries: readonly AdminEntry[] = [
  {
    label: "应用",
    description: "管理应用与会话绑定",
    href: "/mobile/admin/apps",
    icon: AppWindow,
  },
  {
    label: "微信账号",
    description: "管理账号与联系人数据",
    href: "/mobile/admin/accounts",
    icon: Users,
  },
  {
    label: "推送日志",
    description: "查看 Webhook 投递结果",
    href: "/mobile/admin/deliveries",
    icon: Bell,
  },
  {
    label: "发送记录",
    description: "查看消息发送请求",
    href: "/mobile/admin/send-requests",
    icon: Send,
  },
  {
    label: "HTML 页面",
    description: "管理已托管的 HTML 内容",
    href: "/mobile/admin/html-pages",
    icon: Code2,
  },
  {
    label: "运行观测",
    description: "检查系统健康与失败任务",
    href: "/mobile/admin/observability",
    icon: Activity,
  },
];

export function MobileAdminHomePage() {
  return (
    <MobilePage title="管理" subtitle="系统资源与运行记录">
      <nav aria-label="管理功能" className="grid gap-3 p-4 sm:grid-cols-2">
        {adminEntries.map((entry) => {
          const Icon = entry.icon;
          return (
            <a
              key={entry.href}
              href={entry.href}
              className="flex min-h-20 items-center gap-3 rounded-xl border bg-background p-4 text-left active:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{entry.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {entry.description}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          );
        })}
      </nav>
    </MobilePage>
  );
}
