import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const composeSource = () => readFileSync(resolve(process.cwd(), "../deploy/docker-compose.yml"), "utf8");

describe("deploy docker-compose", () => {
  it("默认保持连接本机 MySQL/Redis，避免本地验证强制拉基础镜像", () => {
    const source = composeSource();

    expect(source).toContain("DATABASE_URL: ${DATABASE_URL:-mysql://gewehub:gewehub@host.docker.internal:3306/gewehub}");
    expect(source).toContain("REDIS_URL: ${REDIS_URL:-redis://host.docker.internal:6379/0}");
  });

  it("提供可选 infra profile，满足一键启动 mysql/redis 的交付形态", () => {
    const source = composeSource();

    expect(source).toMatch(/mysql:\n[\s\S]*?profiles:\n\s+- infra/);
    expect(source).toMatch(/redis:\n[\s\S]*?profiles:\n\s+- infra/);
    expect(source).toContain("mysql-data:");
    expect(source).toContain("redis-data:");
  });

  it("提供 production profile，包含 mysql/redis 与 Caddy TLS 反向代理", () => {
    const source = composeSource();

    expect(source).toMatch(/mysql:\n[\s\S]*?profiles:\n\s+- infra\n\s+- production/);
    expect(source).toMatch(/redis:\n[\s\S]*?profiles:\n\s+- infra\n\s+- production/);
    expect(source).toMatch(/caddy:\n[\s\S]*?profiles:\n\s+- production/);
    expect(source).toContain("image: caddy:2.8-alpine");
    expect(source).toContain("../deploy/Caddyfile:/etc/caddy/Caddyfile:ro");
    expect(source).toContain("caddy-data:");
    expect(source).toContain("caddy-config:");
  });
});
