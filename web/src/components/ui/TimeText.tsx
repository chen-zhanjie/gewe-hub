import { cn } from "@/lib/utils";

interface TimeTextProps {
  value: string | Date | null | undefined;
  className?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const todayTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const monthDayTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function TimeText({ value, className }: TimeTextProps) {
  const date = readDate(value);
  if (!date) return <span className={cn("tabular-nums text-muted-foreground", className)}>—</span>;

  return (
    <time dateTime={date.toISOString()} title={formatAbsoluteDateTime(date)} className={cn("tabular-nums", className)}>
      {formatDisplayTime(date)}
    </time>
  );
}

function readDate(value: TimeTextProps["value"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplayTime(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return todayTimeFormatter.format(date);
  if (date.getFullYear() === now.getFullYear()) return normalizeDateParts(monthDayTimeFormatter.format(date));
  return normalizeDateParts(fullDateFormatter.format(date));
}

function formatAbsoluteDateTime(date: Date): string {
  return normalizeDateParts(dateTimeFormatter.format(date));
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function normalizeDateParts(value: string): string {
  return value
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .replace(",", "")
    .trim();
}
