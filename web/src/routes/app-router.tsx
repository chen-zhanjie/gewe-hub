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
  useParams,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ConsoleShell, pageRoutes, type PageKey } from "@/components/layout/ConsoleShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { useAuthMeQuery, useLoginMutation, useLogoutMutation } from "@/features/auth/queries";
import { WorkbenchPage } from "@/features/workbench/WorkbenchPage";
import { useWorkbenchMessagesQuery, useWorkbenchWorkspaceQuery } from "@/features/workbench/queries";
import { MobileAppShell } from "@/features/mobile/MobileAppShell";
import { MobileLoginPage } from "@/features/mobile/auth/MobileLoginPage";
import { MobileConversationsPage } from "@/features/mobile/conversations/MobileConversationsPage";
import { MobileChatPage } from "@/features/mobile/chat/MobileChatPage";
import { MobileMessageDetailPage } from "@/features/mobile/chat/MobileMessageDetailPage";
import { MobileContactsPage } from "@/features/mobile/contacts/MobileContactsPage";
import { MobileContactProfilePage } from "@/features/mobile/contacts/MobileContactProfilePage";
import { MobileGroupMembersPage } from "@/features/mobile/contacts/MobileGroupMembersPage";
import { MobileConversationManagePage } from "@/features/mobile/conversations/MobileConversationManagePage";
import { MobileAppsPage } from "@/features/mobile/admin/MobileAppsPage";
import { MobileAccountsPage } from "@/features/mobile/admin/MobileAccountsPage";
import { MobileAdminHomePage } from "@/features/mobile/admin/MobileAdminHomePage";
import { MobileSettingsPage } from "@/features/mobile/admin/MobileSettingsPage";
import { MobileHtmlPagesPage } from "@/features/mobile/admin/MobileHtmlPagesPage";
import { MobileObservabilityPage } from "@/features/mobile/admin/MobileObservabilityPage";
import { MobileDeliveriesPage } from "@/features/mobile/admin/MobileDeliveriesPage";
import { MobileSendRequestsPage } from "@/features/mobile/admin/MobileSendRequestsPage";
import { MobileSendRequestDetailPage, type MobileSendRequestRecord } from "@/features/mobile/admin/MobileSendRequestDetailPage";
import { MobileMePage } from "@/features/mobile/me/MobileMePage";
import { mobileRoutes } from "@/features/mobile/mobile-routes";
import type { MobileTabKey } from "@/features/mobile/mobile-navigation";
import { Radio } from "lucide-react";
import { mapAccountSummary, mapConversationSummary, mapMessageItem } from "@/lib/workspace-data";
import { apiFetch } from "@/lib/api";

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

const mobileChatRoute = createRoute({
  getParentRoute: () => mobileConsoleRoute,
  path: "/mobile/conversations/$conversationId",
  component: MobileChatRoute,
});

const mobileMessageDetailRoute = createRoute({
  getParentRoute: () => mobileConsoleRoute,
  path: "/mobile/conversations/$conversationId/messages/$messageId",
  component: MobileMessageDetailRoute,
});

const mobileChildRoutes = [
  mobileConversationsRoute,
  mobileChatRoute,
  mobileMessageDetailRoute,
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.contacts, component: MobileContactsRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: "/mobile/contacts/$accountId/$wxid", component: MobileContactProfileRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: "/mobile/conversations/$conversationId/members", component: MobileGroupMembersRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: "/mobile/conversations/$conversationId/manage", component: MobileConversationManageRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.admin, component: MobileAdminHomePage }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.me, component: MobileMeRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.settings, component: MobileSettingsRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminApps, component: MobileAppsRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminAccounts, component: MobileAccountsRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminHtmlPages, component: MobileHtmlPagesRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminObservability, component: MobileObservabilityRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminDeliveries, validateSearch: deliveriesSearchSchema, component: MobileDeliveriesRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: mobileRoutes.adminSendRequests, validateSearch: sendRequestsSearchSchema, component: MobileSendRequestsRoute }),
  createRoute({ getParentRoute: () => mobileConsoleRoute, path: "/mobile/admin/send-requests/$sendRequestId", component: MobileSendRequestDetailRoute }),
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

