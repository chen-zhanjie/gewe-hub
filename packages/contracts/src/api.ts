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
    type: z.enum(["text", "image", "file", "voice", "video", "link"]),
    text: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    fileUrl: z.string().url().optional(),
    fileName: z.string().optional(),
    contentBase64: z.string().optional(),
    mimeType: z.string().optional(),
    thumbUrl: z.string().url().optional(),
    title: z.string().optional(),
    desc: z.string().optional(),
    linkUrl: z.string().url().optional(),
    durationMs: z.number().int().positive().optional(),
    mentions: z.array(z.string()).optional()
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
    if (value.type === "video") {
      if (!value.thumbUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["thumbUrl"],
          message: "视频消息必须提供 thumbUrl"
        });
      }
      if (!value.durationMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationMs"],
          message: "视频消息必须提供 durationMs"
        });
      }
    }
    if (value.type === "link") {
      for (const field of ["title", "desc", "linkUrl", "thumbUrl"] as const) {
        if (!value[field]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "链接消息必须提供 title、desc、linkUrl、thumbUrl"
          });
        }
      }
    }
  });

export type SendRequest = z.infer<typeof sendRequestSchema>;

export const sendResponseSchema = z
  .object({
    id: z.string(),
    status: z.enum(["pending", "sent", "failed"]),
    messageId: z.string().optional()
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
