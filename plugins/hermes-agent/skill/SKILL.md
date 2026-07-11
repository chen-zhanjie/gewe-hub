---
name: gewehub-hermes-agent
description: GeWeHub 平台的消息接收、发送、引用、撤回及稳定消息ID 使用规范。
---

# GeWeHub Hermes Runtime

GeWeHub 为 Hermes 提供标准化的微信消息上下文和发送能力。处理消息时，以平台提供的会话字段、发送者字段和稳定消息ID 为准。

## 上下文

消息上下文包含以下关键信息：

- `消息ID`：GeWeHub 稳定消息ID，格式为 `msg_...`；
- `会话ID`：发送目标会话；
- 会话名称、会话备注和会话类型；
- 发送者 ID、名称和备注；
- 消息正文、时间及引用关系。

需要引用当前消息或历史消息时，直接使用目标消息上下文中的 `消息ID`。

## 回复方式

普通文本 final 默认按即时、同步文本消息发送。

只有需要结构化参数时才使用 final JSON，例如：

- 指定消息类型；
- 引用消息；
- @ 成员；
- 选择投递方式或执行方式。

final 必须直接输出原始 JSON 对象，首尾只能是 `{` 和 `}`，不要添加 Markdown 围栏标记 或任何说明文字。例如：

`{"type":"text","text":"我看到了","replyToMessageId":"msg_xxx"}`

需要在 final 之前发送消息，或者发送图片、文件、语音、视频、链接、HTML、引用和 @ 消息时，使用 `gewehub_send_message`。

工具调用已经完成真实发送。工具已发送完整答复后，不再发送相同内容。若运行流程仍要求输出 final，直接输出下面这一行原始 JSON，不要使用 Markdown 代码块，也不要在 JSON 前后添加文字：

`{"deliveryMode":"discard","type":"text","text":"本轮已通过工具完成回复"}`

`discard` final 会进入 GeWeHub 记录，但不会再次发送给用户。

## 投递与执行

`deliveryMode`：

- `immediate`：立即发送，默认值；
- `discard`：记录消息但不发送；
- `confirm`：记录消息并等待人工确认。

`executionMode`：

- `sync`：等待实际发送结果，默认值；
- `async`：消息可靠受理后返回，适用于明确需要异步执行的场景。

普通消息无需显式填写这两个字段。

## 标准结果

发送成功返回稳定消息ID，可访问资源通过 `url` 返回：

```json
{
  "success": true,
  "messageId": "msg_xxx",
  "url": "https://example.com/resource"
}
```

异步受理的结果可能包含 `accepted: true`。

## 引用与撤回

- 引用自己发送的消息：使用发送结果中的 `messageId` 作为 `replyToMessageId`；
- 引用别人发送的消息：使用消息上下文中的 `消息ID` 作为 `replyToMessageId`；
- 撤回自己发送的消息：调用 `gewehub_revoke_message`，传入发送结果中的 `messageId`。

```json
{
  "messageId": "msg_xxx"
}
```

## 原生消息能力

- @ 成员：通过 `mentions` 传入发送者 ID 数组，并在正文中为每个 ID 写出对应的 `@昵称`；
- HTML：使用 `type=html`，传入 `file`、HTML 内容或页面链接；
- 本地媒体：通过工具的 `file` 参数发送；
- 公网媒体：使用对应消息类型和 URL 参数；
- HTML、附件及其他可访问资源均从发送结果的 `url` 获取。
