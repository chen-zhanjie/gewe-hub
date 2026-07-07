import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  ackRequestSchema,
  ackResponseSchema,
  deliveryEventSchema,
  errorResponseSchema,
  messageEnvelopeSchema,
  messageNodeSchema,
  sendRequestSchema,
  sendResponseSchema
} from "../src/index";

const outputDir = resolve(process.cwd(), "dist/json-schema");
mkdirSync(outputDir, { recursive: true });

const schemas = {
  "message-node": messageNodeSchema,
  "message-envelope": messageEnvelopeSchema,
  "delivery-event": deliveryEventSchema,
  "ack-request": ackRequestSchema,
  "ack-response": ackResponseSchema,
  "send-request": sendRequestSchema,
  "send-response": sendResponseSchema,
  "error-response": errorResponseSchema
};

for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(
    resolve(outputDir, `${name}.json`),
    `${JSON.stringify(zodToJsonSchema(schema, name), null, 2)}\n`
  );
}
