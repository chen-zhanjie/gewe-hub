import { z } from "zod";

export const messageNodeTypeSchema = z.enum([
  "text",
  "image",
  "voice",
  "video",
  "file",
  "emoji",
  "link",
  "html",
  "mini_program",
  "chat_record",
  "location",
  "card",
  "transfer",
  "red_packet",
  "system",
  "unsupported"
]);

export type MessageNodeType = z.infer<typeof messageNodeTypeSchema>;

export const mediaStatusSchema = z.enum(["ready", "failed", "pending"]);

export const mediaSchema = z
  .object({
    url: z.string().url().nullable().optional(),
    status: mediaStatusSchema,
    thumbnailUrl: z.string().url().nullable().optional(),
    fileName: z.string().optional(),
    mimeType: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    md5: z.string().optional()
  })
  .strict();

export const linkSchema = z
  .object({
    title: z.string().optional(),
    desc: z.string().optional(),
    url: z.string().optional(),
    thumbnailUrl: z.string().url().nullable().optional()
  })
  .strict();

export const miniProgramSchema = z
  .object({
    appId: z.string().optional(),
    title: z.string().optional(),
    pagePath: z.string().optional(),
    coverUrl: z.string().url().nullable().optional(),
    sourceName: z.string().optional()
  })
  .strict();

export const locationSchema = z
  .object({
    label: z.string().optional(),
    address: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional()
  })
  .strict();

export const cardSchema = z
  .object({
    wxid: z.string().optional(),
    nickName: z.string().optional(),
    avatarUrl: z.string().url().nullable().optional()
  })
  .strict();

export const transferSchema = z
  .object({
    amount: z.string().optional(),
    memo: z.string().optional(),
    direction: z.enum(["receive", "send", "unknown"]).optional()
  })
  .strict();

export const redPacketSchema = z
  .object({
    greeting: z.string().optional()
  })
  .strict();

export type MessageNode = {
  type: MessageNodeType;
  text: string;
  media?: z.infer<typeof mediaSchema>;
  link?: z.infer<typeof linkSchema>;
  miniProgram?: z.infer<typeof miniProgramSchema>;
  location?: z.infer<typeof locationSchema>;
  card?: z.infer<typeof cardSchema>;
  transfer?: z.infer<typeof transferSchema>;
  redPacket?: z.infer<typeof redPacketSchema>;
  items?: MessageNode[];
  quote?: MessageNode;
  senderName?: string;
  senderWxid?: string;
  sourceMessageId?: string;
  sentAt?: string;
  rawType?: string;
};

export const messageNodeSchema: z.ZodType<MessageNode> = z.lazy(() =>
  z
    .object({
      type: messageNodeTypeSchema,
      text: z.string(),
      media: mediaSchema.optional(),
      link: linkSchema.optional(),
      miniProgram: miniProgramSchema.optional(),
      location: locationSchema.optional(),
      card: cardSchema.optional(),
      transfer: transferSchema.optional(),
      redPacket: redPacketSchema.optional(),
      items: z.array(messageNodeSchema).optional(),
      quote: messageNodeSchema.optional(),
      senderName: z.string().optional(),
      senderWxid: z.string().optional(),
      sourceMessageId: z.string().optional(),
      sentAt: z.string().optional(),
      rawType: z.string().optional()
    })
    .strict()
);

export const mentionSchema = z
  .object({
    wxid: z.string().optional(),
    name: z.string().optional(),
    isMe: z.boolean().optional(),
    resolved: z.boolean()
  })
  .strict();

export const accountContextSchema = z
  .object({
    id: z.string().optional(),
    wxid: z.string(),
    name: z.string().optional(),
    remark: z.string().optional()
  })
  .strict();

export const conversationContextSchema = z
  .object({
    id: z.string(),
    type: z.enum(["private", "group"]),
    wxid: z.string(),
    name: z.string().optional(),
    remark: z.string().optional()
  })
  .strict();

export const senderContextSchema = z
  .object({
    wxid: z.string(),
    name: z.string().optional(),
    remark: z.string().optional(),
    isOwner: z.boolean()
  })
  .strict();

export const messageEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.enum(["message.created", "message.revoked"]),
    messageId: z.string().regex(/^msg_.+/),
    status: z.enum(["normal", "revoked"]),
    isSelf: z.boolean(),
    isAtMe: z.boolean(),
    account: accountContextSchema,
    conversation: conversationContextSchema,
    sender: senderContextSchema,
    mentions: z.array(mentionSchema),
    content: messageNodeSchema,
    quote: messageNodeSchema.nullable(),
    renderedText: z.string(),
    renderedMd: z.string().optional(),
    sentAt: z.string(),
    revokedAt: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .strict();

export type MessageEnvelope = z.infer<typeof messageEnvelopeSchema>;

export const deliveryEventSchema = z
  .object({
    eventId: z.string(),
    eventType: z.enum(["message.created", "message.revoked"]),
    payload: messageEnvelopeSchema
  })
  .strict();

export type DeliveryEvent = z.infer<typeof deliveryEventSchema>;
