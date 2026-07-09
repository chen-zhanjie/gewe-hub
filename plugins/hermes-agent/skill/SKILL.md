---
name: gewehub-hermes-agent
description: GeWeHub runtime delivery guidance for Hermes Agent conversations. Use when Hermes is running through the GeWeHub platform plugin and needs to receive GeWeHub SSE events or send text/image/file/voice/video/html replies through GeWeHub.
---

# GeWeHub Hermes Runtime

GeWeHub 是 Hermes 和 GeWe 之间的中台边界。插件只调用 GeWeHub 标准接口，不直连 GeWe，也不要求 Agent 层理解 GeWe 的 `thumbUrl`、`videoDuration`、Silk 转换等细节。

## 安装与启用

插件目录建议用软链接入 Hermes，方便跟随 GeWeHub 仓库更新：

```bash
mkdir -p ~/.hermes/plugins ~/.hermes/skills
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent ~/.hermes/plugins/gewehub-hermes-agent
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent/skill ~/.hermes/skills/gewehub-hermes-agent
```

Hermes 用户插件需要显式启用。在 Hermes 配置中加入：

```yaml
plugins:
  enabled:
    - gewehub-hermes-agent
```

## 必需配置

优先在当前 Hermes profile 的 `config.yaml` 中配置：

```yaml
platforms:
  gewehub:
    enabled: true
    extra:
      base_url: "https://gewehub.example.com"
      app_token: "hub_app_token"
```

也支持环境变量作为覆盖：

- `GEWEHUB_BASE_URL`: GeWeHub 的可访问地址，例如 `http://localhost:8080`。
- `GEWEHUB_APP_TOKEN`: GeWeHub 应用 token，用作 `Authorization: Bearer <token>`。

可选配置：

- `GEWEHUB_HOME_CONVERSATION_ID`: Hermes 主动通知默认会话。
- `GEWEHUB_DEBOUNCE_MS`: 默认文本合并窗口，事件 metadata 可覆盖。
- `GEWEHUB_MAX_WAIT_MS`: 默认文本合并最大等待时间，事件 metadata 可覆盖。

## 接收消息

- 插件通过 `GET /api/apps/events` 建立 SSE。
- 插件持久化 `Last-Event-ID` 并做本地短期去重。
- 收到可识别事件后先写本地 `Last-Event-ID`，并异步调用 `POST /api/apps/events/ack`。
- ACK 网络失败会后台短重试；最终失败只记录 warning，不影响 AI 处理、批处理或回复发送。

AI 处理消息时应优先使用 GeWeHub 标准化后的关键字段：`conversationId`、消息 ID、发送者 wxid/昵称、引用上下文、媒体路径、消息类型和 metadata。引用、@、媒体、链接卡片和 HTML 发送都依赖这些字段；不要只看正文文本后用 Markdown 或自然语言模拟平台能力。

## 发送消息

所有发送都走 GeWeHub `/api/send`：

- 文本：`type=text`，支持从 Hermes metadata 透传 `idempotency_key/request_id`、`mentions` 和 `replyToMessageId/reply_to_message_id`。
- 图片、文件、语音、视频本地文件：插件把文件读成 `contentBase64` 交给 Hub，由 Hub 写入 runtime 文件并生成可访问 URL。
- 图片、文件、视频公网 URL：插件把 URL 交给 Hub，Hub/GeWe 可直接访问时不需要再上传文件。
- 语音：Hub 负责转换 Silk 并补齐 GeWe 发送参数。
- 视频：插件不要求传封面或时长；本地视频文件进入 Hub 后可由 Hub 生成封面并补默认时长，公网 `http(s)` 视频 URL 可直接交给 GeWe。
- HTML 页面：使用 `type=html` 语义发送，Hub 托管后实际以链接卡片投递到 GeWe。成功响应里会返回公网访问链接。

不要把 Hermes 机器上的本地文件路径当作 URL 发给 GeWe；本地路径必须通过插件文件发送接口进入 Hub。

