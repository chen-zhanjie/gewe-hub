import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { FastifyReply } from "fastify";

const HEARTBEAT_INTERVAL_MS = 15_000;

export type AdminMessageEventType = "message.created" | "message.revoked";

export interface AdminMessageChangedEvent {
  eventType: AdminMessageEventType;
  conversationId: string;
  messageId: string;
}

interface ActiveAdminStream {
  id: number;
  reply: FastifyReply;
  heartbeatTimer: NodeJS.Timeout;
  closed: boolean;
}

@Injectable()
export class AdminEventsService implements OnModuleDestroy {
  private readonly streams = new Map<number, ActiveAdminStream>();
  private nextStreamId = 1;
  private nextEventId = 1;

  async open(reply: FastifyReply): Promise<void> {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const stream: ActiveAdminStream = {
      id: this.nextStreamId++,
      reply,
      heartbeatTimer: setInterval(() => this.write(stream, ": heartbeat\n\n"), HEARTBEAT_INTERVAL_MS),
      closed: false,
    };
    stream.heartbeatTimer.unref?.();
    this.streams.set(stream.id, stream);
    reply.raw.once("close", () => this.close(stream));
    this.write(stream, ": connected\n\n");
  }

  publishMessageChanged(event: AdminMessageChangedEvent): void {
    this.broadcast({
      id: `admin_${Date.now()}_${this.nextEventId++}`,
      event: event.eventType,
      data: event,
    });
  }

  onModuleDestroy(): void {
    for (const stream of this.streams.values()) {
      this.close(stream);
    }
  }

  private broadcast(frame: { id: string; event: string; data: unknown }): void {
    const payload = [`id: ${frame.id}`, `event: ${frame.event}`, `data: ${JSON.stringify(frame.data)}`, "", ""].join("\n");
    for (const stream of this.streams.values()) {
      this.write(stream, payload);
    }
  }

  private write(stream: ActiveAdminStream, payload: string): void {
    if (stream.closed) return;
    try {
      stream.reply.raw.write(payload);
    } catch {
      this.close(stream);
    }
  }

  private close(stream: ActiveAdminStream): void {
    if (stream.closed) return;
    stream.closed = true;
    clearInterval(stream.heartbeatTimer);
    this.streams.delete(stream.id);
    stream.reply.raw.end();
  }
}
