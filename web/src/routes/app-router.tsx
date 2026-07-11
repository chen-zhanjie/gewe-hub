import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useNavigate,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { ConsoleShell, pageRoutes, type PageKey } from "@/components/layout/ConsoleShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { useAuthMeQuery, useLoginMutation, useLogoutMutation } from "@/features/auth/queries";
import { WorkbenchPage } from "@/features/workbench/WorkbenchPage";
import { MobileAppShell } from "@/features/mobile/MobileAppShell";
import { MobileLoginPage } from "@/features/mobile/auth/MobileLoginPage";
import { MobileConversationsPage } from "@/features/mobile/conversations/MobileConversationsPage";
import { MobileAdminHomePage } from "@/features/mobile/admin/MobileAdminHomePage";
import { MobileSettingsPage } from "@/features/mobile/admin/MobileSettingsPage";
import { MobileMePage } from "@/features/mobile/me/MobileMePage";
import { mobileRoutes } from "@/features/mobile/mobile-routes";
import type { MobileTabKey } from "@/features/mobile/mobile-navigation";
import { Radio } from "lucide-react";

interface AdminRouteConfig {
  key: PageKey;
  path: `/${string}`;
  component: () => React.JSX.Element;
  validateSearch?: z.ZodTypeAny;
}

const LazyAdminPage = lazy(() => import("@/features/admin/AdminPages").then((module) => ({ default: module.AdminPage })));

const searchStatusSchema = <TStatuses extends readonly [string, ...string[]]>(statuses: TStatuses) =>
  z.enum(statuses).optional().catch(undefined);

const searchPageSchema = z.coerce.number().int().min(1).optional().catch(undefined);
const searchPageSizeSchema = z.coerce.number().int().refine((value) => value === 20 || value === 50).optional().catch(undefined);

const DELIVERY_ROUTE_STATUSES = ["all", "success", "failed", "in_progress", "queued", "delivering", "delivered", "acked"] as const;
const SEND_REQUEST_ROUTE_STATUSES = ["success", "failed", "in_progress", "pending", "sent", "unknown"] as const;
const HTML_PAGE_ROUTE_STATUSES = ["active", "archived", "deleted"] as const;

type DeliveryRouteStatus = (typeof DELIVERY_ROUTE_STATUSES)[number];
type SendRequestRouteStatus = (typeof SEND_REQUEST_ROUTE_STATUSES)[number];
type WorkbenchRouteSearch = z.infer<typeof workbenchSearchSchema>;
type DeliveryRouteSearch = z.infer<typeof deliveriesSearchSchema>;
type SendRequestRouteSearch = z.infer<typeof sendRequestsSearchSchema>;
type HtmlPageRouteSearch = z.infer<typeof htmlPagesSearchSchema>;

const deliveriesSearchSchema = z.object({
  status: searchStatusSchema(DELIVERY_ROUTE_STATUSES),
  messageId: z.string().optional().catch(undefined),
  page: searchPageSchema,
  pageSize: searchPageSizeSchema,
});

const workbenchSearchSchema = z.object({
  conversationId: z.string().optional().catch(undefined),
  accountId: z.string().optional().catch(undefined),
});

const sendRequestsSearchSchema = z.object({
  status: searchStatusSchema(SEND_REQUEST_ROUTE_STATUSES),
  page: searchPageSchema,
  pageSize: searchPageSizeSchema,
});

const htmlPagesSearchSchema = z.object({
  status: searchStatusSchema(HTML_PAGE_ROUTE_STATUSES),
  page: searchPageSchema,
  pageSize: searchPageSizeSchema,
});

const adminRoutes: AdminRouteConfig[] = [
  { key: "workbench", path: pageRoutes.workbench, validateSearch: workbenchSearchSchema, component: WorkbenchPageRoute },
  { key: "apps", path: pageRoutes.apps, component: () => <AdminPageRoute page="apps" /> },
  { key: "accounts", path: pageRoutes.accounts, component: () => <AdminPageRoute page="accounts" /> },
  {
    key: "deliveries",
    path: pageRoutes.deliveries,
    validateSearch: deliveriesSearchSchema,
    component: DeliveryPageRoute,
  },
  {
    key: "sendRequests",
    path: pageRoutes.sendRequests,
    validateSearch: sendRequestsSearchSchema,
    component: SendRequestPageRoute,
  },
  {
    key: "htmlPages",
    path: pageRoutes.htmlPages,
    validateSearch: htmlPagesSearchSchema,
    component: HtmlPagesPageRoute,
  },
  { key: "observability", path: pageRoutes.observability, component: () => <AdminPageRoute page="observability" /> },
  { key: "settings", path: pageRoutes.settings, component: () => <AdminPageRoute page="settings" /> },
];

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/workbench" replace />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRoute,
});

const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "console",
  component: ConsoleRoute,
});

const consoleChildRoutes = adminRoutes.map((route) =>
  createRoute({
    getParentRoute: () => consoleRoute,
    path: route.path,
    validateSearch: route.validateSearch,
    component: route.component,
  }),
);

const mobileIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: mobileRoutes.root,
  component: () => <Navigate to={mobileRoutes.conversations} replace />,
});

const mobileLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: `${mobileRoutes.root}/login`,
  component: MobileLoginRoute,
});

const mobileConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "mobile-console",
  component: MobileConsoleRoute,
});

const mobileConversationsRoute = createRoute({
  getParentRoute: () => mobileConsoleRoute,
  path: mobileRoutes.conversations,
  component: MobileConversationsRoute,
});

const mobileChildRoutes = [
  mobileConversationsRoute,
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.contacts, component: () => <MobilePlaceholderPage title="通讯录" /> }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.admin, component: MobileAdminHomePage }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.me, component: MobileMeRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.settings, component: MobileSettingsRoute }),
  ...[
    [mobileRoutes.adminApps, "应用管理"],
    [mobileRoutes.adminAccounts, "微信账号"],
    [mobileRoutes.adminDeliveries, "推送日志"],
    [mobileRoutes.adminSendRequests, "发送记录"],
    [mobileRoutes.adminHtmlPages, "HTML 页面"],
    [mobileRoutes.adminObservability, "运行观测"],
  ].map(([path, title]) => createRoute({ getParentRoute: () => mobileConsoleRoute, path, component: () => <MobilePlaceholderPage title={title} /> })),
];

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  mobileIndexRoute,
  mobileLoginRoute,
  consoleRoute.addChildren(consoleChildRoutes),
  mobileConsoleRoute.addChildren(mobileChildRoutes),
]);

