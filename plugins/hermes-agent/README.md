# Hermes Agent 插件

本目录维护 GeWeHub 面向 Hermes Agent 的官方对接插件。第一版只消费 GeWeHub 标准消息，不直连 GeWe。

## 配置

必需：

- `GEWEHUB_BASE_URL`
- `GEWEHUB_APP_TOKEN`

可选：

- `GEWEHUB_HOME_CONVERSATION_ID`
- `GEWEHUB_DEBOUNCE_MS`
- `GEWEHUB_MAX_WAIT_MS`

## 第一版能力

- `GET /api/apps/events` SSE 长连接，`Authorization: Bearer <token>`。
- 持久化 `Last-Event-ID`，本地短期去重。
- 处理成功后 `POST /api/apps/events/ack`，请求体 `{ "eventIds": [] }`；ACK 失败只记录 warning，不中断已完成的消息处理。
- 标准信封映射为 Hermes 可消费消息字段。
- `message.revoked` 第一版仅记录并 ACK。
- 通过 `POST /api/send` 发送文本、图片、文件、语音、视频回复，并透传 Hermes metadata 中的 `idempotency_key/request_id`。
- 本地媒体文件会读成 `contentBase64` 交给 Hub，由 Hub 写入 runtime 并生成可访问 URL；公网 `http(s)` 媒体 URL 可直接交给 Hub/GeWe。
- 视频发送不要求插件传封面或时长；本地视频文件进入 Hub 后可由 Hub 生成封面并补默认时长，公网 `http(s)` 视频 URL 可直接交给 GeWe。

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

插件不做 GeWe 原始 payload 解析，不做富消息 prompt 渲染，不做 GeWeCenter 专有 diagnostics、HTML page、interaction workflow 或 profile 管理。
不要把 Hermes 机器上的本地路径当作 URL 传给 GeWe；本地路径必须通过插件文件发送接口进入 Hub。
