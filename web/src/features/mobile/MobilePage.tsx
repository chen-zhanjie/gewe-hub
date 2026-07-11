import type { ReactNode } from "react";
import { MobileTopBar } from "./MobileTopBar";

export function MobilePage({ title, subtitle, onBack, actions, children }: { title: string; subtitle?: string; onBack?: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileTopBar title={title} subtitle={subtitle} onBack={onBack} actions={actions} />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
