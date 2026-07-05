# GeWeHub 项目说明

GeWeHub 是新一代 GeWe 消息与智能会话中台，中文名暂定为“个微中枢”。

项目定位是专门对接 GeWe 平台，提供消息接入、消息存储、消息标准化、下游推送、消息管理、仿微信聊天页面、运行观测和后续 AI 会话接入能力。

GeWeHub 不是 GeWeCenter 的外层管理壳，也不是 Hermes 插件。GeWeCenter 是重要参考项目，GeWeHub 要吸收它在 GeWe 接入、消息结构、SSE 投递、发送接口、交互链接和管理后台上的经验，但用新的技术栈重新实现中台本体。

Hermes、Codex、OpenAI、Dify、OpenClaw 或其他远端/本地智能体都应被视为后续可接入的 AI 能力提供方，不应绑死在项目主架构或项目命名里。

GeWeHub 默认维护面向 Hermes Agent 的官方对接插件，方便 Hermes Agent 通过标准插件接收 GeWeHub 消息、发送回复、处理交互动作和对接知识库。后续如果需要支持 OpenClaw 或其他 Agent/自动化平台，也应通过独立插件包扩展，而不是把第三方平台逻辑写死进中台核心。

## 开发准则

- 使用最佳实践、最优开发、最佳路线。
- 若任务可拆成互不耦合的部分，应使用多智能体并行调研或开发。
- 运用第一性原理，拒绝经验主义和路径盲从。
- 不要假设需求目标已经完全清楚；若动机或目标模糊，应先停下讨论。
- 若当前路径不是更短、更低成本、更长期稳健的路线，应直接指出并建议替代方案。
- 文档文件尽量使用中文。

## 核心边界

GeWeHub 直接承担 GeWe 消息主链路:

```text
GeWe 平台
  -> GeWeHub
    -> 原始回调记录
    -> 消息去重
    -> 标准消息结构
    -> 会话、联系人、群、群成员
    -> 消息路由和下游推送
    -> 统一发送接口
    -> 仿微信聊天工作台
    -> 管理后台和运行观测
    -> Hermes / Codex / AI 服务 / Webhook / 其他应用
```

GeWeHub 应自己接收 GeWe webhook，自己保存消息，自己维护标准化后的消息结构，自己对下游提供稳定推送和发送接口。

GeWeCenter 只作为参考，不作为运行依赖。除非明确进入迁移期，否则 GeWeHub 的核心数据模型、接口和前端体验应按新项目重新设计。

## 首期目标

第一版产品边界详见 `docs/产品形态-v1.md`，与本节冲突时以该文档为准。

MVP 先跑通一条完整消息闭环:

1. 管理 GeWe 接入和账号。
   - 第一版单 GeWe 应用 key，env 配置（如 `GEWE_TOKEN`），不做在线更换和多 key 管理。
   - 回调 URL 带随机 secret 防伪造，后台「接入设置」提供“一键设置回调”和复制 URL 手动配置。
   - GeWe 侧“应用/key”只是接入凭证，不作为业务概念；业务层以微信账号（wxid）为核心。
   - 微信账号支持回调自动发现和手动录入，记录均可编辑；保存 appId、wxid、昵称、头像、登录状态等信息。
   - 数据模型天然多账号，UI 首版默认单账号视图并支持切换。

2. 接收 GeWe webhook。
   - 保存原始 payload。
   - 使用稳定 dedupe key 去重，优先参考 `appId + newMsgId`。
   - 所有原始数据仅在平台内部保存，不直接暴露给 AI 或普通下游。

3. 标准化消息。
   - 标准消息结构详见 `docs/标准消息结构-v1.md`（递归 MessageNode、类型枚举、GeWe 映射表、解析陷阱清单）。
   - 至少覆盖文本、图片、语音、视频、文件、emoji、链接、小程序、引用、合并转发；已知类型独立 type，未知归 `unsupported` + `rawType`。
   - 保留 `raw / normalized / rendered` 三层思想：原始层用于追溯，标准层用于系统处理，`renderedText` 用于展示。
   - 标准消息带 `status` 字段；撤回是状态变更（`revoked` + 撤回事件入库 + 向下游推送 `message.revoked` 事件），原消息内容完整保留，不删除。

4. 管理会话和消息。
   - 区分私聊和群聊。
   - 记录会话、联系人、群、群成员、最近消息、未读/状态等信息。
   - 软状态模型：联系人/群/群成员/会话只做 upsert + 状态标记（如 `left`/`removed`/`deleted`），禁止物理删除；状态变更留时间戳；状态来源为回调事件 + 定时同步 diff 兜底。
   - 选择类交互（选联系人、选群成员）数据源来自平台本地数据，不实时查询 GeWe API；非 active 对象灰显展示不消失。
   - 提供仿微信聊天页面，支持查看消息、搜索、筛选和基础发送。

