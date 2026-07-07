import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils";

export interface EntityCellValue {
  avatarUrl?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  platformRemark?: string | null;
  wxid?: string | null;
}

interface EntityCellProps {
  entity: EntityCellValue;
  className?: string;
}

export function EntityCell({ entity, className }: EntityCellProps) {
  const name = readEntityName(entity);
  const note = readEntityNote(entity, name);

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar name={name} src={entity.avatarUrl} size={24} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        {note ? <span className="block truncate font-mono text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </span>
  );
}

function readEntityName(entity: EntityCellValue): string {
  return entity.platformRemark?.trim() || entity.displayName?.trim() || entity.nickname?.trim() || entity.wxid?.trim() || "未知实体";
}

function readEntityNote(entity: EntityCellValue, name: string): string {
  const candidates = [entity.wxid, entity.displayName, entity.nickname].map((value) => value?.trim()).filter(Boolean) as string[];
  return candidates.find((value) => value !== name) ?? "";
}
