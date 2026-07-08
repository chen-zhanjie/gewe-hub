import type { PageKey } from "@/components/layout/ConsoleShell";
import { AccountsPage } from "./accounts/AccountsPage";
import { AppsPage } from "./apps/AppsPage";
import { DeliveriesPage } from "./deliveries/DeliveriesPage";
import { HtmlPagesPage } from "./html-pages/HtmlPagesPage";
import { ObservabilityPage } from "./observability/ObservabilityPage";
import { SendRequestsPage } from "./send-requests/SendRequestsPage";
import { SettingsPage } from "./settings/SettingsPage";

interface AdminPageProps {
  page: PageKey;
  deliveryFilters?: DeliveryFilters;
  onDeliveryFiltersChange?: (filters: DeliveryFilters) => void;
  sendRequestFilters?: SendRequestFilters;
  onSendRequestFiltersChange?: (filters: SendRequestFilters) => void;
  htmlPageFilters?: HtmlPageFilters;
  onHtmlPageFiltersChange?: (filters: HtmlPageFilters) => void;
}

export function AdminPage({
  page,
  deliveryFilters,
  onDeliveryFiltersChange,
  sendRequestFilters,
  onSendRequestFiltersChange,
  htmlPageFilters,
  onHtmlPageFiltersChange,
}: AdminPageProps) {
  if (page === "apps") return <AppsPage />;
  if (page === "accounts") return <AccountsPage />;
  if (page === "deliveries") return <DeliveriesPage initialFilters={deliveryFilters} onFiltersChange={onDeliveryFiltersChange} />;
  if (page === "sendRequests") return <SendRequestsPage initialFilters={sendRequestFilters} onFiltersChange={onSendRequestFiltersChange} />;
  if (page === "htmlPages") return <HtmlPagesPage initialFilters={htmlPageFilters} onFiltersChange={onHtmlPageFiltersChange} />;
  if (page === "observability") return <ObservabilityPage />;
  return <SettingsPage />;
}

export interface DeliveryFilters {
  status: "" | "success" | "failed" | "in_progress";
  messageId?: string;
  page: number;
  pageSize: number;
}

export interface SendRequestFilters {
  status: "" | "success" | "failed" | "in_progress" | "unknown";
  page: number;
  pageSize: number;
}

export interface HtmlPageFilters {
  status: "" | "active" | "archived" | "deleted";
  page: number;
  pageSize: number;
}
