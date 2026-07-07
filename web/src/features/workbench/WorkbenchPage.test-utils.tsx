import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { Toaster } from "sonner";
import { vi } from "vitest";
import { WorkbenchPage, type WorkbenchPageProps } from "./WorkbenchPage";

export function renderWorkbenchPage(props: WorkbenchPageProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function WorkbenchPageHarness(harnessProps: WorkbenchPageProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkbenchPage {...harnessProps} />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  const result = render(<WorkbenchPageHarness {...props} />);

  return {
    ...result,
    rerenderWorkbenchPage(nextProps: WorkbenchPageProps = {}) {
      result.rerender(<WorkbenchPageHarness {...nextProps} />);
    },
  };
}

export function messageFixture(id: string, messageId: string, text: string, sentAt: string) {
  return {
    id,
    messageId,
    senderWxid: "wxid_sender",
    isSelf: false,
    status: "normal",
    sentAt,
    payload: {
      sender: { wxid: "wxid_sender", name: "陈可乐", isOwner: false },
      content: { type: "text", text },
    },
    webhookEvent: { rawPayload: { TypeName: "AddMsg" } },
    deliveries: [],
  };
}

export class FakeEventSource {
  readonly url: string;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.length ?? 0;
  }

  close() {}

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

export function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input).replace("http://localhost", "");
    return mockResponseForRoute(path, routes);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockResponseForRoute(path: string, routes: Record<string, unknown>) {
  const body = path === "/api/apps" && routes[path] === undefined ? [] : routes[path];
  if (body === undefined) {
    return jsonResponse({ error: { message: "not found" } }, 404);
  }
  return jsonResponse(body);
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
