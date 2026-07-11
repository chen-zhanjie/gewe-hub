import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app router architecture", () => {
  it("移动端路径全部位于 /mobile 命名空间，并提供四个一级导航 Tab", () => {
    const routesSource = readFileSync(
      resolve(__dirname, "../features/mobile/mobile-routes.ts"),
      "utf8",
    );
    const navigationSource = readFileSync(
      resolve(__dirname, "../features/mobile/mobile-navigation.ts"),
      "utf8",
    );

    expect(routesSource).toContain('root: "/mobile"');
    expect(routesSource).toContain('conversations: "/mobile/conversations"');
    expect(routesSource).toContain('contacts: "/mobile/contacts"');
    expect(routesSource).toContain('admin: "/mobile/admin"');
    expect(routesSource).toContain('me: "/mobile/me"');

    expect(navigationSource).toContain('label: "会话"');
    expect(navigationSource).toContain('label: "通讯录"');
    expect(navigationSource).toContain('label: "管理"');
    expect(navigationSource).toContain('label: "我的"');
    expect(navigationSource).toContain("mobileRoutes.conversations");
    expect(navigationSource).toContain("mobileRoutes.contacts");
    expect(navigationSource).toContain("mobileRoutes.admin");
    expect(navigationSource).toContain("mobileRoutes.me");
  });

  it("移动端真实页面接入会话详情、通讯录、应用和微信账号路由", () => {
    const source = readFileSync(resolve(__dirname, "app-router.tsx"), "utf8");

    expect(source).toContain('path: "/mobile/conversations/$conversationId"');
    expect(source).toContain("component: MobileChatRoute");
    expect(source).toContain("component: MobileMessageDetailRoute");
    expect(source).toContain("component: MobileContactsRoute");
    expect(source).toContain("component: MobileAppsRoute");
    expect(source).toContain("component: MobileAccountsRoute");
    expect(source).not.toContain('path: mobileRoutes.contacts, component: () => <MobilePlaceholderPage title="通讯录" />');
  });

  it("管理页使用路由级动态导入，避免进入工作台首屏包", () => {
    const source = readFileSync(resolve(__dirname, "app-router.tsx"), "utf8");

    expect(source).not.toContain('import { AdminPage } from "@/features/admin/AdminPages"');
    expect(source).toContain('import("@/features/admin/AdminPages")');
  });

  it("管理页筛选分页使用 TanStack Router validateSearch，而不是页面内手写 URLSearchParams", () => {
    const routerSource = readFileSync(resolve(__dirname, "app-router.tsx"), "utf8");
    const adminSource = readFileSync(resolve(__dirname, "../features/admin/AdminPages.tsx"), "utf8");

    expect(routerSource).toContain('import { z } from "zod"');
    expect(routerSource).toContain("deliveriesSearchSchema");
    expect(routerSource).toContain("sendRequestsSearchSchema");
    expect(routerSource).toContain("htmlPagesSearchSchema");
    expect(routerSource).toContain("validateSearch");
    expect(adminSource).not.toContain("window.location.search");
    expect(adminSource).not.toContain("window.history.pushState");
  });
});
