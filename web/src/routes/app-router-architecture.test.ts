import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app router architecture", () => {
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
    expect(routerSource).toContain("validateSearch");
    expect(adminSource).not.toContain("window.location.search");
    expect(adminSource).not.toContain("window.history.pushState");
  });
});
