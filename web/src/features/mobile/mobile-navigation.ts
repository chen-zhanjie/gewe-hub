import { mobileRoutes, type MobileRoute } from "./mobile-routes";

export type MobileTabKey = "conversations" | "contacts" | "admin" | "me";

export interface MobileNavigationItem {
  key: MobileTabKey;
  label: string;
  path: MobileRoute;
}

export const mobileNavigationItems = [
  {
    key: "conversations",
    label: "会话",
    path: mobileRoutes.conversations,
  },
  {
    key: "contacts",
    label: "通讯录",
    path: mobileRoutes.contacts,
  },
  {
    key: "admin",
    label: "管理",
    path: mobileRoutes.admin,
  },
  {
    key: "me",
    label: "我的",
    path: mobileRoutes.me,
  },
] as const satisfies readonly MobileNavigationItem[];
