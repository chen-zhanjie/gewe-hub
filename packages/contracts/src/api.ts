import { z } from "zod";

export const ackRequestSchema = z
  .object({
    eventIds: z.array(z.string()).min(1)
  })
  .strict();

export const ackResponseSchema = z
  .object({
    ok: z.literal(true),
    acked: z.number().int().nonnegative()
  })
  .strict();

export const sendRequestSchema = z
  .object({
    conversationId: z.string(),
    type: z.enum(["text", "image", "file", "voice", "video", "link", "html"]),
    text: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    fileUrl: z.string().url().optional(),
    fileName: z.string().optional(),
    contentBase64: z.string().optional(),
    mimeType: z.string().optional(),
    thumbUrl: z.string().url().optional(),
    thumbContentBase64: z.string().optional(),
    thumbMimeType: z.string().optional(),
    thumbFileName: z.string().optional(),
    title: z.string().optional(),
    desc: z.string().optional(),
    linkUrl: z.string().url().optional(),
    htmlContent: z.string().optional(),
    htmlContentBase64: z.string().optional(),
    htmlFileName: z.string().optional(),
    durationMs: z.number().int().positive().optional(),
    mentions: z.array(z.string()).optional(),
    replyToMessageId: z.string().optional(),
    requestId: z.string().optional(),
    idempotencyKey: z.string().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "text" && !value.text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "文本消息必须提供 text"
      });
    }
    if (["image", "file", "voice", "video"].includes(value.type) && !value.contentBase64 && !value.mediaUrl && !value.fileUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentBase64"],
        message: "媒体消息必须提供 contentBase64 或可下载 URL"
      });
    }
    if (
      value.type === "video" &&
      !value.contentBase64 &&
      (value.mediaUrl || value.fileUrl) &&
      !value.thumbUrl &&
      !value.thumbContentBase64
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thumbUrl"],
        message: "远程视频消息必须提供缩略图"
      });
    }
    if (value.type === "link") {
      if (!value.linkUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["linkUrl"],
          message: "链接消息必须提供 linkUrl"
        });
      }
    }
    if (value.type === "html") {
      const sources = [value.linkUrl?.trim(), value.htmlContent?.trim(), value.htmlContentBase64?.trim()].filter(Boolean);
      if (sources.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["htmlContent"],
          message: "HTML 消息必须提供 linkUrl、htmlContent、htmlContentBase64 三选一"
        });
      }
    }
  });

export type SendRequest = z.infer<typeof sendRequestSchema>;

export const sendResponseSchema = z
  .object({
    id: z.string(),
    status: z.enum(["pending", "sent", "failed"]),
    messageId: z.string().optional(),
    htmlPublicUrl: z.string().url().optional(),
    htmlPageId: z.string().nullable().optional(),
    htmlHosted: z.boolean().optional()
  })
  .strict();

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional()
    })
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

const nullableString = z.string().nullable().optional();
const isoDateString = z.string().nullable().optional();

export const conversationSummarySchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    peerWxid: z.string(),
    type: z.enum(["private", "group"]),
    name: nullableString,
    avatarUrl: nullableString,
    platformRemark: nullableString,
    appId: nullableString,
    deliveryFilter: z.enum(["all", "at_only"]),
    debounceMs: z.number().int().nonnegative().nullable().optional(),
    maxWaitMs: z.number().int().nonnegative().nullable().optional(),
    lastMessageAt: isoDateString,
    lastMessageText: nullableString,
    messageCount: z.number().int().nonnegative(),
    status: z.enum(["active", "inactive"]),
    pinnedAt: isoDateString,
    isHidden: z.boolean(),
    lastOpenedAt: isoDateString,
    unreadCount: z.number().int().nonnegative(),
  })
  .passthrough();

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationUpdateRequestSchema = z
  .object({
    platformRemark: z.string().nullable().optional(),
    pinned: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();

export const conversationUpdateResponseSchema = conversationSummarySchema;
export const conversationReadResponseSchema = conversationSummarySchema;

export type ConversationUpdateRequest = z.infer<typeof conversationUpdateRequestSchema>;
export type ConversationUpdateResponse = z.infer<typeof conversationUpdateResponseSchema>;
export type ConversationReadResponse = z.infer<typeof conversationReadResponseSchema>;

const contactProfileContactSchema = z
  .object({
    id: z.string().optional(),
    wxid: z.string(),
    nickname: nullableString,
    avatarUrl: nullableString,
    platformRemark: nullableString,
    status: z.enum(["active", "deleted", "blocked"]).optional(),
  })
  .passthrough();

const contactProfileGroupSchema = z
  .object({
    id: z.string(),
    wxid: z.string(),
    name: nullableString,
    avatarUrl: nullableString,
    platformRemark: nullableString,
  })
  .passthrough();

const contactProfileGroupMembershipSchema = z
  .object({
    id: z.string(),
    wxid: z.string(),
    nickname: nullableString,
    displayName: nullableString,
    avatarUrl: nullableString,
    platformRemark: nullableString,
    status: z.enum(["active", "left", "removed"]).optional(),
    group: contactProfileGroupSchema,
  })
  .passthrough();

export const contactProfileResponseSchema = z
  .object({
    accountId: z.string(),
    wxid: z.string(),
    contact: contactProfileContactSchema.nullable(),
    groupMemberships: z.array(contactProfileGroupMembershipSchema),
    privateConversation: conversationSummarySchema.nullable(),
    commonGroups: z.array(contactProfileGroupSchema),
  })
  .strict();

export type ContactProfileResponse = z.infer<typeof contactProfileResponseSchema>;

export const appAccountRemarkInputSchema = z
  .object({
    accountId: z.string(),
    remark: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export const appUpdateRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    ownerWxid: z.string().optional(),
    mainConversationId: z.string().optional(),
    defaultDebounceMs: z.number().int().nonnegative().optional(),
    defaultMaxWaitMs: z.number().int().nonnegative().optional(),
    deliverSelfMessages: z.boolean().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    accountRemarks: z.array(appAccountRemarkInputSchema).optional(),
  })
  .strict();

export type AppUpdateRequest = z.infer<typeof appUpdateRequestSchema>;

export const appConversationsQuerySchema = z
  .object({
    take: z.number().int().positive().max(100).optional(),
    skip: z.number().int().nonnegative().optional(),
  })
  .strict();

export const appConversationsResponseSchema = z
  .object({
    items: z.array(conversationSummarySchema),
    total: z.number().int().nonnegative(),
    take: z.number().int().positive(),
    skip: z.number().int().nonnegative(),
    nextSkip: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .strict();

export type AppConversationsQuery = z.infer<typeof appConversationsQuerySchema>;
export type AppConversationsResponse = z.infer<typeof appConversationsResponseSchema>;

export const deliveryListQuerySchema = z
  .object({
    status: z.enum(["queued", "delivering", "delivered", "acked", "failed"]).optional(),
    appId: z.string().optional(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    take: z.number().int().positive().max(200).optional(),
    skip: z.number().int().nonnegative().optional(),
  })
  .strict();

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
