import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignFileUrlInput {
  assetId: string;
  baseUrl: string;
  expiresAt: number;
  secret: string;
}

export function signFileUrl(input: SignFileUrlInput): string {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const sig = signFileToken(input.assetId, String(input.expiresAt), input.secret);
  return `${baseUrl}/files/${encodeURIComponent(input.assetId)}?exp=${input.expiresAt}&sig=${sig}`;
}

export function signOutboundFileUrl(input: SignFileUrlInput): string {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const sig = signFileToken(`outbound:${input.assetId}`, String(input.expiresAt), input.secret);
  return `${baseUrl}/files/outbound/${encodeURIComponent(input.assetId)}?exp=${input.expiresAt}&sig=${sig}`;
}

export function verifyFileSignature(input: {
  assetId: string;
  exp: string | undefined;
  sig: string | undefined;
  now?: number;
  secret: string;
}): boolean {
  if (!input.exp || !input.sig || !/^\d+$/.test(input.exp)) return false;
  const expiresAt = Number(input.exp);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if ((input.now ?? Math.floor(Date.now() / 1000)) > expiresAt) return false;

  const expected = signFileToken(input.assetId, input.exp, input.secret);
  const actualBuffer = Buffer.from(input.sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyOutboundFileSignature(input: {
  fileId: string;
  exp: string | undefined;
  sig: string | undefined;
  now?: number;
  secret: string;
}): boolean {
  return verifyFileSignature({
    assetId: `outbound:${input.fileId}`,
    exp: input.exp,
    sig: input.sig,
    now: input.now,
    secret: input.secret,
  });
}

function signFileToken(assetId: string, exp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${assetId}.${exp}`)
    .digest("base64url");
}
