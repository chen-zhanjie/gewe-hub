import cookie from "@fastify/cookie";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { loadEnv } from "./config/env.js";
import { AppModule } from "./app.module.js";
import { parseWebhookJsonBody } from "./modules/gewe/webhook-utils.js";

async function bootstrap() {
  const env = loadEnv();
  const adapter = new FastifyAdapter({
    bodyLimit: env.JSON_BODY_LIMIT_BYTES
  });
  const fastify = adapter.getInstance();
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: env.JSON_BODY_LIMIT_BYTES },
    (_request, body, done) => {
      try {
        done(null, parseWebhookJsonBody(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );
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
