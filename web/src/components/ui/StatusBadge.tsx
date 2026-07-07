import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  online: "在线",
  delivered: "已投递",
  acked: "已确认",
  sent: "已发送",
  queued: "排队中",
  delivering: "投递中",
  pending: "等待中",
  unknown: "未知",
  result_unknown: "结果未知",
  left: "已离开",
  removed: "已移除",
  inactive: "未活跃",
  failed: "失败",
  offline: "离线",
  dead: "已终止",
  disabled: "已停用",
  revoked: "已撤回",
  skipped: "已跳过"
};

const success = new Set(["online", "delivered", "acked", "sent"]);
const progress = new Set(["queued", "delivering", "pending"]);
const warning = new Set(["unknown", "result_unknown", "left", "inactive"]);
const failure = new Set(["failed", "offline", "dead"]);
const neutral = new Set(["disabled", "revoked", "skipped", "removed"]);

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs", statusClass(status), className)}>
      {labels[status] ?? status}
    </span>
  );
}

function statusClass(status: string): string {
  if (success.has(status)) return "bg-green-100 text-green-700";
  if (progress.has(status)) return "bg-blue-100 text-blue-700";
  if (warning.has(status)) return "bg-amber-100 text-amber-700";
  if (failure.has(status)) return "bg-red-100 text-red-700";
  if (neutral.has(status)) return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}
