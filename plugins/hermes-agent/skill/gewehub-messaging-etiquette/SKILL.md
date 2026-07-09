---
name: gewehub-messaging-etiquette
description: "User-facing delivery etiquette for GeWeHub/WeChat conversations"
version: 1.0.0
author: Hermes Agent
metadata:
  created_by: agent
  tags: [gewehub, wechat, messaging, delivery, etiquette, html]
  related_skills: [gewehub-hermes-agent]
---

# GeWeHub Messaging Etiquette

Use this skill when replying through GeWeHub/WeChat, especially after sending media, files, or HTML link cards.

## Core rules

1. **Prefer platform tools over plain text simulation.**
   - During a task, use `gewehub_send_message` for user-visible sends instead of relying on informal progress text.
   - For one final send, the final response may be a raw JSON object matching GeWeHub `/api/send`; output only the JSON object.
   - Use native GeWeHub parameters for platform capabilities: `replyToMessageId` for quoted replies, `mentions` for @, and the matching `type` for media, links, and HTML.
   - Do not simulate platform capabilities with Markdown, copied text, or natural-language labels.

2. **Do not quote by default.**
   - In ordinary private-chat replies, answer directly without quoting or replying-to the user's previous message.
   - Only use quote/reply metadata when the user explicitly asks for it, when multiple messages need disambiguation, or when testing quote behavior itself.
   - Only include `replyToMessageId` when you intentionally want a quoted reply. Do not use `quote: true` or rely on automatic quote inference; omit `replyToMessageId` for normal replies.
   - If quoting is needed, use `replyToMessageId`; do not rely on Hermes automatic `reply_to`, and do not use Markdown `>` quote blocks to mimic a platform quote.

3. **HTML cards are the main message.**
   - When an HTML page is successfully sent via `gewehub_send_message` with `type=html`, the link card carries the title/description.
   - Do not send a second long text explanation, duplicate link, or summary unless the user asks.
   - If no final text should be sent after the card, use a final JSON response of `{"send": false, "content": "HTML 卡片已发送，最终不再发送文本。"}`.
   - If a visible confirmation is necessary, send it with `gewehub_send_message` as `type=text` during the task, or as a final JSON `type=text` message at the end.

4. **Long tasks need one short status message.**
   - If a task will take a while, send a brief text status first, such as `我看看。` or `稍等，我处理一下。`
   - Do not send repeated progress chatter unless there is a meaningful change.

5. **If HTML sending fails, then explain briefly.**
   - Report the failure in plain language and include the actionable error if useful.
   - Do not claim the card was sent unless the tool returned success.

## Pitfalls

- Avoid treating `.html` as a normal file attachment when the task is to send a web page. Prefer GeWeHub HTML sending.
- Avoid verbose post-send confirmations. They create extra WeChat messages and defeat the purpose of the card.
- Avoid Markdown quote syntax for requested quoted replies. Real quote/reply needs explicit `replyToMessageId`.
- Avoid automatic quoted replies in normal chat; the user has explicitly said they do not want that behavior.

## Minimal successful HTML flow

1. Create and verify the HTML artifact.
2. Call `gewehub_send_message` with `type=html` and a short `title` and `desc`.
3. If success, do not send an extra final text response; use `{"send": false, "content": "HTML 卡片已发送，最终不再发送文本。"}` if the final turn should be silent.
