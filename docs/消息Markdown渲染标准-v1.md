# GeWeHub 消息 Markdown 渲染标准 v1

> 状态：提案草案，待契约和实现落地。
> 适用范围：标准消息 `MessageEnvelope` 的 Markdown 可读投影，覆盖 `content`、`quote`、`chat_record.items[]`、嵌套引用和嵌套转发。
> 相关文档：`docs/标准消息结构-v1.md`。

## 一、字段边界

GeWeHub 标准消息继续以 JSON 为事实源，Markdown 只作为可读投影。

1. `content` / `quote` / `items[]` 是结构化事实源。
2. `renderedText` 保持现有语义不动，继续作为短摘要和兼容文本使用。
3. `renderedMd` 是后续提案字段，当前 `MessageEnvelope` 契约尚未包含；落地前不得作为运行时依赖。
4. 数据库现有 `messages.rendered_text` 继续对应 `renderedText`，不改成完整 Markdown。
5. 会话列表、投递列表、搜索预览继续优先使用 `renderedText`。
6. Hermes/AI、消息详情、调试复制、人工排查后续可以使用 `renderedMd` 获取更完整上下文。

第一版不要求反向解析 Markdown。任何业务处理、路由、回查、媒体下载、撤回判断都必须基于结构化 JSON。

## 二、总体原则

1. **原生 Markdown 优先**：媒体和链接尽量使用标准 Markdown 链接 `[名称](url)`。
2. **复杂结构用稳定约定**：引用、合并转发、嵌套转发用固定缩进和标题规则表达。
3. **不丢失上下文**：引用、条目发送者、媒体状态、失败原因、嵌套层级必须可读。
4. **不泄露原始敏感字段**：不输出 GeWe 原始 CDN 参数、aeskey、fileId、原始 XML。
5. **AI 操作上下文优先**：`renderedMd` 不只是内容可读，还必须给 AI 提供回复、引用、@ 人所需的轻量身份锚点。
6. **避免 Markdown JSON 化**：完整 `account` / `conversation` / `sender` / `mentions` 仍保留在结构化 payload；Markdown 只输出可读、必要、低噪音字段。
7. **不伪造身份**：只有结构化数据里真实存在 wxid 时才输出 `<wxid>`；只有昵称时只写昵称。
8. **@ 人靠结构化发送参数**：`renderedMd` 负责让 AI 看懂"谁是谁"，真实 @ 由 `/api/send` 的 `mentions` 等结构化字段负责，不要求模型拼微信内部格式。
9. **安全渲染**：Web 端如果渲染 `renderedMd`，必须禁用 raw HTML 或做安全净化。

## 三、AI 操作上下文

`renderedMd` 面向 Hermes/AI 时采用三段式：

```md
[上下文]
消息ID: msg_9154866412345678
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:28
发送者: 陈可乐 <wxid_abc>
被@对象: 机器人 <wxid_bot>, 云知序 <未解析>
可@对象: 陈可乐 <wxid_abc>, 机器人 <wxid_bot>

[引用]
> 引用 张三（消息ID: msg_123）：
> 之前的内容

[正文]
@机器人 看看这个
```

规则：

- 顶层消息必须输出 `[上下文]` 和 `[正文]`。
- 有顶层 `quote` 时输出 `[引用]`；无引用时省略整个 `[引用]` 段。
- `消息ID` 使用顶层 `MessageEnvelope.messageId`，可直接用于 AI 后续 `replyToMessageId`。
- `会话` 格式为 `{conversation.remark|conversation.name|conversation.wxid} ({conversation.type}, {conversation.id})`。
- `时间` 使用顶层 `sentAt`，建议渲染为目标用户可读的本地时间；缺失时省略。
- `发送者` 格式为 `{sender.remark|sender.name|sender.wxid} <{sender.wxid}>`。
- `被@对象` 来自顶层 `mentions[]`；resolved 且有 wxid 时输出 `{name|wxid} <{wxid}>`，未解析时输出 `{name} <未解析>`。
- 如果 `mentions[]` 为空，可以省略 `被@对象` 行。
- `可@对象` 是 AI 可安全写入发送参数 `mentions` 的候选列表，只能包含已有 wxid 的身份锚点。
- `可@对象` 至少可包含顶层发送者；也可包含已解析的 `mentions[]`、有真实 wxid 的引用发送者或平台已知群成员。未解析对象不得进入 `可@对象`。
- 如果没有任何可 @ wxid，可以省略 `可@对象` 行。
- 不输出完整 JSON，不输出 account 全量字段，不输出原始 XML。

`renderedMd` 的字段职责：

- 让 AI 能判断当前对话上下文、发言人、是否 @ 自己、能否 @ 回某人。
- 让 AI 能复制 `msg_xxx` 作为 `replyToMessageId`。
- 让 AI 能选择 `mentions` 结构化发送参数。
- 不作为业务反向解析来源；业务仍以结构化 payload 为准。

## 四、顶层正文与引用

没有引用时，`[正文]` 段等于 `content` 的 Markdown 渲染结果。

有顶层 `quote` 时，先输出 `[引用]` 段，再输出 `[正文]` 段：

