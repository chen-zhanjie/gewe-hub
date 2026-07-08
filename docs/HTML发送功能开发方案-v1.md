# GeWeHub HTML 发送功能开发方案 v1

> 状态：待开发目标文档
> 日期：2026-07-08
> 目标：GeWeHub 对外提供 `type=html` 发送能力，内部托管 HTML 页面，最终通过 GeWe link 消息发送到微信。

## 一、背景与问题

现有 `/api/send` 已支持 `text/image/file/voice/video/link`。其中 `link` 会映射到 GeWe `/gewe/v2/api/message/postLink`，可以发送标题、描述、链接 URL 和缩略图。

HTML 页面需求本质不是“把 HTML 当文件发出去”，而是：

1. 调用方生成一段 HTML 内容或一个单文件 HTML。
2. GeWeHub 保存并托管这个 HTML。
3. GeWeHub 生成可公开访问的页面 URL。
4. 微信里实际收到的是链接卡片，点击后打开 GeWeHub 托管页面。

这样可以解决：

- AI/Hermes/Codex 生成富文本报告、图表页、说明页时，微信文本承载能力不足。
- 直接发送 `.html` 文件体验差，用户需要下载文件，不像链接卡片可直接点击。
- HTML 页面需要被 GeWeHub 统一存档、追踪、和发送记录关联。
- 后续 skill/tools/CLI 可以稳定调用一个标准能力，不需要每个调用方自己搭建网页托管。

## 二、核心产品决策

### 2.1 新增 GeWeHub 发送类型 `html`

GeWeHub 对外契约新增：

```json
{
  "conversationId": "conv_xxx",
  "type": "html",
  "title": "页面标题",
  "desc": "页面描述",
  "htmlContent": "<!doctype html><html>...</html>",
  "htmlFileName": "report.html"
}
```

也支持 base64：

```json
{
  "conversationId": "conv_xxx",
  "type": "html",
  "title": "页面标题",
  "desc": "页面描述",
  "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+...",
  "htmlFileName": "report.html"
}
```

也支持已经存在的 HTML URL：

```json
{
  "conversationId": "conv_xxx",
  "type": "html",
  "title": "页面标题",
  "desc": "页面描述",
  "linkUrl": "https://example.com/report.html"
}
```

规则：

- `type=link`：普通链接消息，不做 HTML 托管。
- `type=html`：HTML 页面消息。
- `type=html` 必须满足 `linkUrl`、`htmlContent`、`htmlContentBase64` 三选一。
- 如果传 `htmlContent/htmlContentBase64`，GeWeHub 先托管 HTML，再生成 `linkUrl`。
- 如果传 `linkUrl`，GeWeHub 不托管，只把它视作外部或已托管 HTML 页面链接。
- 服务端 `/api/send` 不接收调用方机器上的本地文件路径；本地路径只作为 CLI/tools 输入，由 CLI/tools 读取文件并转换为 `htmlContentBase64/htmlFileName` 后再调用 `/api/send`。
- 最终发送到 GeWe 时，`html` 和 `link` 都走 `/gewe/v2/api/message/postLink`。
- `send_requests.type` 保留 `html`，用于审计、前端展示、插件追踪。
- `type=html` 的 `/api/send` 成功响应必须包含最终公网访问链接，字段为 `htmlPublicUrl`，方便 AI 后续引用、复查或二次发送。

成功响应示例：

```json
{
  "id": "send_xxx",
  "status": "pending",
  "messageId": "msg_xxx",
  "htmlPublicUrl": "https://gewehub.yunzxu.com/h/xxx",
  "htmlPageId": "html_xxx",
  "htmlHosted": true
}
```

如果请求传的是 `linkUrl`，响应中 `htmlPublicUrl` 返回该 URL，`htmlHosted=false`，`htmlPageId=null`。

### 2.2 允许同源 JS

第一版明确允许 HTML 页面在 `https://gewehub.yunzxu.com/h/:token` 同源执行 JS。

第一版不做：

- 不做 HTML sanitize。
- 不做 CSP 限制。
- 不做 iframe sandbox。
- 不做独立子域隔离。
- 不禁止 script/form/fetch。

