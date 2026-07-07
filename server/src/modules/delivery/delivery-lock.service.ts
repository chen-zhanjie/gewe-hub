import { randomUUID } from "node:crypto";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { loadEnv } from "../../config/env.js";

export interface DeliveryLease {
  key: string;
  ownerToken: string;
  ttlSeconds: number;
}

const STREAM_LOCK_TTL_SECONDS = 45;
const CONVERSATION_LOCK_TTL_SECONDS = 10;

@Injectable()
export class DeliveryLockService implements OnModuleDestroy {
  private readonly redis = new Redis(loadEnv().REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  async takeoverStream(appId: string): Promise<DeliveryLease> {
    const lease = createLease(streamLockKey(appId), STREAM_LOCK_TTL_SECONDS);
    await this.redis.set(lease.key, lease.ownerToken, "EX", lease.ttlSeconds);
    return lease;
  }

  async acquireConversation(appId: string, conversationId: string): Promise<DeliveryLease | null> {
    const lease = createLease(conversationLockKey(appId, conversationId), CONVERSATION_LOCK_TTL_SECONDS);
    const acquired = await this.redis.set(lease.key, lease.ownerToken, "EX", lease.ttlSeconds, "NX");
    return acquired === "OK" ? lease : null;
  }

  async renew(lease: DeliveryLease): Promise<boolean> {
    const result = await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
      1,
      lease.key,
      lease.ownerToken,
      String(lease.ttlSeconds),
    );
    return result === 1;
  }

  async release(lease: DeliveryLease): Promise<void> {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lease.key,
      lease.ownerToken,
    );
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

function createLease(key: string, ttlSeconds: number): DeliveryLease {
  return {
    key,
    ownerToken: randomUUID(),
    ttlSeconds,
  };
}

function streamLockKey(appId: string): string {
  return `gewehub:delivery:stream:${appId}`;
}

function conversationLockKey(appId: string, conversationId: string): string {
  return `gewehub:delivery:conversation:${appId}:${conversationId}`;
}
