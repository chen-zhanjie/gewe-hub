export const mobileRoutes = {
  root: "/mobile",
  conversations: "/mobile/conversations",
  conversation: (conversationId: string) => `/mobile/conversations/${conversationId}`,
  conversationManage: (conversationId: string) => `/mobile/conversations/${conversationId}/manage`,
  contacts: "/mobile/contacts",
  admin: "/mobile/admin",
  adminApps: "/mobile/admin/apps",
  adminAccounts: "/mobile/admin/accounts",
  adminDeliveries: "/mobile/admin/deliveries",
  adminSendRequests: "/mobile/admin/send-requests",
  adminHtmlPages: "/mobile/admin/html-pages",
  adminObservability: "/mobile/admin/observability",
  me: "/mobile/me",
  settings: "/mobile/settings",
} as const;

export type MobileRoute = Extract<(typeof mobileRoutes)[keyof typeof mobileRoutes], string>;
