import type { ReactNode } from "react";

export function MobileEntityCard({
  title,
  subtitle,
  badge,
  details,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          {subtitle ? <div className="mt-1 break-all text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {details ? <div className="mt-3 grid gap-2 text-xs text-muted-foreground">{details}</div> : null}
      {actions ? <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">{actions}</div> : null}
    </article>
  );
}

export function MobileCardAction({ destructive = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-10 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? "border-destructive/40 text-destructive active:bg-destructive/10" : "text-foreground active:bg-muted"
      } ${props.className ?? ""}`}
    />
  );
}
