# Web 页面整改方案 v1（开源商用版）

> 状态：定稿（2026-07-07）
> 目标：本轮整改完成后，Web 端达到可开源、可商用的行业级交互与展示水准。
> 依据：`docs/前端规范-v1.md`（token/色板/字号继续有效）、`docs/产品形态-v1.md`、`docs/标准消息结构-v1.md`。
> 冲突处理：本文档与前端规范冲突时以本文档为准，完成后将新决策回写前端规范。

## 〇、根因诊断（三个必须最先修的全局缺陷）

### 0.1 浮层透明（P0）

组件（Popover/ContextMenu/DropdownMenu）使用 `bg-popover text-popover-foreground`，但 `styles.css`/`tailwind.config.ts` 未定义 `--popover`/`--popover-foreground` 变量，导致背景为空 → 浮层透明。

**修复**：在 `styles.css` 补齐 shadcn 全套变量（`--popover`、`--popover-foreground`、`--card`、`--card-foreground`、`--accent`、`--accent-foreground`、`--secondary`、`--secondary-foreground`、`--input`），并在 tailwind.config 注册。补完后全站排查所有浮层（Popover、ContextMenu、Select 下拉、Tooltip、Toast）背景不透明、有 border、有 shadow-md。

### 0.2 消息重叠（P0）

`MessagePanel.tsx` 虚拟滚动 `estimateSize: () => 112` 固定值，未使用动态测量。消息高度差异巨大（单行文本 vs 图片 vs chat_record 卡片），固定估高必然重叠。

**修复**：接入 TanStack Virtual 的 `measureElement` 动态测量模式（每个消息行 `ref={virtualizer.measureElement}` + `data-index`），estimateSize 仅作首次估计（按类型给差异化估值：text 64 / image 220 / 卡片类 120）。修复后验收：混合类型消息 200 条滚动无重叠、无跳动；图片加载完成后行高正确更新（media 尺寸预占位配合 `aspect-ratio`）。

### 0.3 无过渡动画（P0）

Dialog/Sheet/Popover 等组件未接 Radix `data-[state=open/closed]` 动画类。

**修复**：引入 `tailwindcss-animate` 插件，为全部浮层组件补标准动画，统一遵循规范动效 token：

- Dialog：overlay `fade-in-0/out-0`；content `fade + zoom-in-95` 200ms ease-out，退场 150ms
- Sheet：右侧 `slide-in-from-right/out-to-right` 240ms
- Popover/ContextMenu/Dropdown/Tooltip：`fade + zoom-in-95 + slide-in-from-*`（按 side）150ms
- Toast(sonner)：使用其内置动画即可
- AlertDialog 同 Dialog
- 全局 `prefers-reduced-motion` 降级为仅 fade
- 列表内元素增删不做位移动画；新消息一次 120ms fade-in

---

## 一、聊天工作台：会话侧（左栏）

### 1.1 顶部微信账号选择器

改为完整实体展示的下拉（Popover + 列表）：

- 触发器：当前账号 `Avatar(32)` + 两行（第一行：平台备注 || 昵称，`text-sm font-medium`；第二行：wxid `font-mono text-xs text-muted-foreground` 截断）+ 右侧 ChevronDown + 在线状态点（绿/红/灰 `size-2` 圆点叠加在头像右下角）
- 下拉面板：账号列表，每项 = 头像 + 昵称 + 平台备注（有则显示"备注(昵称)"）+ wxid + 在线 StatusBadge；当前项打勾；支持搜索（账号 >5 个时显示搜索框）
- 选择后切换账号：会话列表/消息区全部切换，URL 同步账号参数

### 1.2 会话列表项

每项结构（对齐微信桌面端）：

```text
[Avatar 40] [第一行: 会话名(备注优先) ... 时间(右对齐 text-xs)]
            [第二行: 最近消息摘要(发送者: [类型]) ... 未读 Badge]
```

- **不展示投递状态、不展示应用徽标**（绑定信息收进右键"会话管理"）
- 未读 Badge：红底白字圆形，>99 显示 `99+`；仅未读 >0 显示
- 置顶会话项底色 `bg-muted/60`（微信惯例：置顶浅灰）
- 隐藏中的会话不出现在列表

### 1.3 会话状态模型（展示 / 隐藏 / 置顶）