仍保留运行必需约束：

- 只支持单个 HTML 页面，不支持多文件站点。
- 文件路径由服务端生成，禁止使用用户传入路径。
- 设置 HTML 内容大小上限，避免请求体或落盘文件异常膨胀。
- 响应 `Content-Type: text/html; charset=utf-8`。
- 文件保存到已挂载的 `FILE_STORAGE_DIR`，生产部署后不丢失。

### 2.3 不修改 Hermes 本体

Hermes 本体暂不要求支持“发送 HTML”抽象。

插件端只需要接入 GeWeHub 的 `type=html` 接口，提供：

- Python client 方法：`GeWeHubClient.send_html(...)`
- 插件内可复用发送函数。
- 独立 CLI：可从命令行发送 HTML。
- skill 文档说明：后续 Codex/Hermes tools 可以通过 CLI 或 client 方法调用。

## 三、服务端设计

### 3.1 契约变更

修改 `packages/contracts/src/api.ts`：

- `sendRequestSchema.type` 增加 `"html"`。
- 增加字段：

```ts
htmlContent?: string;
htmlContentBase64?: string;
htmlFileName?: string;
```

- `type=html` 校验：
  - `linkUrl/htmlContent/htmlContentBase64` 三选一。
  - `title` 建议必填；如果不填，服务端可默认 `"HTML 页面"`。
  - `desc` 可选；不填时默认使用 `linkUrl` 或 `"HTML 页面"`。
- `sendResponseSchema` 增加 HTML 专用可选字段：

```ts
htmlPublicUrl?: string;
htmlPageId?: string | null;
htmlHosted?: boolean;
```

`type=html` 成功返回时必须带 `htmlPublicUrl`。其他发送类型不返回这几个字段。

标准消息结构 `packages/contracts/src/message.ts`：

- `messageNodeTypeSchema` 增加 `"html"`。
- `html` 消息可以复用 `link` 字段承载点击地址：

```json
{
  "type": "html",
  "text": "[HTML] 页面标题",
  "link": {
    "title": "页面标题",
    "desc": "页面描述",
    "url": "https://gewehub.yunzxu.com/h/xxx",
    "thumbnailUrl": "https://..."
  }
}
```

### 3.2 数据模型

新增 Prisma 模型：

```prisma
enum HtmlPageStatus {
  active
  archived
  deleted
}

model HtmlPage {
  id            String         @id @default(cuid())
  token         String         @unique
  title         String
  desc          String?        @db.Text
  fileName      String?        @map("file_name")
  storageKey    String         @map("storage_key")
  publicUrl     String         @db.Text @map("public_url")
  sizeBytes     Int            @map("size_bytes")
  sha256        String
  status        HtmlPageStatus @default(active)
  appId         String?        @map("app_id")
  accountId     String?        @map("account_id")
  conversationId String?       @map("conversation_id")
  sendRequestId String?        @unique @map("send_request_id")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  app           HubApp?        @relation(fields: [appId], references: [id])
  account       WechatAccount? @relation(fields: [accountId], references: [id])
  conversation  Conversation?  @relation(fields: [conversationId], references: [id])
  sendRequest   SendRequest?   @relation(fields: [sendRequestId], references: [id])

  @@index([conversationId, createdAt])
  @@index([appId, createdAt])
  @@map("html_pages")
}
```

说明：

- `token` 用于公开路由 `/h/:token`，不要暴露自增 ID。
- `storageKey` 是相对路径，例如 `html/20260708/{token}.html`。
- 读取文件时必须用 `FILE_STORAGE_DIR + storageKey` 解析，且校验结果仍在 `FILE_STORAGE_DIR` 内。
- 第一版不做自动过期；后续可加 `expiresAt/deletedAt/lastAccessedAt`。

### 3.3 HTML 托管模块

新增模块建议：

```text
server/src/modules/html-pages/
  html-pages.module.ts
  html-pages.controller.ts
  html-pages.service.ts
```

职责：