5. 下游推送。
   - 首期优先支持 SSE 长连接推送，`Last-Event-ID` 断点续传 + 显式 ACK。
   - 逐条投递：一条事件一条标准消息，不做批量事件。
   - 顺序保证：per-conversation 有序（上一条处理完才投下一条），跨会话并行；不等 ACK 阻塞后续。
   - 媒体下载完成才投递，不做先投后补。
   - 会话级防抖（debounceMs/maxWaitMs）：配置在 GeWeHub、随 metadata 下发，防抖执行在 Hermes 插件侧。
   - 预留 Webhook 推送。
   - 下游只接收标准消息，不依赖 GeWe 原始字段。
   - 推送需要有状态记录、失败原因、重试/补偿或 ACK 机制。

6. 统一发送接口。
   - 下游应用通过 GeWeHub 标准接口发送消息。
   - GeWeHub 负责转换为 GeWe 平台接口。
   - 首期至少支持文本、图片、文件。
   - 所有发送请求必须记录请求、响应、目标会话、状态和失败原因。
   - 如果 GeWe 发送接口不产生回调，GeWeHub 需要主动生成本地消息记录。

7. 应用和路由。
   - 应用是一个下游消费者，可以是 Hermes profile、Codex API 服务、Webhook 服务或内部业务系统。
   - 首期路由模型：一个会话最多绑定一个应用；未绑定会话只入库不投递；改绑需显式解绑/转移。
   - 应用可跨微信账号绑定会话（应用:微信账号多对多）；标准消息携带接收微信上下文（wxid、昵称、备注）。
   - 绑定后默认全量投递该会话消息；“是否处理”交给下游判断，标准消息携带 `is_at_me`、`mentions[]` 等 @ 元数据。
   - 会话绑定提供可选投递过滤器（全部消息/仅 @ 机器人），为简单下游兜底。
   - 提供按会话/消息 ID 翻页的聊天记录查询接口，供下游拉取历史上下文。
   - 每个应用配置单主人联系人和主渠道；多主人首期不做。
   - 备注模型：会话备注、会话内成员备注只有平台级（会话:应用 1:1，无视角冲突）；微信账号备注分平台级 + 应用级（账号:应用多对多），投递时应用级优先、回落平台级。
   - 每条消息记录投递时命中的应用，历史归属可追溯。

8. 官方对接插件。
   - 默认维护 `plugins/hermes-agent/`，作为 Hermes Agent 对接 GeWeHub 的官方插件。
   - 插件负责连接 GeWeHub 下游接口、消费 SSE/Webhook 事件、转换为 Hermes 可理解的消息事件，并通过 GeWeHub 标准发送接口回复消息。
   - 插件不直接调用 GeWe 平台，也不依赖 GeWe 原始 payload。
   - 后续可在 `plugins/` 下增加 OpenClaw、Dify、其他 Agent 或自动化平台插件。

9. 运行观测。
   - 管理 GeWe webhook 事件、消息标准化状态、推送状态、发送记录、下游连接状态。
   - 提供诊断信息，方便判断是 GeWe 接入问题、消息处理问题、推送问题还是下游 AI 服务问题。

10. AI 接入预留。
   - Hermes、Codex、OpenAI、Dify 等只作为下游能力。
   - AI 负责理解消息、生成回复、工具调用、知识库问答和客服自动化。
   - GeWeHub 负责消息、会话、权限、路由、发送、审计和可观测性。

## 非目标

首期不要做以下事情:

- 不把 GeWeHub 做成 GeWeCenter 的皮肤或外层壳。
- 不把项目命名、数据模型或主架构绑定到 Hermes；Hermes Agent 是默认官方插件目标，不是中台核心的唯一目标。
- 不让 AI 服务直接依赖 GeWe 原始 payload。
- 不在首期追求完整 CRM、工单系统或复杂客服排班。
- 不为了复用旧项目而继承 MineAdmin/PHP 技术包袱。
- 不把 mobile 端提前做成主线；先预留目录和接口边界。

## 推荐仓库结构

根目录作为一个仓库，建议结构:

```text
GeWeHub/
  AGENT.md
  README.md
  .gitignore
  server/
  web/
  mobile/
  plugins/
  docs/
  design/
  references/
  deploy/
  scripts/
```

目录约定:

- `server/`: 服务端代码。
- `web/`: Web 管理后台和聊天工作台。
- `mobile/`: 后续移动端代码，首期可为空或不创建。
- `plugins/`: 官方维护的下游平台插件，例如 Hermes Agent、OpenClaw 或其他 Agent/自动化平台适配插件。
- `docs/`: 中文优先的产品设计、接口文档、消息结构、部署文档。
- `design/`: 设计稿、原型、截图、视觉资料。
- `references/`: 参考项目存放目录，例如 GeWeCenter、NewAPI、Hermes 相关代码或文档；该目录不纳入 git。
- `deploy/`: 部署、容器、反向代理、运维配置。
- `scripts/`: 本地开发和维护脚本。

