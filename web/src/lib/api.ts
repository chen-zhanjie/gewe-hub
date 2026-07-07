import type { ErrorResponse } from "@gewehub/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const headers = buildHeaders(init);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  const payload = await readPayload(response);

  if (!response.ok) {
    const serverMessage = readServerMessage(payload);
    throw new ApiError(serverMessage ?? "请求失败", response.status, payload);
  }

  return payload as TResponse;
}

function buildHeaders(init: RequestInit): HeadersInit {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return Object.fromEntries(headers.entries());
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readServerMessage(payload: unknown): string | null {
  if (!isErrorResponse(payload)) {
    return null;
  }

  return payload.error.message;
}

function isErrorResponse(payload: unknown): payload is ErrorResponse {
  if (!isRecord(payload)) {
    return false;
  }

  const error = payload.error;
  return isRecord(error) && typeof error.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