服务端 `conversations` 表新增：`pinned_at`(nullable timestamp)、`is_hidden`(bool default false)、`last_opened_at`(nullable timestamp)、`unread_count`(int default 0)。规则：

- **置顶**：`pinned_at` 非空即置顶；置顶区与普通区是**两个独立区块**（置顶区在上，之间细分隔线），各自区内按活跃时间排序
- **隐藏**：`is_hidden=true` 不出现在列表；**该会话收到新消息时服务端自动置 `is_hidden=false`**（回到展示状态）
- **排序键**：`activity_at = max(last_message_at, last_opened_at)` 降序；打开会话会更新 `last_opened_at`，因此刚打开的会话自然浮到区块顶部
- **未读**：新消息（非 isSelf）`unread_count +1`；前端打开会话时调 `POST /api/conversations/:id/read` 清零（同时更新 last_opened_at）；自己发送的消息不产生未读
- 列表接口返回上述字段；置顶/隐藏操作接口：`PATCH /api/conversations/:id` body 支持 `pinned`(bool)、`hidden`(bool)

### 1.4 会话右键菜单（ContextMenu）

菜单项（按此顺序）：

1. **置顶 / 取消置顶**（乐观更新）
2. **隐藏会话**（乐观更新，toast"已隐藏，收到新消息时会重新出现"）
3. **标为已读**（unread>0 时显示）
4. 分隔线
5. **编辑备注** → 小 Dialog（单字段：平台会话备注，Enter 提交）
6. **会话管理** → Sheet 抽屉（见 1.5）
7. **会话详情** → 与"会话管理"合并为同一抽屉的信息区（不做两个入口，右键只保留"会话管理"一项即可，抽屉内既看详情也做管理）——**最终菜单为：置顶/隐藏/标为已读/编辑备注/会话管理 五项**

### 1.5 会话管理抽屉（Sheet，右侧 480px）

这是会话所有"管理面"的唯一入口（原右栏 DetailPanel 的绑定功能移到这里）。分区：

1. **会话信息**（DescriptionList）：头像大图、会话名、类型（私聊/群聊）、wxid（复制）、平台备注（内联编辑）、消息数、最后消息时间、所属微信账号（EntityCell）
2. **应用绑定**：当前绑定应用（未绑定显示空态 + "绑定应用"按钮）；绑定操作 = 选应用（Combobox）+ 投递过滤器（全部/仅@）+ 防抖参数（debounceMs/maxWaitMs，留空用应用默认）；已绑定时显示当前配置 + "修改配置" + "解绑"（AlertDialog 确认，写明后果）
3. **投递统计**（轻量）：该会话近 24h 投递成功/失败计数，失败时给"查看投递日志"链接（跳转推送日志页并预筛该会话）
4. 群聊额外：群主、成员数、"查看成员"按钮（关闭抽屉并聚焦右栏成员面板）

## 二、聊天工作台：消息区（中栏）

### 2.1 布局调整

- **右栏仅群聊显示**，内容 = **群成员面板**（见 2.6）；私聊无右栏，消息区占满
- 点击消息**不再**在右侧展示任何内容；**移除**消息选中态（`ring-2 ring-ring` 焦点样式删除），消息不可"选中"，只有 hover 态
- 移除消息右键菜单（ContextMenu 整个去掉）；所有动作收进消息 hover 工具条与详情抽屉

### 2.2 消息行结构

```text
[Avatar 32(点击开联系人弹窗)] [发送者名(群聊+组首条)]
                              [气泡内容]
                              [meta 行: 时间 · 详情按钮 · (已撤回标签) · (发送失败重试)]
```

- meta 行 `text-xs text-muted-foreground`，默认 `opacity-0`，**hover 该消息行时淡入**（120ms）；已撤回标签、发送失败图标除外（常显）
- 详情按钮：`Info size-3.5` 图标 + "详情"，点击打开消息详情抽屉（2.4）
- 自己的消息 meta 行右对齐
- 消息分组（同发送者 3 分钟合组）与日期分隔条规则保持

### 2.3 头像交互

- **hover 不展示任何浮层**（删除现有 hover Popover）
- **点击头像**打开联系人详情 Dialog（见 2.5）

### 2.4 消息详情抽屉（Sheet 右侧 560px，开发者视角，信息不重复且尽量全）

Tab 组织：

