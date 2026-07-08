import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin query architecture", () => {
  it("运行观测使用 React Query 显式声明 stale/refetch 策略和 mutation invalidation", () => {
    const queriesSource = readFileSync(resolve(__dirname, "queries.ts"), "utf8");
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");

    expect(queriesSource).toContain("useQuery");
    expect(queriesSource).toContain("useMutation");
    expect(queriesSource).toContain("observabilityQueryKeys.summary");
    expect(queriesSource).toContain("observabilityQueryKeys.outboxTasks");
    expect(queriesSource).toContain("staleTime: ADMIN_LIST_STALE_TIME_MS");
    expect(queriesSource).toContain("refetchInterval: OBSERVABILITY_REFETCH_INTERVAL_MS");
    expect(queriesSource).toContain("invalidateQueries");
    expect(queriesSource).toContain("Invalidate summary and outbox task list");
    expect(adminSource).not.toContain('apiFetch(`/api/outbox/tasks/${taskId}/retry`');
  });

  it("运行观测页面拆出独立页面模块，AdminPages 只保留路由分发", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const observabilityPath = resolve(__dirname, "observability/ObservabilityPage.tsx");

    expect(existsSync(observabilityPath)).toBe(true);
    expect(adminSource).toContain('from "./observability/ObservabilityPage"');
    expect(adminSource).not.toContain("function ObservabilityPage()");
  });

  it("接入设置页面拆出独立页面模块，继续收敛 AdminPages 体积", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const settingsPath = resolve(__dirname, "settings/SettingsPage.tsx");

    expect(existsSync(settingsPath)).toBe(true);
    expect(adminSource).toContain('from "./settings/SettingsPage"');
    expect(adminSource).not.toContain("function SettingsPage()");
  });

  it("账号页拆出独立页面模块，AdminPages 不再承载账号表单和同步逻辑", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const accountsPath = resolve(__dirname, "accounts/AccountsPage.tsx");

    expect(existsSync(accountsPath)).toBe(true);
    expect(adminSource).toContain('from "./accounts/AccountsPage"');
    expect(adminSource).not.toContain("function AccountsPage()");
    expect(adminSource).not.toContain("handleSync()");
  });

  it("推送日志页拆出独立页面模块，AdminPages 不再承载重投和详情逻辑", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const deliveriesPath = resolve(__dirname, "deliveries/DeliveriesPage.tsx");

    expect(existsSync(deliveriesPath)).toBe(true);
    expect(adminSource).toContain('from "./deliveries/DeliveriesPage"');
    expect(adminSource).not.toContain("function DeliveriesPage(");
    expect(adminSource).not.toContain("function DeliveryDetailSheet(");
    expect(adminSource).not.toContain("/api/deliveries/");
  });

  it("发送记录页拆出独立页面模块，AdminPages 不再承载撤回和详情逻辑", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const sendRequestsPath = resolve(__dirname, "send-requests/SendRequestsPage.tsx");

    expect(existsSync(sendRequestsPath)).toBe(true);
    expect(adminSource).toContain('from "./send-requests/SendRequestsPage"');
    expect(adminSource).not.toContain("function SendRequestsPage(");
    expect(adminSource).not.toContain("function SendRequestDetailSheet(");
    expect(adminSource).not.toContain("/api/send/");
  });

  it("HTML 页面页拆出独立页面模块，AdminPages 只负责路由分发", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const htmlPagesPath = resolve(__dirname, "html-pages/HtmlPagesPage.tsx");

    expect(existsSync(htmlPagesPath)).toBe(true);
    expect(adminSource).toContain('from "./html-pages/HtmlPagesPage"');
    expect(adminSource).not.toContain("function HtmlPagesPage(");
    expect(adminSource).not.toContain("/api/html-pages");
  });

  it("应用页拆出独立页面模块，AdminPages 不再承载 token 和绑定会话逻辑", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminPages.tsx"), "utf8");
    const appsPath = resolve(__dirname, "apps/AppsPage.tsx");

    expect(existsSync(appsPath)).toBe(true);
    expect(adminSource).toContain('from "./apps/AppsPage"');
    expect(adminSource).not.toContain("function AppsPage(");
    expect(adminSource).not.toContain("handleResetToken");
    expect(adminSource).not.toContain("handleLoadBindings");
  });
});
