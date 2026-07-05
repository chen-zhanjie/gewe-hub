# Hermes Agent 插件

本目录用于维护 GeWeHub 面向 Hermes Agent 的官方对接插件。

插件目标:

- 让 Hermes Agent 能通过 GeWeHub 接收微信标准消息。
- 让 Hermes Agent 能通过 GeWeHub 标准发送接口回复文本、图片、文件等消息。
- 支持 GeWeHub 的 SSE/Webhook 推送模式。
- 支持 GeWeHub 的交互事件、HTML 展示页、资源上传等扩展能力。
- 提供清晰的配置、诊断和错误提示。

插件边界:

- 插件只对接 GeWeHub，不直接对接 GeWe 平台。
- 插件只消费 GeWeHub 标准消息，不依赖 GeWe 原始 payload。
- Hermes Agent 负责消息理解、知识库检索、自动回复、工具调用和 persona。
- GeWeHub 负责消息接入、存储、标准化、路由、发送、审计和运行观测。

后续实现时，应优先参考 GeWeCenter 既有 Hermes 插件经验，但不要复制旧项目中与 GeWeCenter 专有接口强绑定的实现。