```md
[上下文]
消息ID: msg_478238581151300365
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:28
发送者: 李四 <wxid_lisi>

[引用]
> 引用 陈可乐（消息ID: msg_123）：
> [mapping_app.txt](https://hub.example.com/files/asset_file)

[正文]
引用
```

规则：

- 引用块使用 Markdown blockquote。
- 引用标题格式为 `引用 {身份锚点}：`；有 `sourceMessageId` 时追加 `（消息ID: msg_xxx）`。
- 身份锚点格式优先为 `{senderName} <{senderWxid}>`；没有 wxid 时只写 `{senderName}`；没有名称时为 `引用：`。不得从昵称或历史消息猜测 wxid。
- 引用内容的每一行都加 `> ` 前缀。
- 正文保持原消息内容，不把 `quote` 混入同一行。
- 顶层引用和条目级引用使用同一套规则。

## 五、合并转发

`chat_record` 使用标题行加编号列表：

```md
[上下文]
消息ID: msg_9154866412345678
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:28
转发者: 李四 <wxid_lisi>
消息类型: 合并转发

[正文]
[聊天记录] 群聊的聊天记录

1. 🍞 2026-07-09 14:03：
   小道消息是说 7号GPT出新模型吗

2. 陈可乐 <wxid_abc> 2026-07-09 14:04：
   [图片](https://hub.example.com/files/asset_image)

3. 李四 2026-07-09 14:05：
   > 引用 张三 <wxid_zhangsan>（消息ID: msg_123）：
   > 他们不是发公告了

   他们不是发公告了
```

规则：

- 顶层 `sender` 是转发这条聊天记录的人，`[上下文]` 里写 `转发者`，不是原聊天记录每条的发送者。
- 第一行固定为 `[聊天记录] {text}`。
- `items[]` 使用有序列表，从 `1.` 开始。
- 条目有 `senderName` 时，列表标题为 `{senderName}：`。
- 条目有真实 wxid 时，列表标题为 `{senderName} <{wxid}>：`；没有 wxid 时不得伪造，只写 `{senderName}：`。
- 条目有 `sentAt` 时，在冒号前追加时间：`{senderName} <{wxid}> 2026-07-09 14:03：`。
- 条目有 `sourceMessageId` 时，在条目标题里以 `（消息ID: msg_xxx）` 追加；该 ID 可用于引用原消息。没有 `sourceMessageId` 时只能用"第 N 条"描述，不能构造 `replyToMessageId`。
- 条目没有 `senderName` 时，可以直接输出条目内容。
- 条目内有 `quote` 时，先输出引用块，再空一行输出条目正文。
- 条目渲染需要按层级缩进，保证 Markdown 结构稳定。
- 合并转发条目的 `senderName` 很多时候只有昵称；标准明确不补猜测 wxid。
- 每条保留顺序编号，方便 AI 引用"第 3 条"。

嵌套合并转发继续缩进：

```md
1. 张三：
   [聊天记录] 内层聊天记录

   1. 李四：
      内层消息
```

## 六、类型渲染规则

| type | `renderedMd` 渲染规则 |
|---|---|
| `text` | 原文输出，保留换行。 |
| `image` | 有 URL：`[图片](url)`；无 URL：`[图片]（等待下载）` 或 `[图片]（下载失败）`。 |
| `voice` | 有 URL：`[语音 5.3s](url)`；无 URL：`[语音 5.3s]（等待下载）` 或 `[语音 5.3s]（下载失败）`。 |
| `video` | 有 URL：`[视频 12s](url)`；无 URL：`[视频]（等待下载）` 或 `[视频]（下载失败）`。 |
| `file` | 有 URL：`[文件名.ext](url)`；无 URL：`[文件] 文件名.ext（等待下载）` 或 `[文件] 文件名.ext（下载失败）`。 |
| `emoji` | 有 URL：`[动画表情](url)`；无 URL：`[动画表情]（等待下载）` 或 `[动画表情]（下载失败）`。 |
| `link` | 有 URL：`[标题](url)`；有描述时下一行追加 `> 描述`；无 URL：`[链接] 标题`。 |
| `mini_program` | `[小程序] 标题`；有来源或路径时追加 `（来源：xxx，路径：xxx）`。 |
| `chat_record` | 按第五节递归渲染。 |
| `location` | `[位置] 名称`；有地址时下一行输出地址；有坐标时追加 `lat,lng`。 |
| `card` | `[名片] 昵称`；有 `wxid` 时下一行输出 `wxid`。 |
| `transfer` | `[转账] 金额`；有备注时追加 `：备注`。 |
| `red_packet` | `[红包] 祝福语`；无祝福语时 `[红包]`。 |
| `system` | `[系统消息] 文本`。 |
| `unsupported` | `[暂不支持的消息类型: rawType] 文本`；无 `rawType` 时使用 `unknown`。 |

## 七、媒体规则

媒体优先使用标准 Markdown 链接，链接文本必须是人能理解的名称：

```md
[图片](https://hub.example.com/files/asset_image)
[语音 5.3s](https://hub.example.com/files/asset_voice)
[合同.pdf](https://hub.example.com/files/asset_file)
```