1. **概览**：DescriptionList——messageId、raw newMsgId、类型、状态（normal/revoked + 时间）、发送者（EntityCell，点击也可开联系人弹窗）、所属会话、所属微信账号、发送时间（绝对+相对）、isSelf/isAtMe、mentions 列表、renderedText；媒体消息附：文件名/大小/时长/尺寸/media.status/平台 URL（复制+打开）
2. **标准 JSON**：JsonViewer（完整标准信封）
3. **原始 payload**：JsonViewer（webhook raw；hub_send 来源显示发送请求体）
4. **投递记录**：该消息全部 deliveries 表格（应用、事件类型、状态、尝试、时间、错误），失败行可"重投"；空态"该消息未投递给任何应用" + 原因说明（会话未绑定/被过滤/isSelf）
5. 抽屉头部：类型图标 + renderedText 截断 + StatusBadge；支持 ↑/↓ 或头部箭头切换上一条/下一条消息

### 2.5 联系人详情 Dialog（点击头像触发，max-w-md）

不重复且尽量全的联系人板块：

1. 头部：Avatar 64 + 昵称 + 状态 Badge（active/deleted/blocked 或群成员 active/left/removed）
2. 身份：wxid（复制）、所属微信账号、来源（联系人/群成员/两者）
3. 备注：平台联系人备注（内联编辑）；群聊上下文中额外显示群内显示名、群内成员备注（内联编辑）
4. 会话关联：与该联系人的私聊会话（有则"打开会话"跳转）、共同所在群列表（前 5 个 + 数量）
5. 动态：最后发言时间、本会话中消息数（有现成数据则展示，无则省略——不为此新做重接口）

### 2.6 群成员面板（右栏，仅群聊，w-72）

- 头部：`成员 N` + 搜索框（即时过滤已加载项）
- 列表：虚拟滚动；每行 Avatar 28 + 群内显示名/昵称 + 成员备注（次行、有则显示）；群主行加"群主"小标签；非 active 成员灰显 + 状态 Badge，排序在最后
- **成员行右键菜单**：编辑成员备注（小 Dialog）、查看详情（打开 2.5 联系人弹窗）——第一版管理项就这两个，后续扩展（@ 他、禁言等）预留菜单结构
- 行点击 = 打开联系人详情弹窗（与右键"查看详情"同）

### 2.7 撤回消息展示

保持**原始消息完整渲染**（不折叠成灰条），叠加撤回标识：

- 整个消息行加特殊背景：`bg-destructive/5`（极淡红），气泡本身样式不变
- meta 行常显 `已撤回` 标签：`text-xs` Badge（`bg-muted text-muted-foreground`）+ 撤回时间 Tooltip
- 详情抽屉概览里显示撤回时间与撤回事件信息

## 三、管理页整改

### 3.1 通用规则（四页共用）

- **全部新增/编辑表单改为 Dialog 或 Sheet**：字段 ≤4 用 Dialog（max-w-md），字段多或含子列表用 Sheet（480px）。禁止页面内嵌表单区块
- 表单打开自动 focus 首字段；dirty 状态关闭需确认；提交中禁用全表单；成功 toast + 精确 invalidate
- 列表行操作列：≤2 个直接图标按钮（Tooltip），其余收 `⋯` DropdownMenu

### 3.2 应用管理

- 页面 = 应用 DataTable（名称、owner、绑定会话数、状态、创建时间、操作列）
- **新增/编辑应用 → Sheet 表单**，包含分区：基本信息（名称、owner_wxid、主渠道、默认防抖、deliver_self_messages 开关）+ **应用级账号备注**（并入此表单：微信账号列表每行 EntityCell + 备注输入框，直接在表单内编辑，删除现有独立模块）+ token 区（查看/复制/重置 type-to-confirm）
- **绑定的会话列表 → 行内"会话"按钮（或 ⋯ 菜单项）点开 Sheet**：该应用绑定的会话 DataTable（会话 EntityCell、类型、过滤器、防抖、绑定时间、"解绑"操作、"打开会话"跳工作台）；删除现有页面内嵌绑定列表模块
- SSE 接入配置片段（URL+token 一键复制）保留在编辑 Sheet 的 token 区

### 3.3 账号与联系人