- `HtmlPagesService.createFromSendRequest(...)`
  - 接收 `title/desc/htmlContent/htmlContentBase64/htmlFileName`。
  - 解码 HTML。
  - 校验大小。
  - 生成 token。
  - 写入 `FILE_STORAGE_DIR/html/{yyyymmdd}/{token}.html`。
  - 创建 `HtmlPage` 记录。
  - 返回 `htmlPageId/publicUrl`。
- `HtmlPagesService.resolveForSend(...)`
  - 如果传 `htmlContent/htmlContentBase64`，创建托管页面并返回 `{ htmlPublicUrl, htmlPageId, htmlHosted: true }`。
  - 如果传 `linkUrl`，不落盘，直接返回 `{ htmlPublicUrl: linkUrl, htmlPageId: null, htmlHosted: false }`。
  - 该方法在 `/api/send` 接收阶段调用，保证接口响应能立即拿到公网访问链接。
- `HtmlPagesController.getPage(token)`
  - `GET /h/:token`
  - 查 `HtmlPage`。
  - 状态不是 `active` 返回 404。
  - 读取文件并返回 `text/html; charset=utf-8`。

公开路由：

- 在 `AdminAuthGuard.isPublicRoute()` 放行 `GET /h/:token`。
- 在 `deploy/nginx.conf` 里把 `/h/*` 反代到 server。
- 在本地 `deploy/Caddyfile` 或 compose 代理配置里同样支持 `/h/*`。

### 3.4 发送流程

修改 `server/src/modules/send/send-utils.ts`：

- `SendMappingInput.type` 增加 `"html"`。
- `type=html` 映射到 GeWe link path：

```ts
{
  path: "/gewe/v2/api/message/postLink",
  body: {
    appId,
    toWxid,
    title,
    desc,
    linkUrl,
    thumbUrl,
    thumbSource
  }
}
```

修改 `server/src/modules/send/send.controller.ts`：

- schema 接收 `html` 字段。
- `type=html` 时，在创建或返回 `send_requests` 前先调用 `HtmlPagesService.resolveForSend(...)`。
- 创建 `send_requests` 时把最终链接写入 `requestPayload.htmlPublicUrl`，并写入 `htmlPageId/htmlHosted`。
- 不建议把完整 `htmlContent/htmlContentBase64` 长期保存在 `send_requests.requestPayload`；HTML 正文以文件形式保存在 `FILE_STORAGE_DIR/html/...`，数据库只保留元数据和最终链接。
- 如果有 `idempotencyKey`，同现有逻辑复用。
- `/api/send` 响应在基础 `id/status/messageId` 外，追加 `htmlPublicUrl/htmlPageId/htmlHosted`。

修改 `server/src/modules/outbox/outbox.service.ts`：

- `prepareSendRequestForGewe()` 增加：

```ts
if (sendRequest.type === "html" && mapped.path === "/gewe/v2/api/message/postLink") {
  return this.prepareOutboundHtmlSend(sendRequest, mapped);
}
```

- `prepareOutboundHtmlSend()`：
  - 从 `sendRequest.requestPayload.htmlPublicUrl` 读取最终链接。
  - 如果缺少 `htmlPublicUrl`，说明历史数据或异常写入，应失败并记录明确错误，不在 outbox 阶段重新托管。
  - 处理缩略图逻辑复用 `prepareOutboundThumbnailUrl()`。
  - 返回 GeWe `postLink` body。
  - 返回本地 `MessageNode`：

```ts
{
  type: "html",
  text: `[HTML] ${title}`,
  link: {
    title,
    desc,
    url: finalLinkUrl,
    thumbnailUrl: thumbUrl
  }
}
```

幂等要求：

- 同一个 `idempotencyKey` 重试不能生成多个页面。
- `HtmlPage.sendRequestId` 唯一。
- `/api/send` 命中已有 `idempotencyKey` 时，直接从已有 `send_requests.requestPayload.htmlPublicUrl` 返回同一个链接。
- 如果首次请求是托管 HTML，`HtmlPage` 创建后要与 `sendRequestId` 绑定；如果事务内顺序不方便，可先创建 `send_requests`，再创建 `HtmlPage`，再回写 `requestPayload.htmlPublicUrl/htmlPageId/htmlHosted`，最后入 outbox。