`references/` 应写入 `.gitignore`，避免把参考项目或第三方源码提交进 GeWeHub 仓库。

## 技术路线原则

后端不再优先使用 PHP/MineAdmin。可优先评估:

- Node.js/TypeScript 后端，例如 NestJS、Fastify 或 Hono。
- PostgreSQL 作为主数据库。
- Redis 用于连接状态、队列、锁、缓存和临时事件状态。
- 队列用于 webhook 异步处理、下游投递、发送任务和重试。
- OpenAPI 或类似方式维护接口契约。

前端可参考 NewAPI default 的现代控制台体验，但不直接复制代码:

- React + TypeScript。
- Tailwind CSS + shadcn/Base UI 风格组件。
- TanStack Query / Router / Table / Virtual 等现代前端基础设施。
- 模块按业务域拆分，例如 dashboard、accounts、conversations、messages、apps、routes、deliveries、send-requests、settings。
- 管理页面重视表格、筛选、状态 Badge、详情抽屉、确认弹窗、复制按钮、错误和空状态。
- 聊天页面优先按工作台设计，而不是传统 CRUD 页面。

## 参考项目使用规则

GeWeCenter:

- 参考它的业务经验、消息链路、API 契约、消息 schema、SSE/ACK、发送记录、交互链接和管理后台信息架构。
- 不直接继承 MineAdmin/PHP 技术路线。
- 不把 GeWeCenter 作为运行依赖。

NewAPI default:

- 参考现代控制台的信息架构、布局、表格体验、主题系统和模块组织。
- 不直接照搬其业务代码。

Hermes:

- 参考它作为 AI Agent/知识库/自动回复能力提供方的接入方式。
- 默认维护 `plugins/hermes-agent/` 官方插件，降低 Hermes Agent 对接成本。
- 不把 Hermes 作为 GeWeHub 的主架构前提，也不让中台核心依赖 Hermes 内部实现。

OpenClaw 和其他平台:

- 未来如需支持，应在 `plugins/` 下以独立插件包维护。
- 每个插件只适配对应下游平台，不反向污染 GeWeHub 核心消息模型。

## 架构判断准则

当功能边界不清楚时，按下面问题判断归属:

- 是否和 GeWe 原始接入、消息入库、去重、标准化、会话、发送、推送、审计有关？如果是，属于 GeWeHub。
- 是否和某个下游 AI/Agent 平台的协议、事件格式、插件生命周期、配置方式有关？如果是，优先放入 `plugins/<platform>/`。
- 是否和消息理解、回复生成、知识库检索、工具调用、自动客服策略有关？如果是，属于 AI 能力提供方。
- 是否只是后台页面体验、表格、配置向导或可观测性？如果是，属于 GeWeHub 前端产品层。
- 是否只是旧项目里已有但不符合新项目长期路线的实现？如果是，只参考，不盲从。

## 当前决策

- 项目名: `GeWeHub`
- 中文名: `个微中枢`
- 定位: 新一代 GeWe 消息与智能会话中台
- 路线: 方案 A，替代 GeWeCenter 的新一代 GeWe 中台
- 参考: GeWeCenter 的业务契约 + NewAPI default 的现代前端体验
- AI: Hermes/Codex/OpenAI/Dify/OpenClaw 等作为下游能力提供方接入
- 插件: 默认维护 Hermes Agent 官方插件，后续按需增加其他平台插件
- 第一版产品边界: 见 `docs/产品形态-v1.md`（2026-07-05 定稿）
  - 单 GeWe 应用 key，env 配置；回调 URL 带 secret；账号自动发现 + 手动录入且可编辑
  - GeWe 应用概念不进业务层，业务层以微信账号（wxid）为核心
  - 一个会话最多绑定一个应用，未绑定只入库不投递；应用可跨微信绑定会话
  - 绑定后默认全量投递，@ 元数据随标准消息下发，是否处理由下游决定（可选“仅 @”过滤器兜底）
  - 备注：会话/成员备注仅平台级；微信账号备注平台级 + 应用级
  - 数据原则：同步类数据软状态（upsert + 状态标记，禁物理删除）；消息可修订（撤回为状态非删除，状态事件推送下游）
  - 消息结构：递归 MessageNode 嵌套（见 `docs/标准消息结构-v1.md`）
  - 投递：SSE 逐条投递（无批量事件）；per-conversation 有序；媒体下载完才投递；会话级防抖配置在 Hub、执行在 Hermes 插件
  - 单主人；SSE 优先推送
  - 单管理员（账密 env，密码存 hash），不做多用户/RBAC
  - 首页为仿微信聊天工作台；只接 GeWe API，不做通道抽象
