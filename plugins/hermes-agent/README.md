# Hermes Agent 插件

本目录维护 GeWeHub 面向 Hermes Agent 的官方对接插件。第一版只消费 GeWeHub 标准消息，不直连 GeWe。

## 配置

优先在当前 Hermes profile 的 `config.yaml` 中配置：

```yaml
platforms:
  gewehub:
    enabled: true
    extra:
      base_url: "https://gewehub.example.com"
      app_token: "hub_app_token"
```

也支持环境变量覆盖：

- `GEWEHUB_BASE_URL`
- `GEWEHUB_APP_TOKEN`

可选：

- `GEWEHUB_HOME_CONVERSATION_ID`
- `GEWEHUB_DEBOUNCE_MS`
- `GEWEHUB_MAX_WAIT_MS`

## 第一版能力

- `GET /api/apps/events` SSE 长连接，`Authorization: Bearer <token>`。
- 持久化 `Last-Event-ID`，本地短期去重。
- 收到可识别事件后立即本地写入游标，并异步调用 `POST /api/apps/events/ack`，请求体 `{ "eventIds": [] }`；ACK 网络失败会后台短重试，仍失败只记录 warning，不影响 AI 处理、批处理或回复发送。
- 标准信封映射为 Hermes 可消费消息字段。
- `message.revoked` 第一版仅记录并 ACK。
- 通过 `POST /api/send` 发送文本、图片、文件、语音、视频、链接和 HTML 回复，并透传 Hermes metadata 中的 `idempotency_key/request_id`、`mentions` 和 `replyToMessageId/reply_to_message_id`。
- 本地媒体文件会读成 `contentBase64` 交给 Hub，由 Hub 写入 runtime 并生成可访问 URL；公网 `http(s)` 媒体 URL 可直接交给 Hub/GeWe。
- 视频发送不要求插件传封面或时长；本地视频文件进入 Hub 后可由 Hub 生成封面并补默认时长，公网 `http(s)` 视频 URL 可直接交给 GeWe。
- 支持 `type=html` 发送：插件 client/CLI 把 HTML 内容、本地 HTML 文件或已有 URL 交给 Hub，Hub 托管后以链接卡片形式发送，成功结果包含 `html_public_url`。
- 注册统一高层工具 `gewehub_send_message`；参数名尽量保持 GeWeHub `/api/send` 一致，AI 只传消息 payload，插件从当前 Hermes profile 配置读取 GeWeHub 地址和 token。
- Hermes 通用 `send(chat_id, content, metadata=...)` 支持通过 `metadata.gewehub.sendType=html` 触发 HTML 发送便捷路由。

## AI 发送规则

AI 应优先使用 GeWeHub 标准化后的关键字段：`conversationId`、消息 ID、发送者 wxid/昵称、引用上下文、媒体路径、消息类型和 metadata。引用、@、媒体、链接卡片和 HTML 发送都依赖这些字段；不要只看正文后用 Markdown 或普通文本模拟平台能力。

- 可调用工具时，用户可见消息优先用 `gewehub_send_message` 发送；工具调用本身就是消息发送。
- 如果整轮任务只需要最后发送一次，final response 可以输出裸 JSON 对象作为 GeWeHub `/api/send` 消息协议，例如 `{"send":true,"type":"text","text":"我看到了。"}`。不要包 Markdown 代码块，也不要在 JSON 前后加解释文字。
- 如果最后一轮不需要再发送消息，输出 `{"send":false,"content":"已通过工具发送，最终不再发送。"}`；`content` 承载 AI 原本想作为最终回复留下的内部说明，不会发送到微信。如果 final response 不是 JSON，插件会按普通文本发送。
- 需要引用/回复某条消息时，使用 `replyToMessageId`，不要用 Markdown `>` 或“引用：...”模拟。
- 不要使用 `quote: true` 或依赖插件自动推断引用对象；只有显式传 `replyToMessageId` 时才引用，不传就不引用。
- 需要 @ 成员时，传 `mentions` wxid 数组，正文可保留可读的 `@昵称`。
- 需要发媒体、链接或 HTML 时，使用对应 `/api/send` 类型；不要把已有平台能力降级成纯文本说明或普通附件。
- 长任务先发一条极短状态消息，例如“我看看。”或“稍等，我处理一下。”；不要刷屏。
- 需要中途失败说明或发送确认时，也优先用 `gewehub_send_message(type=text)` 发一条短消息；最终失败说明可以用裸 JSON 文本消息表达。

## Hermes metadata 文本增强

Hermes 通用 `send(chat_id, content, metadata=...)` 默认走文本发送。需要引用消息或 @ 成员时，把 GeWeHub 参数放在 `metadata.gewehub` 下：

```python
await platform.send(
    chat_id,
    "@可乐 这个我看过了",
    metadata={
        "gewehub": {
            "mentions": ["wxid_kele"],
            "replyToMessageId": "msg_478238581151300365",
            "requestId": "reply-478238581151300365"
        }
    }
)
```

Hermes core 可能在普通 final 文本发送阶段自动传入 `reply_to` 锚点；GeWeHub 插件不会把这个自动锚点当作微信引用。只有显式 `replyToMessageId` 才会生成真实引用消息。

