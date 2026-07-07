import { createHmac, timingSafeEqual } from "node:crypto";

export interface AdminSession {
  username: string;
  exp: number;
}

export function signSession(session: AdminSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined, secret: string): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
  if (parsed.exp < Date.now()) return null;
  return parsed;
}
