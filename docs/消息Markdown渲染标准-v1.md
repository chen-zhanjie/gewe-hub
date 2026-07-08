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
5. **对 AI 友好**：输出应直接可读，避免大段重复 JSON 或只给占位符。
6. **安全渲染**：Web 端如果渲染 `renderedMd`，必须禁用 raw HTML 或做安全净化。

## 三、顶层消息

没有引用时，`renderedMd` 等于 `content` 的 Markdown 渲染结果。

有顶层 `quote` 时，先渲染引用块，再空一行渲染正文：

```md
> 引用 陈可乐：
> [mapping_app.txt](https://hub.example.com/files/asset_file)

引用
```

规则：

- 引用块使用 Markdown blockquote。
- 引用标题格式为 `引用 {senderName}：`；没有 `senderName` 时为 `引用：`。
- 引用内容的每一行都加 `> ` 前缀。
- 正文保持原消息内容，不把 `quote` 混入同一行。
- 顶层引用和条目级引用使用同一套规则。

## 四、合并转发

`chat_record` 使用标题行加编号列表：

```md
[聊天记录] 群聊的聊天记录

1. 🍞：
   小道消息是说 7号GPT出新模型吗

2. 陈可乐：
   [图片](https://hub.example.com/files/asset_image)

3. 李四：
   > 引用 张三：
   > 他们不是发公告了

   他们不是发公告了
```

规则：

- 第一行固定为 `[聊天记录] {text}`。
- `items[]` 使用有序列表，从 `1.` 开始。
- 条目有 `senderName` 时，列表标题为 `{senderName}：`。
- 条目没有 `senderName` 时，可以直接输出条目内容。
- 条目内有 `quote` 时，先输出引用块，再空一行输出条目正文。
- 条目渲染需要按层级缩进，保证 Markdown 结构稳定。

嵌套合并转发继续缩进：

```md
1. 张三：
   [聊天记录] 内层聊天记录

   1. 李四：
      内层消息
```

## 五、类型渲染规则

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
| `chat_record` | 按第四节递归渲染。 |
| `location` | `[位置] 名称`；有地址时下一行输出地址；有坐标时追加 `lat,lng`。 |
| `card` | `[名片] 昵称`；有 `wxid` 时下一行输出 `wxid`。 |
| `transfer` | `[转账] 金额`；有备注时追加 `：备注`。 |
| `red_packet` | `[红包] 祝福语`；无祝福语时 `[红包]`。 |
| `system` | `[系统消息] 文本`。 |
| `unsupported` | `[暂不支持的消息类型: rawType] 文本`；无 `rawType` 时使用 `unknown`。 |

## 六、媒体规则

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

## 七、摘要字段兼容

`renderedText` 不随本标准改成 Markdown，继续承担短摘要职责。

建议摘要规则保持简洁：

- 文本：原摘要。
- 媒体：`[图片]`、`[语音]`、`[视频]`、`[文件] 文件名`。
- 链接：`[链接] 标题`。
- 合并转发：`[聊天记录] 标题`。
- 引用：继续使用现有兼容摘要，例如 `引用: [文件] mapping_app.txt`。
- 下载失败：继续输出短失败描述，例如 `[文件: mapping_app.txt] 下载失败`。

第一版为减少迁移成本，保留 `renderedText` 作为兼容摘要字段，不新增摘要字段。

## 八、实现边界

第一版实现应收口到一个共享渲染模块，避免各路径漂移：

1. `renderMessageMarkdown(envelope | content, quote)` 生成 `renderedMd`。
2. `renderMessageSummary(envelope | content, quote)` 生成兼容 `renderedText`。
3. normalizer、引用回查、媒体回写、本地发送都调用共享模块。
4. 引用回查或媒体状态变化后，必须同步重算 `renderedMd`。
5. `hydrateMessageReferencesFromLocalMessages` 递归补全条目后，也必须重算顶层 `renderedMd`。

测试至少覆盖：

- 所有 15 种 `MessageNode.type`。
- 顶层引用。
- 条目级引用。
- 合并转发。
- 嵌套合并转发。
- 媒体 ready/pending/failed。
- 引用回查补全后 `renderedMd` 更新。
- 媒体下载成功或失败后 `renderedMd` 更新。

## 九、示例

引用文件：

```md
> 引用 陈可乐：
> [mapping_app.txt](https://hub.example.com/files/asset_file)

引用
```

引用下载失败图片：

```md
> 引用 陈可乐：
> [图片]（下载失败）

这个图看不到
```

合并转发内嵌引用：

```md
[聊天记录] 群聊的聊天记录

1. 大哈：
   > 引用 🍞：
   > 你偷听梁逸峰 不对 梁文峰开会了？

   他们不是发公告了
```

嵌套合并转发：

```md
[聊天记录] 外层聊天记录

1. 张三：
   [聊天记录] 内层聊天记录

   1. 李四：
      内层消息

2. 王五：
   后续文本
```
