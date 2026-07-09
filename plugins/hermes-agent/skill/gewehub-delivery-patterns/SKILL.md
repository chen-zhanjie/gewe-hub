---
name: gewehub-delivery-patterns
description: GeWeHub message delivery patterns for HTML cards, real quote/reply, and avoiding duplicate visible sends.
version: 1.0.0
author: Hermes Agent
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [gewehub, wechat, html, quote, delivery, messaging]
    related_skills: [gewehub-hermes-agent]
    created_by: agent
---

# GeWeHub Delivery Patterns

Use this skill when chatting through GeWeHub/WeChat and the user asks to send a platform-native message: HTML page/card, quote/reply, media/file/link, mentions, or any delivery where Markdown/plain final text would only simulate a platform capability.

This is a companion to `gewehub-hermes-agent`. Prefer the plugin skill when available; this skill captures user-corrected delivery behavior that should be applied proactively.

## Core rule

If a GeWeHub send tool can express the capability, **use the tool and do not simulate it with plain text or Markdown**.

- Quote/reply: use `gewehub_send_message(..., replyToMessageId=<message id>)`, not `>` Markdown quote blocks.
- Do not rely on Hermes automatic `reply_to`; GeWeHub only treats explicit `replyToMessageId` as real quote intent.
- HTML page/card: use `gewehub_send_message(type="html", file=...)` or the dedicated HTML tool if present, not pasted HTML text or `.html` attachment fallback.
- Media/file/link/mentions: use the corresponding `/api/send` fields, not natural-language placeholders.

Calling the send tool is itself the user-visible send. The final assistant text should be empty/minimal internal completion where the runtime requires it; do **not** duplicate the same result as a second visible text message.

## Quoting / replying

When the user says “引用我的消息”, “引用一下”, or asks for a real quote:

1. Read the current input context for the latest user `消息ID`.
2. Call:

```json
{
  "conversationId": "<current conversation id>",
  "type": "text",
  "text": "已引用这条消息。",
  "replyToMessageId": "<latest user message id>",
  "idempotencyKey": "quote-msg-<message id>"
}
```

3. Do not also send a Markdown quote or a second plain final message.

If the user has a standing preference not to quote normal replies, only quote when they explicitly ask for it or when the task requires platform reply semantics.

## HTML sending workflow

When the user asks for a webpage / HTML demo / landing page:

1. Build a complete, self-contained `.html` file with mobile viewport and responsive layout.
2. Open it locally in the browser and test at least one primary interaction when present.
3. Check browser console for JS errors.
4. Send via GeWeHub as HTML:

```json
{
  "conversationId": "<current conversation id>",
  "type": "html",
  "title": "Short card title",
  "desc": "Short card description",
  "file": "/absolute/path/to/page.html",
  "idempotencyKey": "stable-page-key"
}
```

5. After a successful send, do not post the public URL and a long explanation unless the user explicitly asks. A short “已发送。” is the maximum useful visible text if a final response is required.

## Pitfalls learned

- Do not claim HTML can only be sent as attachment/text; GeWeHub supports `type=html` and hosts the page as a link card.
- Do not use Markdown quote blocks when tool-level quoting is available; users can tell the difference.
- Do not send a successful HTML card and then repeat its link/details in a separate message. The card title/desc are the explanation.
- If one HTML send parameter shape fails, retry with the standard `gewehub_send_message(type="html", file=...)` shape before concluding the feature is unavailable.

## Verification bar

For HTML artifacts, verify with actual tools before sending:

- file written successfully;
- browser can open `file://...`;
- primary button/link interaction works if included;
- `browser_console` reports no JS errors.

For quote/reply, success is the GeWeHub tool returning `success: true` / `pending` with a send request id.
