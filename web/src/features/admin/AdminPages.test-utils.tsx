import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as renderWithTestingLibrary } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

export function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return renderWithTestingLibrary(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

export function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input).replace("http://localhost", "");
    const body = routes[path];
    if (body === undefined) {
      return new Response(JSON.stringify({ error: { message: "not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
