import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { loadEnv } from "../config/env.js";
import { verifySession } from "../modules/auth/session.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly env = loadEnv();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method.toUpperCase();
    const path = normalizePath(request.url);

    if (isPublicRoute(method, path) || isAppTokenRoute(method, path, request.headers.authorization)) {
      return true;
    }

    const session = verifySession(request.cookies?.gewehub_session, this.env.SESSION_SECRET);
    if (!session) {
      throw new UnauthorizedException("未登录");
    }
    return true;
  }
}

function normalizePath(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

function isPublicRoute(method: string, path: string): boolean {
  if (method === "GET" && path === "/api/health") return true;
  if (method === "POST" && path === "/api/auth/login") return true;
  if (method === "POST" && path.startsWith("/webhook/gewe/")) return true;
  if (path.startsWith("/files/")) return true;
  if (path === "/api/apps/events" || path === "/api/apps/events/ack") return true;
  return false;
}

function isAppTokenRoute(method: string, path: string, authorization: string | undefined): boolean {
  return method === "POST" && path === "/api/send" && Boolean(authorization);
}
