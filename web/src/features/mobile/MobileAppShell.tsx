import type { ReactNode } from "react";
import type { MobileTabKey } from "./mobile-navigation";
import { MobileBottomTabs } from "./MobileBottomTabs";

export function MobileAppShell({
  activeTab,
  showTabs,
  onNavigate,
  children,
}: {
  activeTab: MobileTabKey;
  username: string;
  showTabs: boolean;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mobile-app-shell">
      <main className="mobile-app-content">{children}</main>
      {showTabs ? <MobileBottomTabs activeTab={activeTab} onNavigate={onNavigate} /> : null}
    </div>
  );
}
