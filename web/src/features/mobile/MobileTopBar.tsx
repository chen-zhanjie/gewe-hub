import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function MobileTopBar({ title, subtitle, onBack, actions }: { title: string; subtitle?: string; onBack?: () => void; actions?: ReactNode }) {
  return (
    <header className="mobile-top-bar">
      {onBack ? (
        <button type="button" aria-label="返回" onClick={onBack} className="mobile-icon-button">
          <ChevronLeft className="size-6" />
        </button>
      ) : <span className="size-11" aria-hidden="true" />}
      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex min-w-11 justify-end">{actions}</div>
    </header>
  );
}
