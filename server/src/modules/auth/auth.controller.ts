import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadEnv } from "../../config/env.js";
import { AuthService } from "./auth.service.js";
import { signSession, verifySession } from "./session.js";

const loginBodySchema = z.object({
  username: z.string(),
  password: z.string()
});

@Controller("/api/auth")
export class AuthController {
  private readonly env = loadEnv();

  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() rawBody: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const body = loginBodySchema.parse(rawBody);
    const user = await this.auth.login(body.username, body.password);
    const token = signSession({ username: user.username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }, this.env.SESSION_SECRET);
    reply.setCookie("gewehub_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60
    });
    return { ok: true, user };
  }

  @Post("logout")
  async logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.clearCookie("gewehub_session", { path: "/" });
    return { ok: true };
  }

  @Get("me")
  async me(@Req() request: FastifyRequest) {
    const session = verifySession(request.cookies?.gewehub_session, this.env.SESSION_SECRET);
    if (!session) {
      throw new UnauthorizedException("未登录");
    }
    return {
      user: {
        username: session.username,
        role: "admin" as const
      }
    };
  }
}
