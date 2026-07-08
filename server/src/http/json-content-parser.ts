import type { FastifyInstance } from "fastify";
import { parseWebhookJsonBody } from "../modules/gewe/webhook-utils.js";

export type JsonContentParserEnv = {
  JSON_BODY_LIMIT_BYTES: number;
};

export function registerJsonContentParser(fastify: FastifyInstance, env: JsonContentParserEnv): void {
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: env.JSON_BODY_LIMIT_BYTES },
    (_request, body, done) => {
      try {
        done(null, parseWebhookJsonBody(body as string));
      } catch (error) {
        done(asBadRequestError(error), undefined);
      }
    },
  );
}

function asBadRequestError(error: unknown): Error {
  if (error instanceof Error) {
    return Object.assign(error, { statusCode: 400 });
  }
  return Object.assign(new Error(String(error)), { statusCode: 400 });
}
