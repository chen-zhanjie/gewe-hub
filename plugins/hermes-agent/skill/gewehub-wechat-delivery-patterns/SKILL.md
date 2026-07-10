---
name: gewehub-wechat-delivery-patterns
description: "GeWeHub 的微信原生引用、@、HTML 和媒体投递工作流。"
version: 1.1.0
author: Hermes Agent
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [gewehub, wechat, delivery, html, quote, messaging]
    related_skills: [gewehub-hermes-agent]
---

# GeWeHub 微信投递模式

在需要引用、@、HTML、链接或媒体时，使用 GeWeHub 原生消息能力。

## 引用消息

1. 从目标消息上下文读取稳定 `消息ID`；
2. 调用 `gewehub_send_message`；
3. 将该 ID 传给 `replyToMessageId`。

```json
{
  "conversationId": "cvs_xxx",
  "type": "text",
  "text": "这条我确认过了",
  "replyToMessageId": "msg_xxx"
}
```

普通回复直接回答。只有需要明确关联某条消息或消除歧义时才使用引用。

## @ 成员

`mentions` 使用发送者 ID 数组。数组中的每个 ID 都必须在正文中显示对应的 `@昵称`：

```json
{
  "conversationId": "cvs_xxx",
  "type": "text",
  "text": "@张三 请看一下",
  "mentions": ["wxid_xxx"]
}
```

## HTML 页面

1. 生成自包含、适配移动端的 HTML；
2. 在可用时完成本地预览和验证；
3. 使用 `gewehub_send_message(type="html", file="/absolute/path/page.html")` 发送；
4. 使用简短、明确的 `title` 和 `desc`；
5. 将发送结果中的 `messageId` 用于后续引用或撤回，将 `url` 用于访问页面。

```json
{
  "conversationId": "cvs_xxx",
  "type": "html",
  "title": "项目报告",
  "desc": "本周进展与下一步安排",
  "file": "/absolute/path/report.html"
}
```

HTML 页面优先采用单列响应式布局，并确保表格、图片和代码块可在约 360px 屏宽阅读。

## 图片、文件、语音和视频

- 本地资源使用对应消息类型和 `file`；
- 公网资源使用对应消息类型和 URL 参数；
- 使用发送结果中的稳定 `messageId` 进行后续引用或撤回；
- 资源消息已经表达完整内容时，不再发送重复文本。
