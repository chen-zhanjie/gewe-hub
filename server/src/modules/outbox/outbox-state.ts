export type OutboxStatus = "pending" | "running" | "done" | "failed" | "dead";

export interface OutboxFailureInput {
  retryCount: number;
  maxRetry: number;
}

export interface OutboxFailureTransition {
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: Date | null;
  lastError: string;
}

export function computeNextRetryAt(retryCount: number, now = new Date()): Date {
  const delaySeconds = Math.min(300, Math.max(1, 2 ** retryCount));
  return new Date(now.getTime() + delaySeconds * 1000);
}

export function transitionAfterFailure(
  task: OutboxFailureInput,
  error: unknown,
  now = new Date()
): OutboxFailureTransition {
  const nextRetryCount = task.retryCount + 1;
  const lastError = error instanceof Error ? error.message : String(error);
  if (nextRetryCount > task.maxRetry) {
    return {
      status: "dead",
      retryCount: nextRetryCount,
      nextRetryAt: null,
      lastError
    };
  }

  return {
    status: "pending",
    retryCount: nextRetryCount,
    nextRetryAt: computeNextRetryAt(nextRetryCount, now),
    lastError
  };
}
