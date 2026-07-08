---
name: gewehub-hermes-agent
description: GeWeHub runtime delivery guidance for Hermes Agent conversations. Use when Hermes is running through the GeWeHub platform plugin and needs to receive GeWeHub SSE events or send text/image/file/voice/video replies through GeWeHub.
---

# GeWeHub Hermes Runtime

GeWeHub 是 Hermes 和 GeWe 之间的中台边界。插件只调用 GeWeHub 标准接口，不直连 GeWe，也不要求 Agent 层理解 GeWe 的 `thumbUrl`、`videoDuration`、Silk 转换等细节。

## 安装与启用

插件目录建议用软链接入 Hermes，方便跟随 GeWeHub 仓库更新：

```bash
mkdir -p ~/.hermes/plugins ~/.hermes/skills
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent ~/.hermes/plugins/gewehub-hermes-agent
ln -sfn /Users/agent/project/GeWeHub/plugins/hermes-agent/skill ~/.hermes/skills/gewehub-hermes-agent
```

Hermes 用户插件需要显式启用。在 Hermes 配置中加入：

```yaml
plugins:
  enabled:
    - gewehub-hermes-agent
```

## 必需配置

- `GEWEHUB_BASE_URL`: GeWeHub 的可访问地址，例如 `http://localhost:8080`。
- `GEWEHUB_APP_TOKEN`: GeWeHub 应用 token，用作 `Authorization: Bearer <token>`。

可选配置：

- `GEWEHUB_HOME_CONVERSATION_ID`: Hermes 主动通知默认会话。
- `GEWEHUB_DEBOUNCE_MS`: 默认文本合并窗口，事件 metadata 可覆盖。
- `GEWEHUB_MAX_WAIT_MS`: 默认文本合并最大等待时间，事件 metadata 可覆盖。

## 接收消息

- 插件通过 `GET /api/apps/events` 建立 SSE。
- 插件持久化 `Last-Event-ID` 并做本地短期去重。
- 消息处理完成后调用 `POST /api/apps/events/ack`。
- ACK 网络失败只记录 warning，不中断已完成的消息处理；游标会先写入本地状态。

## 发送消息

所有发送都走 GeWeHub `/api/send`：

- 文本：`type=text`，支持从 Hermes metadata 透传 `idempotency_key/request_id`。
- 图片、文件、语音、视频本地文件：插件把文件读成 `contentBase64` 交给 Hub，由 Hub 写入 runtime 文件并生成可访问 URL。
- 图片、文件、视频公网 URL：插件把 URL 交给 Hub，Hub/GeWe 可直接访问时不需要再上传文件。
- 语音：Hub 负责转换 Silk 并补齐 GeWe 发送参数。
- 视频：插件不要求传封面或时长；本地视频文件进入 Hub 后可由 Hub 生成封面并补默认时长，公网 `http(s)` 视频 URL 可直接交给 GeWe。

不要把 Hermes 机器上的本地文件路径当作 URL 发给 GeWe；本地路径必须通过插件文件发送接口进入 Hub。

## 本地验证

```bash
uv run --with pytest --with pytest-asyncio --with httpx --with PyYAML \
  python -m pytest /Users/agent/project/GeWeHub/plugins/hermes-agent/test_gewehub_plugin.py
```

真实 Hermes 抽象类烟测：

```bash
PYTHONPATH=/Users/agent/project/hermes-agent-pro/server \
/Users/agent/project/hermes-agent-pro/server/.venv/bin/python - <<'PY'
import importlib.util, sys
from pathlib import Path
plugin_dir = Path('/Users/agent/project/GeWeHub/plugins/hermes-agent')
name = 'gewehub_plugin_real_base_check'
spec = importlib.util.spec_from_file_location(name, plugin_dir / '__init__.py', submodule_search_locations=[str(plugin_dir)])
module = importlib.util.module_from_spec(spec)
sys.modules[name] = module
spec.loader.exec_module(module)
adapter = module.adapter.GeWeHubAdapter()
print('instantiate=ok')
print(adapter.get_chat_info)
PY
```
