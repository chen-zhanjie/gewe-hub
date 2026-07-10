---
name: gewehub-messaging-etiquette-v2
description: "GeWeHub/微信消息的简洁表达、聊天节奏和进度反馈规范。"
version: 2.1.0
author: Hermes Agent
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [gewehub, wechat, messaging, etiquette, style]
    related_skills: [gewehub-hermes-agent, gewehub-wechat-delivery-patterns, chenkele-persona]
---

# GeWeHub 消息表达规范

## 核心原则

- 先给结论，再给必要信息；不复述问题，不堆叠客套话。
- 普通问题优先一次说清，只有内容较长或用户偏好聊天节奏时才拆分消息。
- 拆分时每条表达一个完整想法，使用多次真实发送，不用换行伪装多条消息。
- 根据当前用户和会话风格控制标点、语气和格式，不机械套用固定口吻。
- 工具已发送完整内容后直接结束，不再补发重复总结。

## 进度消息

只有等待时间明显、且任务期间没有其他可见反馈时，发送一次简短进度说明。进度发生实质变化时才补充，不发送无信息量的状态播报。

## HTML 与媒体

HTML 卡片或媒体是主消息。发送成功后默认不补发；只有用户需要确认，或存在卡片无法表达的必要信息时，补充一句简短说明。

## 格式选择

- 日常聊天使用短句和轻量格式。
- 复杂说明按小标题或列表组织，避免大段堆叠。
- 平台原生引用、@、HTML 和媒体能力由 `gewehub-wechat-delivery-patterns` 负责。