可调用工具时，统一优先使用 `gewehub_send_message` 发送消息。这个工具就是 GeWeHub `/api/send` 的 Agent 侧封装，参数名尽量保持 `/api/send` 一致：`conversationId`、`type`、`text`、`mediaUrl`、`fileUrl`、`contentBase64`、`title`、`desc`、`linkUrl`、`htmlContentBase64`、`mentions`、`replyToMessageId` 等都按 Hub 协议传。工具额外提供 `file` 和 `thumbFile` 两个本地文件便捷参数，会自动读取并补成 `/api/send` 需要的 base64 字段；不要给工具传 `base_url` 或 token。

调用 `gewehub_send_message` 就等同于已经发送了一条消息；不要再用普通文本重复发送同一内容。中途状态、进度提示、引用回复、媒体、链接和 HTML 优先走工具。

如果整轮任务只需要最后发送一次，final response 可以直接输出一个裸 JSON 对象作为 GeWeHub `/api/send` 消息协议；插件会解析 JSON 并调用统一发送逻辑。不要包 Markdown 代码块，不要在 JSON 前后加解释文字。常用形态：

```json
{"send": true, "type": "text", "text": "我看到了。", "replyToMessageId": "msg_xxx", "mentions": []}
```

如果最后一轮不需要再发送任何消息，输出：

```json
{"send": false, "content": "已通过工具发送，最终不再发送。"}
```

`content` 承载 AI 原本想作为最终回复留下的内部说明，不会发送到微信。

final response 不是 JSON 时，会按普通文本发送。

平台能力使用规则：

- 执行过程中需要发送用户可见消息时，能走 `gewehub_send_message` 就优先走工具；最终单条发送可用裸 JSON 协议。
- 需要引用/回复某条消息时，必须传 `replyToMessageId`；不要用 Markdown 引用块 `>`、复制原文、或“引用：...”这类纯文本模拟引用。
- 不要使用 `quote: true` 或让插件自动推断引用对象；只有显式传 `replyToMessageId` 时才引用，不传就不引用。
- 需要 @ 成员时，传 `mentions` wxid 数组；正文里可以保留可读的 `@昵称`。
- 需要发图片、文件、语音、视频、链接或 HTML 时，使用对应 `type` 和 `/api/send` 参数；不要把媒体或 HTML 降级成普通文本说明。
- 工具不可用或发送失败时，才发送极短失败说明；能调用工具时仍用 `gewehub_send_message(type=text)`，最终失败说明也可以用裸 JSON 文本消息表达。

## 长任务状态提示

如果判断任务会比较久，或执行中发现还需要较长时间，先发一条极短文本让对方知道已开始处理，例如“我看看。”、“我查一下。”或“稍等，我处理一下。”。

- 状态提示只发一次或少量关键节点，不要刷屏。
- 提示语要短，不要提前输出未确认结论。
- 可调用工具时，状态提示也优先用 `gewehub_send_message` 的 `type=text` 发送。
- 最终结果如果用 HTML 发送，仍按 HTML 规则处理：HTML 卡片是主消息，`title` 和 `desc` 承担说明，通常不要再补发长文本解释。

## 通用 send 的文本增强

Hermes 通用 `send(chat_id, content, metadata=...)` 默认是文本入口。需要引用消息或 @ 成员时，直接把 GeWeHub 发送参数放在 `metadata.gewehub` 下；插件会转成 Hub `/api/send` 的 `mentions` 和 `replyToMessageId`：

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

`mentions` 必须是 wxid 字符串数组；正文里仍应写出可读的 `@昵称`，方便人和 AI 都能看懂。第一版引用发送仅支持文本回复；如果同时做引用和 @，由 Hub 服务端生成引用消息，@ 的真实客户端提醒能力取决于 GeWe 对引用 appmsg 的支持。

## 发送 HTML

当 Agent、Codex 或工具需要发送 HTML 页面时，必须优先使用 GeWeHub 的 HTML 发送能力，不要把 HTML 正文降级成普通文本，也不要把 `.html` 当普通附件发送。

HTML 是主消息。只要已经决定或已经成功发送 HTML 页面，就减少普通文本消息发送：

- 能不额外发送文本就不发；不要再补发同内容摘要、长说明或附件占位消息。
- `title` 和 `desc` 要短但能表达意思，承担链接卡片里的最小解释职责；这样通常就不需要再发送普通文本说明。
- 只有发送失败、需要极短状态提示、或用户明确要求文本摘要时，才额外发送普通文本。
- 必须补发文本时保持一句短话，例如“HTML 页面已发送。”，不要重复 HTML 正文内容。