function MobileChatRoute() {
  const navigate = useNavigate();
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  if (!conversationId) return <Navigate to={mobileRoutes.conversations} replace />;
  return (
    <MobileChatPage
      conversationId={conversationId}
      onBack={() => void navigate({ to: mobileRoutes.conversations })}
      onOpenContact={(wxid, accountId) => { if (accountId) void navigate({ to: mobileRoutes.contactProfile(accountId, wxid) }); }}
      onOpenManagement={() => void navigate({ to: mobileRoutes.conversationManage(conversationId) })}
      onOpenGroupMembers={() => void navigate({ to: mobileRoutes.groupMembers(conversationId) })}
      onShowMessageDetail={(message) => void navigate({ to: mobileRoutes.messageDetail(conversationId, message.id) })}
    />
  );
}

function MobileMessageDetailRoute() {
  const navigate = useNavigate();
  const { conversationId, messageId } = useParams({ strict: false }) as { conversationId?: string; messageId?: string };
  const messagesQuery = useWorkbenchMessagesQuery(conversationId ?? null);
  if (!conversationId || !messageId) return <Navigate to={mobileRoutes.conversations} replace />;
  if (messagesQuery.isLoading) return <MobilePlaceholderPage title="正在加载消息详情" />;
  const messages = (messagesQuery.data ?? []).map(mapMessageItem);
  const message = messages.find((item) => item.id === messageId || item.messageId === messageId);
  if (!message) return <MobilePlaceholderPage title="消息不存在" />;
  return (
    <MobileMessageDetailPage
      message={message}
      messages={messages}
      onBack={() => void navigate({ to: mobileRoutes.conversation(conversationId) })}
      onSelectMessage={(selected) => void navigate({ to: mobileRoutes.messageDetail(conversationId, selected.id) })}
      onOpenDeliveryLog={(selectedMessageId) => void navigate({ to: mobileRoutes.adminDeliveries, search: { status: "failed", messageId: selectedMessageId } })}
    />
  );
}

function MobileContactsRoute() {
  const navigate = useNavigate();
  return <MobileContactsPage onOpenConversation={(conversationId) => void navigate({ to: mobileRoutes.conversation(conversationId) })} onOpenContact={(accountId, wxid) => void navigate({ to: mobileRoutes.contactProfile(accountId, wxid) })} onOpenGroupMembers={(conversationId) => void navigate({ to: mobileRoutes.groupMembers(conversationId) })} />;
}

function MobileContactProfileRoute() {
  const navigate = useNavigate();
  const { accountId, wxid } = useParams({ strict: false }) as { accountId?: string; wxid?: string };
  if (!accountId || !wxid) return <Navigate to={mobileRoutes.contacts} replace />;
  return <MobileContactProfilePage accountId={accountId} wxid={wxid} onBack={() => void navigate({ to: mobileRoutes.contacts })} onOpenConversation={(conversationId) => void navigate({ to: mobileRoutes.conversation(conversationId) })} />;
}

function MobileGroupMembersRoute() {
  const navigate = useNavigate();
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  if (!conversationId) return <Navigate to={mobileRoutes.conversations} replace />;
  const conversation = (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary).find((item) => item.id === conversationId);
  return <MobileGroupMembersPage conversation={conversation} onBack={() => void navigate({ to: mobileRoutes.conversation(conversationId) })} onOpenContact={(wxid) => { const accountId = conversation?.raw.accountId; if (accountId) void navigate({ to: mobileRoutes.contactProfile(accountId, wxid) }); }} />;
}

