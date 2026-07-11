import { MessageCircle, Settings2, UserRound, UsersRound } from "lucide-react";
import type { MobileTabKey } from "./mobile-navigation";
import { mobileNavigationItems } from "./mobile-navigation";
import { cn } from "@/lib/utils";

const icons = {
  conversations: MessageCircle,
  contacts: UsersRound,
  admin: Settings2,
  me: UserRound,
} satisfies Record<MobileTabKey, typeof MessageCircle>;

export function MobileBottomTabs({
  activeTab,
  onNavigate,
}: {
  activeTab: MobileTabKey;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav aria-label="移动端主导航" className="mobile-bottom-tabs">
      {mobileNavigationItems.map((item) => {
        const Icon = icons[item.key];
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.path)}
            className={cn("mobile-bottom-tab", active && "mobile-bottom-tab-active")}
          >
            <Icon className="size-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
