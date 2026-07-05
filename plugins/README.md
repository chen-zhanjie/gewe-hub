# 插件目录

本目录用于维护 GeWeHub 面向下游 AI、Agent、自动化平台的官方对接插件。

插件的职责是适配外部平台协议，不负责 GeWe 原始接入、消息主存储、去重、标准化和发送状态机。这些能力属于 GeWeHub 中台核心。

## 目录约定

```text
plugins/
  hermes-agent/
  openclaw/
  <platform>/
```

首期默认维护 `hermes-agent/` 插件。后续如果需要支持 OpenClaw、Dify、其他 Agent 或自动化平台，应在本目录下新增独立插件包。

## 插件边界

插件可以做:

- 连接 GeWeHub 下游接口。
- 消费 SSE 或 Webhook 事件。
- 将 GeWeHub 标准消息转换为目标平台事件。
- 调用 GeWeHub 标准发送接口回复消息。
- 处理目标平台需要的配置、鉴权、状态和诊断。

插件不应该做:

- 直接调用 GeWe 平台。
- 依赖 GeWe 原始 payload。
- 自己维护消息主存储。
- 绕过 GeWeHub 的发送、审计、路由和权限边界。
- 把某个平台的私有协议反向写入 GeWeHub 核心模型。
