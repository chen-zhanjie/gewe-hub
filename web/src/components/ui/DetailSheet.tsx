import type { ReactNode } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./Sheet";

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function DetailSheet({ open, onOpenChange, title, description, status, children, footer }: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="pr-14">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>{title}</SheetTitle>
              {description ? <SheetDescription className="truncate">{description}</SheetDescription> : null}
            </div>
            {status ? <div className="shrink-0 pt-0.5">{status}</div> : null}
          </div>
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {footer ? <div className="shrink-0 border-t bg-background px-6 py-4">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
