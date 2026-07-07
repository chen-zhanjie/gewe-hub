import { Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { loadEnv } from "../../config/env.js";

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  async login(username: string, password: string) {
    if (username !== this.env.ADMIN_USERNAME) {
      throw new UnauthorizedException("账号或密码错误");
    }
    const passwordOk = await bcrypt.compare(password, this.env.ADMIN_PASSWORD_HASH);
    if (!passwordOk) {
      throw new UnauthorizedException("账号或密码错误");
    }
    return {
      username,
      role: "admin" as const
    };
  }
}