降级规则：

```md
[图片]（等待下载）
[图片]（下载失败）
[文件] 合同.pdf（等待下载）
[文件] 合同.pdf（下载失败）
```

约定：

- `media.status = ready` 且 `media.url` 存在时输出 Markdown 链接。
- `media.status = pending` 时输出 `（等待下载）`。
- `media.status = failed` 时输出 `（下载失败）`。
- 文件优先使用 `media.fileName` 作为链接文本。
- 语音和视频有 `durationMs` 时换算成人类可读秒数。
- 不在 `renderedMd` 中输出签名参数以外的原始下载字段；如果 URL 是平台代理签名 URL，可以直接输出。

## 八、发送协作规则

`renderedMd` 只负责 AI 可见身份和内容上下文；发送动作必须使用结构化参数。

文本回复引用消息：

```json
{
  "conversationId": "cvs_xxx",
  "type": "text",
  "text": "这个我看过了",
  "replyToMessageId": "msg_478238581151300365"
}
```

文本回复并 @ 成员：

```json
{
  "conversationId": "cvs_xxx",
  "type": "text",
  "text": "@陈可乐 收到",
  "mentions": ["wxid_abc"]
}
```

约定：

- `renderedMd` 中出现 `<wxid_abc>` 是为了让 AI 选择结构化 `mentions`，不是要求 AI 自行拼内部 @ 格式。
- 正文 `text` 里仍建议写出人类可读的 `@昵称`，方便聊天窗口阅读。
- `mentions` 第一版使用 wxid 字符串数组；如果后续契约升级为对象数组，应保持向后兼容。
- 引用目标必须使用 `replyToMessageId`，不要从 Markdown 反向解析引用内容。

## 九、摘要字段兼容

`renderedText` 不随本标准改成 Markdown，继续承担短摘要职责。

建议摘要规则保持简洁：

- 文本：原摘要。
- 媒体：`[图片]`、`[语音]`、`[视频]`、`[文件] 文件名`。
- 链接：`[链接] 标题`。
- 合并转发：`[聊天记录] 标题`。
- 引用：继续使用现有兼容摘要，例如 `引用: [文件] mapping_app.txt`。
- 下载失败：继续输出短失败描述，例如 `[文件: mapping_app.txt] 下载失败`。

第一版为减少迁移成本，保留 `renderedText` 作为兼容摘要字段，不新增摘要字段。

## 十、实现边界

第一版实现应收口到一个共享渲染模块，避免各路径漂移：

1. `renderMessageMarkdown(envelope | content, quote)` 生成 `renderedMd`。
2. `renderMessageSummary(envelope | content, quote)` 生成兼容 `renderedText`。
3. normalizer、引用回查、媒体回写、本地发送都调用共享模块。
4. 引用回查或媒体状态变化后，必须同步重算 `renderedMd`。
5. `hydrateMessageReferencesFromLocalMessages` 递归补全条目后，也必须重算顶层 `renderedMd`。

测试至少覆盖：

- 所有 `MessageNode.type`。
- 顶层引用。
- 条目级引用。
- 合并转发。
- 嵌套合并转发。
- 媒体 ready/pending/failed。
- 引用回查补全后 `renderedMd` 更新。
- 媒体下载成功或失败后 `renderedMd` 更新。
- `[上下文]` 中 `messageId`、`conversation`、`sender`、`mentions` 渲染。
- `chat_record.items[]` 不伪造 wxid，仅在真实存在时输出 `<wxid>`。

## 十一、示例

引用文件：

```md
[上下文]
消息ID: msg_478238581151300365
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:28
发送者: 李四 <wxid_lisi>
可@对象: 李四 <wxid_lisi>

[引用]
> 引用 陈可乐（消息ID: msg_123）：
> [mapping_app.txt](https://hub.example.com/files/asset_file)

[正文]
引用
```

引用下载失败图片：

```md
[上下文]
消息ID: msg_478238581151300366
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:29
发送者: 李四 <wxid_lisi>
可@对象: 李四 <wxid_lisi>

[引用]
> 引用 陈可乐（消息ID: msg_124）：
> [图片]（下载失败）

[正文]
这个图看不到
```

合并转发内嵌引用：

```md
[上下文]
消息ID: msg_478238581151300367
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:30
转发者: 李四 <wxid_lisi>
消息类型: 合并转发
可@对象: 李四 <wxid_lisi>

[正文]
[聊天记录] 群聊的聊天记录

1. 大哈 2026-07-09 14:05：
   > 引用 🍞：
   > 你偷听梁逸峰 不对 梁文峰开会了？

   他们不是发公告了
```

嵌套合并转发：

```md
[上下文]
消息ID: msg_478238581151300368
会话: 客户群 A (group, cvs_xxx)
时间: 2026-07-09 14:31
转发者: 李四 <wxid_lisi>
消息类型: 合并转发
可@对象: 李四 <wxid_lisi>

[正文]
[聊天记录] 外层聊天记录

1. 张三：
   [聊天记录] 内层聊天记录

   1. 李四：
      内层消息

2. 王五：
   后续文本
```
