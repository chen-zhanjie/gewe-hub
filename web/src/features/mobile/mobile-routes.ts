export const mobileRoutes = {
  root: "/mobile",
  conversations: "/mobile/conversations",
  conversation: (conversationId: string) => `/mobile/conversations/${conversationId}`,
  conversationManage: (conversationId: string) => `/mobile/conversations/${conversationId}/manage`,
  contacts: "/mobile/contacts",
  admin: "/mobile/admin",
  me: "/mobile/me",
} as const;

export type MobileRoute = Extract<(typeof mobileRoutes)[keyof typeof mobileRoutes], string>;
