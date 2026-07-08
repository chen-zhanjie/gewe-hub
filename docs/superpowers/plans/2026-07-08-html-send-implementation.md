# HTML 发送功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/HTML发送功能开发方案-v1.md` 完成 `type=html` 发送、HTML 托管、管理端工作台/页面管理、Hermes 插件 client/CLI/skill 支持。

**Architecture:** GeWeHub 对外新增语义类型 `html`，`/api/send` 接收阶段先托管 HTML 并返回 `htmlPublicUrl`，outbox 阶段把 `html` 映射为 GeWe `postLink`。HTML 文件保存在 `FILE_STORAGE_DIR/html/...`，公开入口为 `/h/:token`，第一版允许同源 JS，不做 sanitize/CSP/sandbox。

**Tech Stack:** NestJS + Fastify + Prisma + MySQL，React + Vite + TanStack + Tailwind，Python Hermes 插件，Vitest + pytest。

---

## 文件结构

- `packages/contracts/src/api.ts`：`sendRequestSchema` 增加 `html` 输入和 `sendResponseSchema` 增加 HTML 返回字段。
- `packages/contracts/src/message.ts`：`MessageNode.type` 增加 `html`。
- `server/prisma/schema.prisma`：新增 `HtmlPageStatus` 和 `HtmlPage`，`SendRequest` 关联 `htmlPage`。
- `server/prisma/migrations/20260708050000_add_html_pages/migration.sql`：新增 `html_pages` 表和索引。
- `server/src/config/env.ts`：新增 `HTML_PAGE_MAX_BYTES=5242880`。
- `server/src/modules/html-pages/*`：托管 HTML 的 service/controller/module。
- `server/src/modules/send/send.controller.ts`：`type=html` 时先 resolve HTML 公网链接，再创建发送记录并返回 HTML 字段。
- `server/src/modules/send/send-utils.ts`：`html` 映射到 GeWe `postLink`。
- `server/src/modules/outbox/outbox.service.ts`：`type=html` 生成 HTML 本地消息节点，GeWe 仍发 link。
- `server/src/app.module.ts`、`server/src/common/admin-auth.guard.ts`、`server/src/modules/send/send.module.ts`、`server/src/modules/outbox/outbox.module.ts`：注册模块和公开路由。
- `web/src/features/workbench/*`、`web/src/lib/workspace-data.ts`：工作台新增 HTML 发送入口和本地消息类型。
- `web/src/features/admin/html-pages/*`、`web/src/components/layout/ConsoleShell.tsx`、`web/src/features/admin/AdminPages.tsx`、`web/src/routes/app-router.tsx`：新增 HTML 页面管理页。
- `plugins/hermes-agent/client.py`、`plugins/hermes-agent/cli.py`、`plugins/hermes-agent/skill/SKILL.md`、`plugins/hermes-agent/README.md`：插件 HTML client/CLI/文档。

## Task 1: Contracts

- [ ] 写 RED：`packages/contracts/test/message-schema.test.ts` 增加 `sendRequestSchema type=html`、三选一校验、`sendResponseSchema.htmlPublicUrl`、`messageNodeSchema.type=html`。
- [ ] 运行：`pnpm --filter @gewehub/contracts test -- message-schema.test.ts`，确认失败原因是 `html` 未被 schema 接受。
- [ ] 实现：更新 `packages/contracts/src/api.ts` 和 `packages/contracts/src/message.ts`。
- [ ] 运行同一测试确认通过。

## Task 2: Server HTML 托管

- [ ] 写 RED：新增 `server/test/html-pages-service.test.ts`，覆盖 `htmlContent/htmlContentBase64` 落盘、5MB 上限、`linkUrl` 不落盘。
- [ ] 写 RED：新增 `server/test/html-pages-controller.test.ts`，覆盖 `/h/:token` 返回 `text/html; charset=utf-8` 和 inactive/deleted 404。
- [ ] 运行：`pnpm --filter @gewehub/server test -- html-pages`，确认模块缺失失败。
- [ ] 实现：新增 Prisma 模型、migration、env、`HtmlPagesModule/Service/Controller`，公开 `/h/:token`。
- [ ] 运行 HTML pages 测试确认通过。

## Task 3: Server 发送链路

- [ ] 写 RED：扩展 `server/test/send-controller.test.ts`，覆盖 `type=html + htmlContent/htmlContentBase64/linkUrl` 创建发送记录并返回 `htmlPublicUrl/htmlPageId/htmlHosted`。
- [ ] 写 RED：扩展/新增 `server/test/outbox-send-html.test.ts`，覆盖 outbox 读取 `requestPayload.htmlPublicUrl`，GeWe 调 `postLink`，本地消息为 `type=html`。
- [ ] 运行：`pnpm --filter @gewehub/server test -- send-controller outbox-send`，确认失败。
- [ ] 实现：`send.controller.ts` 注入 `HtmlPagesService`，`send-utils.ts` 支持 `html`，`outbox.service.ts` 支持 HTML 本地节点。
- [ ] 运行同一测试确认通过。

## Task 4: Web 工作台

- [ ] 写 RED：扩展 `web/src/features/workbench/WorkbenchComposer.test.tsx`，覆盖 HTML 弹窗可发送 HTML 内容、单个 `.html/.htm` 文件和已有 URL。
- [ ] 写 RED：扩展 `web/src/features/workbench/workbench-local-sends.test.ts`，覆盖本地 `html` 消息显示 `[HTML] 标题` 且不是普通 link。
- [ ] 运行：`pnpm --filter @gewehub/web test -- WorkbenchComposer workbench-local-sends`，确认失败。
- [ ] 实现：更新工作台 controller/query/local send types 和 `MessageComposer.tsx`。
- [ ] 运行同一测试确认通过。

## Task 5: Web HTML 页面管理

- [ ] 写 RED：新增/扩展 admin 测试，覆盖导航出现“HTML 页面”，页面列表可复制 URL、打开页面、查看关联发送请求。
- [ ] 运行：`pnpm --filter @gewehub/web test -- AdminPages`，确认失败。
- [ ] 实现：新增 `HtmlPagesPage`、查询函数、路由和侧边栏入口。
- [ ] 运行同一测试确认通过。

## Task 6: Hermes 插件和 CLI

- [ ] 写 RED：扩展 `plugins/hermes-agent/test_gewehub_plugin.py`，覆盖 `GeWeHubClient.send_html` 的 content/file/url 三种输入和 CLI `send-html --file/--stdin` 输出 `html_public_url`。
- [ ] 运行：`uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML python -m pytest plugins/hermes-agent/test_gewehub_plugin.py -q`，确认失败。
- [ ] 实现：`client.py` 新增 `send_html`，新增 `cli.py`，更新 skill/README。
- [ ] 运行插件测试确认通过。

## Task 7: 集成验证

- [ ] 运行 contracts/server/web/plugin 目标测试。
- [ ] 运行 `pnpm typecheck`、`pnpm build`、`pnpm lint`。
- [ ] 运行 Prisma schema/migration 相关测试。
- [ ] 检查 `git diff --check`。
- [ ] 根据 `docs/HTML发送功能开发方案-v1.md` 做逐条验收审计。
