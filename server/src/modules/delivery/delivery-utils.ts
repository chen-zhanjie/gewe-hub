export interface SseFrameInput {
  eventId: string;
  eventType: string;
  data: unknown;
}

export function buildSseFrame(input: SseFrameInput): string {
  return [`id: ${input.eventId}`, `event: ${input.eventType}`, `data: ${JSON.stringify(input.data)}`, ""].join("\n") + "\n";
}

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function eventTypeToDbValue(eventType: "message.created" | "message.revoked") {
  return eventType === "message.created" ? "message_created" : "message_revoked";
}

export function dbValueToEventType(eventType: "message_created" | "message_revoked") {
  return eventType === "message_created" ? "message.created" : "message.revoked";
}

export function buildDeliveryEventId(messageId: string, appId: string, eventType: "message.created" | "message.revoked") {
  const suffix = eventType === "message.created" ? "created" : "revoked";
  return `del_${messageId}_${appId}_${suffix}`;
}