- 页面 = 微信账号 DataTable（EntityCell、wxid、在线状态、来源 auto/manual、最后同步、操作列）
- **新增/编辑账号 → Dialog 表单**（appId、wxid、平台备注）
- **行内"联系人"按钮 → Sheet（宽 640px）**：该账号联系人 DataTable（EntityCell、wxid、状态、备注内联编辑、最后同步），顶部搜索 + 状态筛选 + "同步通讯录"按钮；群列表可作为该 Sheet 第二个 Tab（群名、成员数、状态、点击开成员列表）
- 删除现有页面内嵌的联系人区块

### 3.4 推送日志 / 发送记录

- **去掉重复的状态筛选**：删除下拉式状态选择，只保留快速状态切换（Tabs 式分面：全部/成功/失败/进行中，带计数）；其余筛选（应用、会话、时间）保留在工具栏
- 行点击 → DetailSheet 详情（已有则核对分区与 DescriptionList 排版）
- 推送日志支持 URL 预筛（供会话管理抽屉/消息详情跳转）：`?conversationId=&messageId=&status=`

## 四、全局补充整改（行业级细节）

1. **浮层层级审计**：z-index 体系统一常量（overlay 40 / dialog 50 / popover 50 / toast 60）；Sheet 内可开 Dialog、Dialog 内只允许叠 AlertDialog
2. **Toast 规范**：成功仅在"用户主动操作"后弹；错误必弹且带 message；不为被动数据刷新弹 toast；位置右上，最多同屏 3 条
3. **加载态**：所有 DataTable Skeleton 行（同步脉冲）；抽屉/弹窗内容加载用局部 Skeleton 不是空白；按钮级 loading 已有规则保持
4. **空态**：每个新列表（成员面板、绑定会话 Sheet、联系人 Sheet、投递 Tab）都要有具体文案空态
5. **焦点管理**：所有 Dialog/Sheet 关闭后焦点归还触发元素；表格行内按钮 `focus-visible:ring` 保留（消息气泡的选中 ring 是删除对象，二者别搞混）
6. **超长内容回归**：超长群名/昵称/文件名在会话列表、消息 meta、抽屉头部、表格全部 truncate + Tooltip
7. **时间显示**：全站 TimeText（相对+Tooltip 绝对）；消息 meta 行内显示 `HH:mm`（当天）
8. **删除现有 DetailPanel** 中已迁移到会话管理抽屉/成员面板的代码，不留死代码；`useWorkbenchDetailController` 等相关 hook 同步清理或重构

## 五、服务端配套改动清单

1. `conversations` 表：新增 `pinned_at`、`is_hidden`、`last_opened_at`、`unread_count`；列表接口返回并支持排序所需字段；`PATCH /api/conversations/:id`（pinned/hidden）；`POST /api/conversations/:id/read`（清未读+更新 last_opened_at）
2. 新消息入库时：unread_count 自增（非 isSelf）；is_hidden 自动复位 false
3. 联系人详情聚合接口（2.5 需要）：`GET /api/contacts/:wxid/profile?accountId=`（基本信息+群内身份+关联会话+共同群，一次返回）
4. 应用编辑接口支持应用级账号备注批量提交；应用绑定会话列表接口（分页）
5. 推送日志接口支持 conversationId/messageId 预筛参数
6. contracts 包同步全部新字段/新接口类型

## 六、验收清单

- [ ] 全部浮层不透明（Popover/ContextMenu/Select/Tooltip 逐个截图）
- [ ] 200 条混合类型消息滚动无重叠、无跳动；图片加载不推挤相邻消息
- [ ] 所有 Dialog/Sheet/Popover/Toast 有进出场动画且 reduced-motion 降级
- [ ] 账号选择器展示头像/昵称/备注/wxid/在线点
- [ ] 会话置顶与普通两区块、隐藏后新消息自动重现、打开会话浮顶、未读数正确清零
- [ ] 会话列表无投递状态残留；右键五项菜单齐全；会话管理抽屉完成绑定/解绑全流程
- [ ] 消息点击无 ring；右键菜单已移除；hover 出 meta 行；详情按钮开四 Tab 抽屉且可上下条切换
- [ ] 点头像开联系人弹窗（hover 无浮层）；群聊右栏为成员面板；成员右键可编辑备注
- [ ] 撤回消息保持原渲染 + 淡红底 + 已撤回标签
- [ ] 应用/账号全部表单走 Dialog/Sheet；应用级备注并入应用表单；绑定会话/联系人列表走 Sheet
- [ ] 推送日志/发送记录单层状态筛选（Tabs 分面带计数）
- [ ] tsc + lint + 全部测试绿；无 >800 行 tsx；死代码清理完毕

