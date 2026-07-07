import { RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncAccountProfileButton({
  label,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`更新信息 ${label}`}
      title={`更新头像、昵称和在线状态：${label}`}
      disabled={disabled || loading}
      onClick={onClick}
      className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
    </button>
  );
}

export function SyncGroupMembersButton({
  label,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`同步群成员 ${label}`}
      title={`同步群成员 ${label}`}
      disabled={disabled || loading}
      onClick={onClick}
      className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCcw className={cn("size-4", loading && "animate-spin")} />
    </button>
  );
}
