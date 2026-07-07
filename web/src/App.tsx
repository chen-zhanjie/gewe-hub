import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import { layers } from "@/components/ui/layers";
import { createAppRouter } from "@/routes/app-router";
import "./styles.css";

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() => createAppRouter());

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" visibleToasts={3} className={layers.toast} />
    </QueryClientProvider>
  );
}
