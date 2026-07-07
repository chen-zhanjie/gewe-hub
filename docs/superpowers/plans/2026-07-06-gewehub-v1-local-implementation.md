# GeWeHub V1 Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/开发计划-v1.md` 完成第一版本地可运行闭环，不执行线上部署。

**Architecture:** Monorepo 使用 pnpm workspace。`packages/contracts` 作为标准消息与 API 契约来源；`server` 使用 NestJS + Fastify + Prisma + MySQL + Redis，内置 interval outbox worker；`web` 使用 React + Vite + TanStack + Tailwind/shadcn 风格组件；`plugins/hermes-agent` 提供精简 Python Hermes 插件。

**Tech Stack:** Node.js 25 / TypeScript / NestJS / Prisma / MySQL 8 / Redis / React / Vite / Vitest / Python 3.

---

### Task 1: M0 Monorepo 基线

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/contracts/package.json`
- Create: `server/package.json`
- Create: `web/package.json`

- [ ] **Step 1: 写 workspace 文件**
  - 根 package 只负责聚合脚本。
  - workspace 包括 `packages/*`、`server`、`web`。

- [ ] **Step 2: 安装依赖**
  - Run: `PNPM_HOME=/Users/agent/.cache/codex-runtimes/codex-primary-runtime/dependencies /Users/agent/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm install`
  - Expected: lockfile 生成，依赖安装完成。

- [ ] **Step 3: 建立初始测试命令**
  - Run: `pnpm test`
  - Expected: 初期无测试或基础测试通过。

### Task 2: 共享契约

**Files:**
- Create: `packages/contracts/src/message.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/scripts/generate-json-schema.ts`
- Create: `packages/contracts/test/message-schema.test.ts`

- [ ] **Step 1: 先写 schema 测试**
  - 覆盖 text 信封、revoked 事件、无效 type 拒绝、messageId 字符串。

- [ ] **Step 2: 实现 zod schema 与 TS 类型**
  - 集中导出 MessageNode type enum、标准信封、ACK、send、错误格式。

- [ ] **Step 3: 导出 JSON Schema**
  - Run: `pnpm --filter @gewehub/contracts generate:schema`
  - Expected: `dist/json-schema/*.json` 生成。

### Task 3: Server 基线与 M1 链路

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/src/main.ts`
- Create: `server/src/app.module.ts`
- Create: `server/src/config/*`
- Create: `server/src/modules/auth/*`
- Create: `server/src/modules/gewe/*`
- Create: `server/src/modules/outbox/*`
- Create: `server/src/modules/observability/*`
- Create: `server/src/modules/normalizer/*`
- Create: `server/test/*`

- [ ] **Step 1: 先写 health/auth/webhook/outbox 测试**
  - 测试 secret 失败 404、secret 正确入库并去重、错误密码拒绝、outbox retry。

- [ ] **Step 2: 实现 NestJS/Fastify app**
  - `/api/health` 返回 `{ ok: true }`。
  - zod env 校验读取 `.env`。

- [ ] **Step 3: 实现 Prisma schema**
  - 覆盖开发计划第二节所有表和关键索引。

- [ ] **Step 4: 实现 auth/webhook/outbox/gewe client**
  - 单管理员 bcrypt hash。
  - webhook 3 秒内写 raw event + outbox task。
  - outbox interval worker 支持 lease、retry、dead。

### Task 4: Server M2-M3 核心闭环

**Files:**
- Modify: `server/src/modules/normalizer/*`
- Modify: `server/src/modules/messages/*`
- Modify: `server/src/modules/accounts/*`
- Modify: `server/src/modules/conversations/*`
- Modify: `server/src/modules/media/*`
- Modify: `server/src/modules/apps/*`
- Modify: `server/src/modules/delivery/*`
- Modify: `server/src/modules/send/*`

- [ ] **Step 1: 先写 parser fixture 测试**
  - 使用 `references/gewe-raw-samples/2026-07-05-production` 代表样本。
  - 覆盖 TEXT、IMAGE、VOICE、VIDEO、FILE、EMOJI、LINK、MINI_PROGRAM、QUOTE、CHAT_RECORD、SYSTEM、APP_MSG skip。

- [ ] **Step 2: 实现 parser 策略类**
  - 每种类型独立文件，公共 XML/JSON/ID/时间工具集中。

- [ ] **Step 3: 实现 process_webhook handler**
  - 自动发现账号、upsert 会话、标准消息入库、撤回修订、delivery 生成。

- [ ] **Step 4: 实现 apps/delivery/send API**
  - SSE Bearer token、ACK、Last-Event-ID 补发、后台/admin 内部 SSE。
  - send_requests 记录、GeWe client send 方法、本地 hub_send 消息。

### Task 5: Web 工作台

**Files:**
- Create: `web/src/*`
- Create: `web/src/features/*`
- Create: `web/src/components/*`

- [ ] **Step 1: 先写组件基础测试**
  - StatusBadge、MessageNodeView、TimeText、API error 解析。

- [ ] **Step 2: 实现登录和全局布局**
  - 侧栏、顶栏、浅色 token，符合 `docs/前端规范-v1.md`。

- [ ] **Step 3: 实现聊天工作台**
  - 三栏、会话列表、消息气泡递归渲染、详情调试、发送框。

- [ ] **Step 4: 实现管理页**
  - 应用管理、接入设置、推送日志、发送记录、运行观测。

### Task 6: Hermes Agent 插件

**Files:**
- Create: `plugins/hermes-agent/plugin.yaml`
- Create: `plugins/hermes-agent/client.py`
- Create: `plugins/hermes-agent/adapter.py`
- Create: `plugins/hermes-agent/normalizer.py`
- Create: `plugins/hermes-agent/dedupe.py`
- Create: `plugins/hermes-agent/state.py`
- Modify: `plugins/hermes-agent/README.md`

- [ ] **Step 1: 先写 Python 单测**
  - SSE event parse、Last-Event-ID state、dedupe、debounce、send payload。

- [ ] **Step 2: 参考 gewecenter-platform 精简实现**
  - 改为 GeWeHub API 路径和标准信封字段。
  - 去除 GeWeCenter 专有 interaction/html 页面逻辑。

### Task 7: Docker、本地验收与文档

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `server/Dockerfile`
- Create: `web/Dockerfile`
- Create: `web/nginx.conf`
- Create: `deploy/README.md`
- Create: `scripts/smoke-test.sh`

- [ ] **Step 1: 本地命令验证**
  - Run: `pnpm test`
  - Run: `pnpm build`
  - Run: `pnpm lint`

- [ ] **Step 2: Compose 验证**
  - Run: `/Applications/Docker.app/Contents/Resources/bin/docker compose -f deploy/docker-compose.yml up --build`
  - Expected: mysql、redis、server、web 健康启动，`GET /api/health` 返回 ok。

- [ ] **Step 3: 样本冒烟**
  - Run: `scripts/smoke-test.sh`
  - Expected: 登录、重放样本、查询消息、SSE/ACK 基础链路通过。
