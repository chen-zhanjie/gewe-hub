import { apiFetch } from "@/lib/api";

interface OutboxTaskStatusResponse {
  id: string;
  status: string;
  lastError?: string | null;
}

export async function waitForOutboxTaskDone(taskId: string, options: { attempts?: number; intervalMs?: number } = {}) {
  const attempts = options.attempts ?? 60;
  const intervalMs = options.intervalMs ?? 1000;
  let lastTask: OutboxTaskStatusResponse | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastTask = await apiFetch<OutboxTaskStatusResponse>(`/api/outbox/tasks/${taskId}`);
    if (lastTask.status === "done") return lastTask;
    if (lastTask.status === "failed" || lastTask.status === "dead") {
      throw new Error(lastTask.lastError || "同步任务失败");
    }
    if (attempt < attempts - 1) await sleep(intervalMs);
  }

  throw new Error(`同步任务仍在${readTaskStatus(lastTask?.status)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readTaskStatus(status: string | undefined): string {
  if (status === "pending") return "等待中";
  if (status === "running") return "执行中";
  if (!status) return "处理中";
  return status;
}
