export const mobileRoutes = {
  root: "/mobile",
  conversations: "/mobile/conversations",
  contacts: "/mobile/contacts",
  admin: "/mobile/admin",
  me: "/mobile/me",
} as const;

export type MobileRoute = (typeof mobileRoutes)[keyof typeof mobileRoutes];
