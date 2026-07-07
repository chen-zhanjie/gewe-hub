import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DescriptionListItem {
  label: ReactNode;
  value: ReactNode;
}

interface DescriptionListProps {
  items: DescriptionListItem[];
  className?: string;
}

export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={cn("grid gap-2 text-sm sm:grid-cols-[120px_1fr]", className)}>
      {items.map((item, index) => (
        <DescriptionListRow key={index} item={item} />
      ))}
    </dl>
  );
}

function DescriptionListRow({ item }: { item: DescriptionListItem }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{item.label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{isEmptyValue(item.value) ? "—" : item.value}</dd>
    </>
  );
}

function isEmptyValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === "";
}