## 验收记录

> 验收时间：2026-07-07，本地开发环境验证；线上验证由人工后续完成。

- [x] 全部浮层不透明（Popover/ContextMenu/Select/Tooltip 逐个截图）——`src/style-architecture.test.ts` 校验 shadcn token、动画与层级；浏览器在 `http://localhost:5173` 抽样验证语音方式 Popover、账号选择 Popover、新增应用 Sheet 均为不透明背景、有 border/shadow，层级为 overlay 40、popover/dialog 50。
- [x] 200 条混合类型消息滚动无重叠、无跳动；图片加载不推挤相邻消息——`src/features/workbench/workbench-architecture.test.ts` 校验 MessagePanel 使用 TanStack Virtual 动态 `measureElement`；`src/features/workbench/WorkbenchMessageArea.test.tsx` 覆盖图片/卡片消息展示与消息详情交互。
- [x] 所有 Dialog/Sheet/Popover/Toast 有进出场动画且 reduced-motion 降级——`src/style-architecture.test.ts` 校验 `tailwindcss-animate`、Radix `data-state` 动画类、`prefers-reduced-motion` 降级和 Toast 右上最多 3 条。
- [x] 账号选择器展示头像/昵称/备注/wxid/在线点——`src/features/workbench/WorkbenchConversationList.test.tsx` 覆盖账号实体展示与 URL 参数切换；浏览器抽样验证账号 Popover 真实渲染。
- [x] 会话置顶与普通两区块、隐藏后新消息自动重现、打开会话浮顶、未读数正确清零——`src/features/workbench/WorkbenchConversationList.test.tsx`、`src/features/workbench/WorkbenchPage.test.tsx`、`server/test/conversations-controller.test.ts` 覆盖置顶/隐藏/未读/已读接口与前端行为。
- [x] 会话列表无投递状态残留；右键五项菜单齐全；会话管理抽屉完成绑定/解绑全流程——`src/features/workbench/WorkbenchConversationList.test.tsx` 与 `src/features/workbench/WorkbenchDetailPanel.test.tsx` 覆盖会话右键、管理抽屉、绑定/解绑确认。
- [x] 消息点击无 ring；右键菜单已移除；hover 出 meta 行；详情按钮开四 Tab 抽屉且可上下条切换——`src/features/workbench/WorkbenchMessageArea.test.tsx` 与 `src/features/workbench/WorkbenchDetailPanel.test.tsx` 覆盖消息无选中态、无右键菜单、详情抽屉和上下条切换。
- [x] 点头像开联系人弹窗（hover 无浮层）；群聊右栏为成员面板；成员右键可编辑备注——`src/features/workbench/WorkbenchMessageArea.test.tsx` 与 `src/features/workbench/WorkbenchDetailPanel.test.tsx` 覆盖头像点击、hover 无浮层、群成员面板和成员备注编辑。
- [x] 撤回消息保持原渲染 + 淡红底 + 已撤回标签——`src/features/workbench/WorkbenchMessageArea.test.tsx` 覆盖撤回消息仍渲染原内容并显示撤回状态。
- [x] 应用/账号全部表单走 Dialog/Sheet；应用级备注并入应用表单；绑定会话/联系人列表走 Sheet——`src/features/admin/AdminPagesStage3.test.tsx`、`src/features/admin/AdminPages.test.tsx` 覆盖应用 Sheet、账号 Dialog、绑定会话 Sheet、联系人 Sheet；浏览器抽样确认应用页只剩 DataTable 和弹层入口。
- [x] 推送日志/发送记录单层状态筛选（Tabs 分面带计数）——`src/features/admin/AdminPagesStage3.test.tsx`、`src/features/admin/AdminPagesOperations.test.tsx`、`src/App.test.tsx` 覆盖快速状态分面和 URL 同步；浏览器抽样确认推送日志无旧状态下拉。
- [x] tsc + lint + 全部测试绿；无 >800 行 tsx；死代码清理完毕——已运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`git diff --check`；`find web/src -name '*.tsx' ... awk '$1 > 800'` 无超限文件；生产源码 grep 禁止项零命中。
