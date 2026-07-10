import { randomBytes } from "node:crypto";

export function createMessageId(): string {
  return `msg_${randomBytes(16).toString("base64url")}`;
}
