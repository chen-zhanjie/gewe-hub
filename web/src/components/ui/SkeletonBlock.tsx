import { cn } from "@/lib/utils";

interface SkeletonBlockProps {
  rows?: number;
  className?: string;
}

export function SkeletonBlock({ rows = 3, className }: SkeletonBlockProps) {
  return (
    <div className={cn("space-y-3", className)} aria-label="正在加载">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-md border bg-background p-3">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