生成 HTML 页面时优先兼容手机访问，按微信内置浏览器里的窄屏阅读体验设计：

- 默认加入移动端 viewport：`<meta name="viewport" content="width=device-width, initial-scale=1">`。
- 优先使用单列、响应式布局，正文宽度、表格、图片和代码块都要能在 360px 左右屏宽内阅读。
- 关键内容放在首屏和页面上方；避免依赖鼠标 hover、复杂键盘操作、外部大资源或桌面宽屏才可用的布局。
- 桌面端兼容即可，不要为了桌面效果牺牲手机端可读性。

优先级：

1. 当前 Agent 可调用工具时，首选 `gewehub_send_message`，并传 `type=html`。参数尽量保持 `/api/send` 形态：`conversationId/type/title/desc/linkUrl|htmlContent|htmlContentBase64/thumbUrl/idempotencyKey`。需要发送本地 HTML 文件时可额外传便捷参数 `file`，工具会读取当前 Hermes profile 配置完成认证，并把文件转成 `htmlContentBase64/htmlFileName`。
2. 当前只能走 Hermes 平台 `send()` 时，使用 `metadata.gewehub.sendType=html` 触发插件内部 HTML 路由。
3. 脚本或手工调试时，使用 CLI `send-html`；CLI 默认读取当前 Hermes profile 配置，`--base-url/--app-key` 只作为显式覆盖。

工具调用参数形态：

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

本地路径只给插件读取，插件会转成 `htmlContentBase64/htmlFileName`，服务端不会收到本地路径。

CLI 示例：

```bash
python /Users/agent/project/GeWeHub/plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "日报" \
  --desc "今日 AI 工程日报" \
  --thumb-url "https://example.com/cover.jpg" \
  --file ./report.html
```

也支持从标准输入发送：

```bash
cat report.html | python /Users/agent/project/GeWeHub/plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "日报" \
  --stdin
```

成功输出是 JSON。后续需要引用页面时，直接读取顶层 `html_public_url` 字段；不要从 `raw_response` 里二次解析。

`--thumb-url` 可选，用于设置微信链接卡片缩略图；不传时由 GeWe 或客户端按默认链接卡片处理。

```json
{
  "success": true,
  "send_request_id": "send_xxx",
  "html_public_url": "https://gewehub.yunzxu.com/h/xxx",
  "html_hosted": true,
  "raw_response": {}
}
```

如果当前运行环境只能通过 Hermes 通用 `send(chat_id, content, metadata=...)` 回复，也可以用 GeWeHub metadata 触发插件内部 HTML 路由。插件会读取本地 HTML 文件并转调 `send_html`，Hub 标准 `/api/send` 协议仍保持 `type=html`，不会把本地路径传给服务端：

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

`metadata.gewehub.sendType` 必须显式为 `html` 才会触发 HTML 路由；普通 metadata 仍按文本发送。HTML 内容源支持 `htmlFilePath`、`htmlContent`、`htmlContentBase64` 或 `linkUrl` 四选一。

## 本地验证

```bash
uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML \
  python -m pytest /Users/agent/project/GeWeHub/plugins/hermes-agent/test_gewehub_plugin.py
```

真实 Hermes 抽象类烟测：

```bash
PYTHONPATH=/Users/agent/project/hermes-agent-pro/server \
/Users/agent/project/hermes-agent-pro/server/.venv/bin/python - <<'PY'
import importlib.util, sys
from pathlib import Path
plugin_dir = Path('/Users/agent/project/GeWeHub/plugins/hermes-agent')
name = 'gewehub_plugin_real_base_check'
spec = importlib.util.spec_from_file_location(name, plugin_dir / '__init__.py', submodule_search_locations=[str(plugin_dir)])
module = importlib.util.module_from_spec(spec)
sys.modules[name] = module
spec.loader.exec_module(module)
adapter = module.adapter.GeWeHubAdapter()
print('instantiate=ok')
print(adapter.get_chat_info)
PY
```
