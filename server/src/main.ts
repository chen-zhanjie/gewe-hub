import cookie from "@fastify/cookie";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { loadEnv } from "./config/env.js";
import { AppModule } from "./app.module.js";
import { registerJsonContentParser } from "./http/json-content-parser.js";
import { registerWebhookGatewayRawLoggingHook } from "./http/webhook-gateway-raw-logging-hook.js";

async function bootstrap() {
  const env = loadEnv();
  const adapter = new FastifyAdapter({
    bodyLimit: env.JSON_BODY_LIMIT_BYTES
  });
  const fastify = adapter.getInstance();
  registerWebhookGatewayRawLoggingHook(fastify, env);
  registerJsonContentParser(fastify, env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bodyParser: false
  });
  await app.register(cookie, {
    secret: env.SESSION_SECRET
  });
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true
  });
  await app.listen(env.PORT, "0.0.0.0");
}

void bootstrap();