### 3.5 大小上限

新增 env：

```text
HTML_PAGE_MAX_BYTES=5242880
```

第一版默认 5MB。原因是 HTML 走 JSON/base64，会占用请求体和磁盘；5MB 对 AI 生成报告、图表页、富文本说明更宽松，也能覆盖较复杂的单文件 HTML 页面。

如果后续要支持大型 HTML 或多资源页面，应单独做上传接口，不继续塞进 `/api/send` JSON。

## 四、管理端设计

管理端包含两层支持：工作台发送入口和 HTML 页面管理。

### 4.1 工作台发送入口

修改工作台 `MessageComposer`：

- 增加“HTML”按钮。
- 弹窗提供三种输入方式：
  1. HTML 内容：textarea。
  2. HTML 文件：选择单个 `.html/.htm` 文件，前端读成文本或 base64。
  3. 已有 URL：填写 URL。
- 表单字段：
  - 标题：必填或默认。
  - 描述：可选。
  - HTML 内容 / HTML 文件 / URL：三选一。
  - 缩略图：复用现有链接缩略图上传逻辑，可选。

发送时 payload：

```json
{
  "conversationId": "conv_xxx",
  "type": "html",
  "title": "页面标题",
  "desc": "页面描述",
  "htmlContent": "<!doctype html>..."
}
```

本地乐观消息：

- `LocalSendPayload.type` 增加 `"html"`。
- 本地气泡展示 `[HTML] 标题`。
- 消息节点使用 `type=html`，渲染上复用链接卡片样式，但标签显示“HTML”。

### 4.2 HTML 页面管理

新增管理页建议：`管理端 -> HTML 页面`。

第一版列表字段：

- 标题
- 描述
- URL
- 关联会话
- 关联发送请求
- 文件大小
- 状态
- 创建时间

操作：

- 复制 URL
- 打开页面
- 查看关联发送请求
- 归档页面

第一版不做在线编辑 HTML。原因：

- 发送出去的链接已经被用户收到，在线编辑会导致历史内容变化。
- v1 先保持“发送即快照”的审计语义。

如后续需要编辑，应新增版本号，而不是覆盖原文件。

## 五、插件端设计

插件端目标是接入 GeWeHub `type=html`，不要求 Hermes 本体支持 HTML 抽象。

### 5.1 Python client

修改 `plugins/hermes-agent/client.py`，新增：

```python
async def send_html(
    self,
    conversation_id: str,
    *,
    title: str,
    desc: str | None = None,
    html_content: str | None = None,
    html_content_base64: str | None = None,
    html_file_path: str | None = None,
    html_file_name: str | None = None,
    link_url: str | None = None,
    thumb_url: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    ...
```

行为：

- 如果传 `html_file_path`，读取文件内容并转成 base64。
- 如果传 `html_content`，直接传 `htmlContent`。
- 如果传 `html_content_base64`，直接传 `htmlContentBase64`。
- 如果传 `link_url`，传 `linkUrl`。
- 调 `/api/send`，body 的 `type` 固定为 `"html"`。

### 5.2 独立 CLI

新增文件建议：

```text
plugins/hermes-agent/cli.py
```

CLI 不依赖 Hermes 本体，只依赖插件目录里的 `GeWeHubClient`。

核心要求：CLI 必须支持传入本地 HTML 文件路径。目标使用方式是 AI/Codex 先把 HTML 写到本地文件，再通过 CLI 或未来 tools 直接发送该文件。CLI 负责读取本地文件，转成 `htmlContentBase64`，并把文件名作为 `htmlFileName` 发送给 GeWeHub。

命令形态：

```bash
python plugins/hermes-agent/cli.py send-html \
  --base-url https://gewehub.yunzxu.com \
  --app-token "$GEWEHUB_APP_TOKEN" \
  --conversation-id conv_xxx \
  --title "日报" \
  --desc "今日 AI 工程日报" \
  --file ./report.html
```

