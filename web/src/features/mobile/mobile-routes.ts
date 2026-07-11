export const mobileRoutes = {
  root: "/mobile",
  conversations: "/mobile/conversations",
  conversation: (conversationId: string) => `/mobile/conversations/${encodeURIComponent(conversationId)}`,
  messageDetail: (conversationId: string, messageId: string) => `/mobile/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
  conversationManage: (conversationId: string) => `/mobile/conversations/${conversationId}/manage`,
  contacts: "/mobile/contacts",
  admin: "/mobile/admin",
  adminApps: "/mobile/admin/apps",
  adminAccounts: "/mobile/admin/accounts",
  adminDeliveries: "/mobile/admin/deliveries",
  adminSendRequests: "/mobile/admin/send-requests",
  adminSendRequest: (sendRequestId: string) => `/mobile/admin/send-requests/${encodeURIComponent(sendRequestId)}`,
  adminHtmlPages: "/mobile/admin/html-pages",
  adminObservability: "/mobile/admin/observability",
  me: "/mobile/me",
  settings: "/mobile/settings",
} as const;

export type MobileRoute = Extract<(typeof mobileRoutes)[keyof typeof mobileRoutes], string>;