`mentions` 必须是 wxid 字符串数组；正文里仍建议写出可读的 `@昵称`。第一版引用发送仅支持文本回复；引用和 @ 同时使用时，由 Hub 服务端生成引用消息，@ 的真实客户端提醒能力取决于 GeWe 对引用 appmsg 的支持。

## 发送 HTML

AI/Codex 生成 HTML 页面时，必须优先使用 GeWeHub HTML 发送能力，不要把 HTML 正文降级成普通文本，也不要把 `.html` 当普通附件发送。

HTML 链接卡片是主消息。`title` 和 `desc` 要短但能表达意思，承担最小解释职责；发送成功后通常不要再补发普通文本说明。

优先级：

1. 可调用工具时，首选 `gewehub_send_message`，并传 `type=html`。参数尽量保持 `/api/send` 形态：`conversationId/type/title/desc/linkUrl|htmlContent|htmlContentBase64/thumbUrl/idempotencyKey`；需要发送本地 HTML 文件时可额外传便捷参数 `file`，工具会转成 `htmlContentBase64/htmlFileName`。认证由插件读取当前 Hermes profile 配置完成，不要传 `base_url` 或 token。
2. 只能走 Hermes 通用 `send()` 时，用 `metadata.gewehub.sendType=html` 触发插件内部 HTML 路由。
3. 脚本或手工调试时，用 CLI `send-html`。CLI 默认读取当前 Hermes profile 配置，`--base-url/--app-key` 只作为显式覆盖。

工具参数示例：

```json
{
  "conversationId": "conv_xxx",
  "type": "html",
  "title": "日报",
  "desc": "今日 AI 工程日报",
  "file": "/tmp/report.html",
  "thumbUrl": "https://example.com/cover.jpg",
  "idempotencyKey": "daily-report-2026-07-09"
}
```

工具会读取本地文件并转为 `htmlContentBase64/htmlFileName`，不会把本地路径传给服务端。

```bash
python /Users/agent/project/GeWeHub/plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "日报" \
  --desc "今日 AI 工程日报" \
  --file ./report.html
```

也可以从标准输入、直接内容或已有公网 URL 发送：

```bash
cat report.html | python /Users/agent/project/GeWeHub/plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "日报" \
  --stdin
```

成功输出是稳定 JSON，调用方应直接读取 `html_public_url`：

```json
{
  "success": true,
  "message_id": "msg_xxx",
  "send_request_id": "send_xxx",
  "status": "pending",
  "html_public_url": "https://gewehub.yunzxu.com/h/xxx",
  "html_page_id": "html_xxx",
  "html_hosted": true,
  "raw_response": {}
}
```

## Hermes metadata 发送 HTML

如果运行环境只能调用 Hermes 通用 `send()`，可以把 HTML 发送意图放在 `metadata.gewehub` 下。插件只在 `sendType` 明确为 `html` 时切换到 `client.send_html(...)`，普通 metadata 仍按文本发送：

```python
await platform.send(
    chat_id,
    "日报",
    metadata={
        "gewehub": {
            "sendType": "html",
            "htmlFilePath": "/tmp/report.html",
            "title": "日报",
            "desc": "今日 AI 工程日报",
            "thumbUrl": "https://example.com/cover.jpg",
            "requestId": "daily-report-2026-07-09"
        }
    }
)
```

HTML 内容源支持 `htmlFilePath`、`htmlContent`、`htmlContentBase64` 或 `linkUrl` 四选一。本地路径只给插件读取，服务端收到的仍是 Hub 标准 `type=html` 请求。

## 安装到 Hermes

用户插件需要显式启用，建议用软链接保持可更新：

```bash
mkdir -p ~/.hermes/plugins ~/.hermes/skills
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent ~/.hermes/plugins/gewehub-hermes-agent
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent/skill ~/.hermes/skills/gewehub-hermes-agent
```

Hermes 配置中加入：

```yaml
plugins:
  enabled:
    - gewehub-hermes-agent
```

## 本地验证

单测可用 `uv` 临时安装测试依赖运行：

```bash
uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML \
  python -m pytest plugins/hermes-agent/test_gewehub_plugin.py
```

联调前先启动本地 GeWeHub，并准备一个已绑定会话的 Hub 应用 token：

```bash
GEWEHUB_BASE_URL=http://localhost:8090 \
GEWEHUB_APP_TOKEN=<hub-app-token> \
hermes
```

联调验收至少覆盖：文本消息经 SSE 进入 Hermes、Hermes 回复走 `/api/send`、短文本按 metadata 防抖合并、重启后携带 `Last-Event-ID` 不重复处理、图片消息下载为本地媒体文件、本地媒体回复通过 Hub 生成可访问 URL。

## 边界

插件不做 GeWe 原始 payload 解析，不做富消息 prompt 渲染，不做 GeWeCenter 专有 diagnostics、interaction workflow 或 profile 管理。
不要把 Hermes 机器上的本地路径当作 URL 传给 GeWe；本地路径必须通过插件文件发送接口进入 Hub。