export function createAppRouter() {
  return createRouter({
    routeTree,
    history: createBrowserHistory(),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

function RootLayout() {
  return <Outlet />;
}

function AdminPageRoute({ page }: { page: PageKey }) {
  return (
    <Suspense fallback={<RouteChunkLoading />}>
      <LazyAdminPage page={page} />
    </Suspense>
  );
}

function WorkbenchPageRoute() {
  const search = useSearch({ strict: false }) as WorkbenchRouteSearch;
  const navigate = useNavigate({ from: pageRoutes.workbench });
  return (
    <WorkbenchPage
      initialConversationId={typeof search.conversationId === "string" ? search.conversationId : undefined}
      initialAccountId={typeof search.accountId === "string" ? search.accountId : undefined}
      onAccountChange={(accountId) => {
        void navigate({
          search: {
            accountId,
            conversationId: undefined,
          },
        });
      }}
      onOpenDeliveryLog={(messageId) => {
        void navigate({
          to: pageRoutes.deliveries,
          search: { status: "failed", messageId },
        });
      }}
    />
  );
}

function DeliveryPageRoute() {
  const search = useSearch({ strict: false }) as DeliveryRouteSearch;
  const navigate = useNavigate({ from: pageRoutes.deliveries });

  return (
    <Suspense fallback={<RouteChunkLoading />}>
      <LazyAdminPage
        page="deliveries"
        deliveryFilters={{
          status: asDeliveryFilterStatus(search.status),
          messageId: typeof search.messageId === "string" ? search.messageId : undefined,
          page: typeof search.page === "number" ? search.page : 1,
          pageSize: search.pageSize === 50 ? 50 : 20,
        }}
        onDeliveryFiltersChange={(filters) => {
          void navigate({
            search: {
              status: filters.status || "all",
              messageId: filters.messageId || undefined,
              page: filters.page > 1 ? filters.page : undefined,
              pageSize: filters.pageSize !== 20 ? filters.pageSize : undefined,
            },
          });
        }}
      />
    </Suspense>
  );
}

function SendRequestPageRoute() {
  const search = useSearch({ strict: false }) as SendRequestRouteSearch;
  const navigate = useNavigate({ from: pageRoutes.sendRequests });

  return (
    <Suspense fallback={<RouteChunkLoading />}>
      <LazyAdminPage
        page="sendRequests"
        sendRequestFilters={{
          status: asSendRequestRouteStatus(search.status),
          page: typeof search.page === "number" ? search.page : 1,
          pageSize: search.pageSize === 50 ? 50 : 20,
        }}
        onSendRequestFiltersChange={(filters) => {
          void navigate({
            search: {
              status: filters.status || undefined,
              page: filters.page > 1 ? filters.page : undefined,
              pageSize: filters.pageSize !== 20 ? filters.pageSize : undefined,
            },
          });
        }}
      />
    </Suspense>
  );
}

function HtmlPagesPageRoute() {
  const search = useSearch({ strict: false }) as HtmlPageRouteSearch;
  const navigate = useNavigate({ from: pageRoutes.htmlPages });

  return (
    <Suspense fallback={<RouteChunkLoading />}>
      <LazyAdminPage
        page="htmlPages"
        htmlPageFilters={{
          status: asHtmlPageRouteStatus(search.status),
          page: typeof search.page === "number" ? search.page : 1,
          pageSize: search.pageSize === 50 ? 50 : 20,
        }}
        onHtmlPageFiltersChange={(filters) => {
          void navigate({
            search: {
              status: filters.status || undefined,
              page: filters.page > 1 ? filters.page : undefined,
              pageSize: filters.pageSize !== 20 ? filters.pageSize : undefined,
            },
          });
        }}
      />
    </Suspense>
  );
}

function asDeliveryFilterStatus(value: unknown): "" | "success" | "failed" | "in_progress" {
  if (value === "all") return "";
  if (value === "delivered" || value === "acked") return "success";
  if (value === "queued" || value === "delivering") return "in_progress";
  if (value === "success" || value === "failed" || value === "in_progress") return value;
  return "failed";
}

function asSendRequestRouteStatus(value: unknown): "" | "success" | "failed" | "in_progress" | "unknown" {
  if (value === "sent") return "success";
  if (value === "pending") return "in_progress";
  if (value === "success" || value === "failed" || value === "in_progress" || value === "unknown") return value;
  return "";
}

function asHtmlPageRouteStatus(value: unknown): "" | "active" | "archived" | "deleted" {
  if (value === "active" || value === "archived" || value === "deleted") return value;
  return "";
}


function MobileLoginRoute() {
  const authMe = useAuthMeQuery();
  const loginMutation = useLoginMutation();

  if (authMe.isLoading) return <BootScreen />;
  if (authMe.data) return <Navigate to={mobileRoutes.conversations} replace />;

  return (
    <MobileLoginPage
      submitting={loginMutation.isPending}
      onLogin={async (username, password) => {
        await loginMutation.mutateAsync({ username, password });
      }}
    />
  );
}

function MobileConsoleRoute() {
  const authMe = useAuthMeQuery();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = mobileTabFromPath(pathname);

  if (authMe.isLoading) return <BootScreen />;
  if (!authMe.data) return <Navigate to={`${mobileRoutes.root}/login`} replace />;

  return (
    <MobileAppShell
      activeTab={activeTab}
      username={authMe.data.user.username}
      showTabs={pathname === mobileRoutes.conversations || pathname === mobileRoutes.contacts || pathname === mobileRoutes.admin || pathname === mobileRoutes.me}
      onNavigate={(path) => void navigate({ to: path })}
      onLogout={() => {
        void logoutMutation.mutateAsync().finally(() => navigate({ to: `${mobileRoutes.root}/login`, replace: true }));
      }}
    >
      <Outlet />
    </MobileAppShell>
  );
}

function MobileConversationsRoute() {
  const navigate = useNavigate({ from: mobileRoutes.conversations });
  return (
    <MobileConversationsPage
      onOpenConversation={(conversationId) => void navigate({ to: mobileRoutes.conversation(conversationId) })}
      onOpenManagement={(conversationId) => void navigate({ to: mobileRoutes.conversationManage(conversationId) })}
    />
  );
}

function MobileMeRoute() {
  const navigate = useNavigate();
  return <MobileMePage onLoggedOut={() => void navigate({ to: `${mobileRoutes.root}/login`, replace: true })} />;
}

function MobileSettingsRoute() {
  const navigate = useNavigate();
  return <MobileSettingsPage onBack={() => void navigate({ to: mobileRoutes.me })} />;
}

function MobilePlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
      {title}页面
    </div>
  );
}

function mobileTabFromPath(pathname: string): MobileTabKey {
  if (pathname.startsWith(mobileRoutes.contacts)) return "contacts";
  if (pathname.startsWith(mobileRoutes.admin)) return "admin";
  if (pathname.startsWith(mobileRoutes.me)) return "me";
  return "conversations";
}

function LoginRoute() {
  const authMe = useAuthMeQuery();
  const loginMutation = useLoginMutation();

  if (authMe.isLoading) {
    return <BootScreen />;
  }

  if (authMe.data) {
    return <Navigate to="/workbench" replace />;
  }

  return (
    <LoginPage
      submitting={loginMutation.isPending}
      onLogin={async (username, password) => {
        await loginMutation.mutateAsync({ username, password });
      }}
    />
  );
}

function ConsoleRoute() {
  const authMe = useAuthMeQuery();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activePage = pageKeyFromPath(pathname);

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await navigate({ to: "/workbench", replace: true });
    }
  }

  if (authMe.isLoading) {
    return <BootScreen />;
  }

  if (!authMe.data) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ConsoleShell activePage={activePage} username={authMe.data.user.username} onLogout={handleLogout}>
      <Outlet />
    </ConsoleShell>
  );
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
      <div className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-3">
        <Radio className="size-4 text-primary" />
        正在检查登录状态
      </div>
    </div>
  );
}

function RouteChunkLoading() {
  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      <div className="mx-auto max-w-6xl rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
        正在加载页面
      </div>
    </div>
  );
}

function pageKeyFromPath(pathname: string): PageKey {
  return adminRoutes.find((route) => route.path === pathname)?.key ?? "workbench";
}