function MobileConversationManageRoute() {
  const navigate = useNavigate();
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  if (!conversationId) return <Navigate to={mobileRoutes.conversations} replace />;
  const conversations = (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary);
  const accounts = (workspaceQuery.data?.accounts ?? []).map(mapAccountSummary);
  const conversation = conversations.find((item) => item.id === conversationId);
  const account = accounts.find((item) => item.id === conversation?.raw.accountId);
  return <MobileConversationManagePage conversation={conversation} account={account} apps={workspaceQuery.data?.apps ?? []} onBack={() => void navigate({ to: mobileRoutes.conversation(conversationId) })} />;
}

function MobileAppsRoute() {
  const navigate = useNavigate();
  return <MobileAppsPage onBack={() => void navigate({ to: mobileRoutes.admin })} onOpenConversation={(conversationId) => void navigate({ to: mobileRoutes.conversation(conversationId) })} />;
}

function MobileAccountsRoute() {
  const navigate = useNavigate();
  return <MobileAccountsPage onBack={() => void navigate({ to: mobileRoutes.admin })} onOpenContacts={() => void navigate({ to: mobileRoutes.contacts })} />;
}

function MobileDeliveriesRoute() {
  const search = useSearch({ strict: false }) as DeliveryRouteSearch;
  const navigate = useNavigate();
  return (
    <MobileDeliveriesPage
      initialFilters={{ status: asDeliveryFilterStatus(search.status), messageId: search.messageId, page: search.page ?? 1, pageSize: search.pageSize === 50 ? 50 : 20 }}
      onFiltersChange={(filters) => void navigate({ to: mobileRoutes.adminDeliveries, search: { status: filters.status || "all", messageId: filters.messageId, page: filters.page > 1 ? filters.page : undefined, pageSize: filters.pageSize !== 20 ? filters.pageSize : undefined } })}
      onBack={() => void navigate({ to: mobileRoutes.admin })}
      onOpenConversation={(conversationId) => void navigate({ to: mobileRoutes.conversation(conversationId) })}
    />
  );
}

function MobileSendRequestsRoute() {
  const search = useSearch({ strict: false }) as SendRequestRouteSearch;
  const navigate = useNavigate();
  return (
    <MobileSendRequestsPage
      initialFilters={{ status: asSendRequestRouteStatus(search.status), page: search.page ?? 1, pageSize: search.pageSize === 50 ? 50 : 20 }}
      onFiltersChange={(filters) => void navigate({ to: mobileRoutes.adminSendRequests, search: { status: filters.status || undefined, page: filters.page > 1 ? filters.page : undefined, pageSize: filters.pageSize !== 20 ? filters.pageSize : undefined } })}
      onBack={() => void navigate({ to: mobileRoutes.admin })}
    />
  );
}

function MobileSendRequestDetailRoute() {
  const navigate = useNavigate();
  const { sendRequestId } = useParams({ strict: false }) as { sendRequestId?: string };
  const detailQuery = useQuery({ queryKey: ["mobile", "send-request", sendRequestId], queryFn: () => apiFetch<MobileSendRequestRecord>(`/api/send-requests/${encodeURIComponent(sendRequestId ?? "")}`), enabled: Boolean(sendRequestId) });
  if (!sendRequestId) return <Navigate to={mobileRoutes.adminSendRequests} replace />;
  if (detailQuery.isLoading) return <MobilePlaceholderPage title="正在加载发送详情" />;
  if (!detailQuery.data) return <MobilePlaceholderPage title={detailQuery.error instanceof Error ? detailQuery.error.message : "发送记录不存在"} />;
  return <MobileSendRequestDetailPage request={detailQuery.data} onBack={() => void navigate({ to: mobileRoutes.adminSendRequests })} />;
}

function MobileHtmlPagesRoute() {
  const navigate = useNavigate();
  return <MobileHtmlPagesPage onBack={() => void navigate({ to: mobileRoutes.admin })} onOpenSendRequest={(sendRequestId) => void navigate({ to: mobileRoutes.adminSendRequest(sendRequestId) })} />;
}

function MobileObservabilityRoute() {
  const navigate = useNavigate();
  return <MobileObservabilityPage onBack={() => void navigate({ to: mobileRoutes.admin })} />;
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