支持：

```bash
python plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "说明页" \
  --content '<!doctype html><html>...</html>'
```

也支持从 stdin：

```bash
cat report.html | python plugins/hermes-agent/cli.py send-html \
  --conversation-id conv_xxx \
  --title "日报" \
  --stdin
```

默认读取环境变量：

- `GEWEHUB_BASE_URL`
- `GEWEHUB_APP_TOKEN`

参数规则：

- `--file <path>`：读取本地 `.html/.htm` 文件，发送为 `htmlContentBase64/htmlFileName`。这是 AI/tools 的首选路径。
- `--content <html>`：直接发送命令行传入的 HTML 字符串。
- `--stdin`：从标准输入读取 HTML。
- `--url <url>`：发送已经托管好的 HTML URL，不读取本地文件。
- `--file`、`--content`、`--stdin`、`--url` 四选一。
- 本地文件路径只在 CLI 进程内使用，不进入服务端请求体。

输出稳定 JSON，便于 Codex skill/tools 调用：

```json
{
  "success": true,
  "message_id": "msg_xxx",
  "send_request_id": "send_xxx",
  "html_public_url": "https://gewehub.yunzxu.com/h/xxx",
  "html_page_id": "html_xxx",
  "html_hosted": true,
  "raw_response": {}
}
```

`html_public_url` 必须从 `/api/send` 响应的 `htmlPublicUrl` 映射而来。AI/Codex 后续需要引用页面时，直接读取这个字段，不需要解析 `raw_response`。

失败输出：

```json
{
  "success": false,
  "error": "..."
}
```

### 5.3 skill / tools 接入建议

当前插件已经有 `plugins/hermes-agent/skill/SKILL.md`，后续新增 HTML 发送说明：

- 当需要发送 HTML 页面时，优先使用 CLI。
- AI/Codex 生成 HTML 时，推荐先写入本地 `.html` 文件，再调用 `send-html --file <path>`。
- skill 不直接拼 GeWe API，只调用 GeWeHub CLI 或 client。
- Codex tools 若后续要封装，建议封装 CLI 的 `send-html --file` 能力，而不是重复实现 HTTP 逻辑。

第一版不强依赖“真正的 Hermes tool registry”。原因：

- 当前插件是 platform adapter，代码里已有 `standalone_sender_fn`，但没有独立 tool manifest。
- CLI 是最低成本、最稳定的工具边界。
- 后续如果 Hermes 插件体系支持工具注册，再把 `send-html --file/--stdin/--content/--url` 包成 tool 即可。

## 六、测试计划

### 6.1 Contracts

新增/修改：

- `packages/contracts/test/api-schema.test.ts`
- `packages/contracts/test/message-schema.test.ts`

覆盖：

- `type=html + htmlContent` 通过。
- `type=html + htmlContentBase64` 通过。
- `type=html + linkUrl` 通过。
- `type=html` 三个来源都没有时失败。
- `sendResponseSchema` 允许 `htmlPublicUrl/htmlPageId/htmlHosted`。
- `MessageNode.type=html` 通过。

### 6.2 服务端

新增测试：

- `server/test/html-pages-service.test.ts`
- `server/test/html-pages-controller.test.ts`
- `server/test/send-html-controller.test.ts`
- `server/test/outbox-send-html.test.ts`

覆盖：

- HTML 内容落盘到 `FILE_STORAGE_DIR/html/...`。
- `/h/:token` 返回 `text/html; charset=utf-8`。
- `/api/send type=html + htmlContent/htmlContentBase64` 响应包含 `htmlPublicUrl/htmlPageId/htmlHosted=true`。
- `/api/send type=html + linkUrl` 响应包含 `htmlPublicUrl=linkUrl/htmlHosted=false`。
- `type=html` 生成 `HtmlPage` 后映射为 GeWe `postLink`。
- 同一个 `sendRequestId/idempotencyKey` 重试复用同一 `HtmlPage`。
- `linkUrl` 模式不落盘。
- 超过 `HTML_PAGE_MAX_BYTES` 返回明确错误。

