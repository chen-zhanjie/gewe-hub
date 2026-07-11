import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface MobileActionSheetAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function MobileActionSheet({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  actions: readonly MobileActionSheetAction[];
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" data-mobile-action-sheet="true">
      <button
        type="button"
        aria-label="关闭操作菜单"
        data-testid="mobile-action-sheet-backdrop"
        onClick={onClose}
        className="absolute inset-0 size-full bg-black/40"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        className="relative z-10 w-full max-w-xl rounded-t-2xl bg-background px-4 pb-4 pt-3 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        <h2 id={titleId} className="px-2 pb-2 text-center text-sm font-medium text-muted-foreground">
          {title}
        </h2>
        <div className="overflow-hidden rounded-xl border bg-background">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                action.onSelect();
                onClose();
              }}
              className={cn(
                "flex min-h-12 w-full items-center justify-center border-b px-4 text-base last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50",
                action.destructive ? "text-destructive" : "text-foreground",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-12 w-full rounded-xl border bg-background text-base font-medium"
        >
          取消
        </button>
      </section>
    </div>,
    document.body,
  );
}
