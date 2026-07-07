import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GEWE_BASE_URL: z.string().url(),
  GEWE_TOKEN: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(8),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  FILE_STORAGE_DIR: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(16 * 1024 * 1024),
  GEWE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  GEWE_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}