### 6.3 管理端

新增/修改：

- `web/src/features/workbench/WorkbenchComposer.test.tsx`
- `web/src/features/workbench/workbench-local-sends.test.ts`
- 新增 HTML 页面管理页测试。

覆盖：

- 工作台可以选择 HTML 文件并发送 `type=html`。
- 工作台可以输入 HTML 内容并发送。
- 工作台可以填写已有 URL 并发送 `type=html`。
- 本地乐观消息显示 `[HTML] 标题`。
- HTML 页面管理页可以复制 URL、打开页面、查看关联发送请求。

### 6.4 插件端

新增/修改：

- `plugins/hermes-agent/test_gewehub_plugin.py`

覆盖：

- `GeWeHubClient.send_html(... html_content=...)` 请求 `/api/send`，body 为 `type=html`。
- `send_html(... html_file_path=...)` 读取文件并发送 `htmlContentBase64/htmlFileName`。
- CLI `send-html --file ./report.html` 会读取本地文件路径，服务端收到 `htmlContentBase64/htmlFileName`，不会收到本地路径字符串。
- CLI `send-html --file` 输出成功 JSON，包含 `html_public_url`。
- CLI `send-html --stdin` 输出成功 JSON，包含 `html_public_url`。
- 错误响应不泄漏 app token。

## 七、开发顺序

建议按这个顺序开发，避免前后端互相阻塞：

1. Contracts：新增 `html` 类型和 schema 测试。
2. Prisma：新增 `HtmlPage` 模型和 migration。
3. 服务端 HtmlPagesModule：实现保存、读取、公开路由。
4. 服务端 send/outbox：实现 `/api/send` 先生成 `htmlPublicUrl`，再由 outbox 执行 `type=html -> postLink`。
5. 管理端工作台：新增 HTML 发送弹窗和本地消息展示。
6. 管理端 HTML 页面列表：用于运维和追踪。
7. 插件 client：新增 `send_html`。
8. 插件 CLI：新增 `send-html`。
9. 插件 skill 文档：写清楚 CLI 调用方式。
10. 全量验证和部署文档补充。

## 八、验收标准

开发完成后至少满足：

1. 管理端工作台可发送 HTML 内容。
2. 管理端工作台可上传单个 HTML 文件发送。
3. 插件 CLI 可发送 HTML 文件。
4. CLI/tools 支持传入本地 HTML 文件路径，AI 写好本地文件后可直接通过路径发送。
5. `/api/send` 支持 `type=html`。
6. HTML 页面保存到挂载目录，重启容器后仍可访问。
7. 微信实际收到链接卡片，标题/描述符合请求内容。
8. 点击链接能打开 `https://gewehub.yunzxu.com/h/:token`。
9. HTML 页面内同源 JS 可以执行。
10. 发送记录里保留 `type=html`。
11. 本地消息和历史消息展示为 HTML 类型，而不是普通 link。
12. `/api/send` 和 CLI 成功返回结果都包含 HTML 公网访问链接。

验证命令：

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML \
  python -m pytest plugins/hermes-agent/test_gewehub_plugin.py -q
```

## 九、v1 非目标

第一版不做：

- 多文件 HTML 站点。
- CSS/JS/图片资源包上传。
- HTML 在线编辑。
- HTML 版本管理。
- 页面访问统计。
- 页面过期清理。
- 独立子域。
- CSP/sandbox/sanitize。
- Hermes 本体 HTML 发送协议改造。
- GeWe API 新增原生 HTML 类型。

这些都可以作为 v2 扩展，不阻塞 v1 落地。

## 十、后续可扩展方向

后续可扩展：

- `HostedFile` 通用文件托管模型，支持 HTML、附件、公开资源统一管理。
- 页面访问日志和访问次数。
- HTML 页面版本管理。
- 通过 Codex MCP/tool 直接调用 `send-html`。
- HTML 模板库：日报、报告、确认页、表格页。
- AI 生成 HTML 后一键发送到指定会话。
- 可选独立域名承载 HTML 页面。
