from __future__ import annotations

import asyncio
import importlib
import importlib.util
import io
import json
import os
import sys
import types
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
import yaml


PLUGIN_DIR = Path(__file__).resolve().parent


def test_plugin_manifest_and_required_files():
    expected = {
        "__init__.py",
        "plugin.yaml",
        "adapter.py",
        "cli.py",
        "config.py",
        "client.py",
        "normalizer.py",
        "outbound.py",
        "dedupe.py",
        "state.py",
        "tools.py",
        "README.md",
        "skill/SKILL.md",
    }

    missing = [name for name in sorted(expected) if not (PLUGIN_DIR / name).is_file()]
    assert missing == []

    manifest = yaml.safe_load((PLUGIN_DIR / "plugin.yaml").read_text(encoding="utf-8"))
    assert manifest["name"] == "gewehub-hermes-agent"
    assert manifest["kind"] == "platform"
    assert {item["name"] for item in manifest["requires_env"]} == {
        "GEWEHUB_BASE_URL",
        "GEWEHUB_APP_TOKEN",
    }
    assert "GEWEHUB_HOME_CONVERSATION_ID" in {item["name"] for item in manifest["optional_env"]}
    assert manifest["provides_tools"] == ["gewehub_send_message", "gewehub_revoke_message"]


def test_delivery_protocol_and_stable_message_ids_are_documented_without_history_notes():
    canonical = (PLUGIN_DIR / "skill" / "SKILL.md").read_text(encoding="utf-8")
    supporting_paths = [
        PLUGIN_DIR / "skill" / "gewehub-messaging-etiquette-v2" / "SKILL.md",
        PLUGIN_DIR / "skill" / "gewehub-wechat-delivery-patterns" / "SKILL.md",
        PLUGIN_DIR / "skill" / "chenkele-persona" / "SKILL.md",
    ]
    combined = "\n".join(
        [
            (PLUGIN_DIR / "README.md").read_text(encoding="utf-8"),
            canonical,
            *(path.read_text(encoding="utf-8") for path in supporting_paths),
        ]
    )

    assert "deliveryMode" in canonical
    assert all(value in canonical for value in ("immediate", "discard", "confirm"))
    assert "executionMode" in canonical and "sync" in canonical and "async" in canonical
    assert "普通文本 final" in canonical
    assert "JSON" in canonical
    assert "稳定消息ID" in canonical
    assert "gewehub_revoke_message" in canonical

    forbidden_history = (
        "旧布尔",
        "布尔 `send`",
        "removed boolean",
        "legacy `send`",
        "旧 `send`",
        "已删除",
        "不再兼容",
        "sendRequestId",
        "原始 GeWe ID",
        "传输请求编号",
        "底层提供方编号",
        "第一版",
    )
    assert not any(term in combined for term in forbidden_history)

    canonical_protocol_heading = "## 投递与执行"
    assert canonical.count(canonical_protocol_heading) == 1
    assert all(
        canonical_protocol_heading not in path.read_text(encoding="utf-8")
        for path in supporting_paths
    )


def test_chenkele_persona_is_concise_distinctive_and_non_mechanical():
    persona = (PLUGIN_DIR / "skill" / "chenkele-persona" / "SKILL.md").read_text(encoding="utf-8")

    assert len(persona) <= 1800
    for required in (
        "风格边界",
        "简洁",
        "口语化",
        "为啥",
        "怎么说",
        "你看看是不是",
        "不机械",
        "复杂",
        "转发聊天记录",
        "用户纠正",
    ):
        assert required in persona

    for forbidden in (
        "刷票",
        "把车卖了",
        "年入百万",
        "故意制造错别字",
    ):
        assert forbidden not in persona


def test_platform_hint_is_concise_and_describes_only_current_behavior():
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_platform_hint_test")
    captured = {}
    ctx = SimpleNamespace(
        register_platform=lambda **kwargs: captured.update(kwargs),
        register_tool=lambda **kwargs: None,
    )

    package.register(ctx)
    hint = captured["platform_hint"]

    assert len(hint) <= 1200
    for required in (
        "Plain final text",
        "JSON",
        "gewehub_send_message",
        "replyToMessageId",
        "stable messageId",
        "gewehub_revoke_message",
        "deliveryMode",
        "executionMode",
        "pure JSON string",
        "first character must be {",
        "last character must be }",
        "no Markdown code fences",
        "no text before or after",
    ):
        assert required in hint

    for forbidden in (
        "removed",
        "deprecated",
        "legacy",
        "boolean send",
        "pending",
        "held",
        "sendRequestId",
        "transport request",
        "raw provider",
        "queue",
    ):
        assert forbidden not in hint


def test_ai_facing_guidance_defines_discard_final_mentions_and_is_self_contained():
    root_skill = (PLUGIN_DIR / "skill" / "SKILL.md").read_text(encoding="utf-8")
    delivery_skill = (
        PLUGIN_DIR / "skill" / "gewehub-wechat-delivery-patterns" / "SKILL.md"
    ).read_text(encoding="utf-8")
    readme = (PLUGIN_DIR / "README.md").read_text(encoding="utf-8")
    combined = "\n".join((root_skill, delivery_skill, readme))

    assert '"deliveryMode":"discard"' in root_skill
    assert '"type":"text"' in root_skill
    assert '"text":' in root_skill
    assert "不要使用 Markdown 代码块" in root_skill
    discard_line = next(line for line in root_skill.splitlines() if '"deliveryMode":"discard"' in line)
    assert discard_line.startswith('`{"deliveryMode"') and discard_line.endswith('}`')
    assert "工具已发送完整答复" in root_skill
    assert "final" in root_skill
    assert "不发送" in root_skill
    assert "mentions" in combined
    assert "正文" in combined
    assert "@昵称" in combined
    assert "每个" in combined
    assert "具体投递工作流见" not in root_skill


def test_discard_final_json_is_a_valid_standard_message():
    package = _load_plugin_package("gewehub_plugin_discard_final_test")

    assert package.outbound.normalize_final_output(
        "cvs_1",
        '{"deliveryMode":"discard","type":"text","text":"本轮已通过工具完成回复"}',
    ).payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "本轮已通过工具完成回复",
        "deliveryMode": "discard",
        "executionMode": "sync",
    }


def test_normalize_final_output_accepts_fenced_standard_json_without_sending_the_fence():
    package = _load_plugin_package("gewehub_plugin_fenced_final_test")
    content = """```json
{"deliveryMode":"discard","type":"text","text":"普通闲聊，无需回复"}
```"""

    assert package.outbound.normalize_final_output("cvs_1", content).payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "普通闲聊，无需回复",
        "deliveryMode": "discard",
        "executionMode": "sync",
    }


def test_normalize_final_output_supports_plain_text_and_standard_json():
    package = _load_plugin_package("gewehub_plugin_outbound_normalizer_test")

    assert package.outbound.normalize_final_output("cvs_1", "普通文本").payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "普通文本",
        "deliveryMode": "immediate",
            "executionMode": "sync",
        "executionMode": "sync",
    }
    assert package.outbound.normalize_final_output(
        "cvs_1", '{"type":"text","text":"标准 JSON"}'
    ).payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "标准 JSON",
        "deliveryMode": "immediate",
            "executionMode": "sync",
        "executionMode": "sync",
    }
    assert package.outbound.normalize_final_output(
        "cvs_1", '{"deliveryMode":"confirm","executionMode":"async","type":"text","text":"待确认"}'
    ).payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "待确认",
        "deliveryMode": "confirm",
            "executionMode": "sync",
        "executionMode": "async",
    }


def test_normalize_final_output_treats_legacy_boolean_send_as_plain_text():
    package = _load_plugin_package("gewehub_plugin_outbound_no_legacy_send_test")
    raw = '{"send":false,"content":"旧协议"}'

    assert package.outbound.normalize_final_output("cvs_1", raw).payload == {
        "conversationId": "cvs_1",
        "type": "text",
        "text": raw,
        "deliveryMode": "immediate",
            "executionMode": "sync",
        "executionMode": "sync",
    }
    assert package.tools.send_payload_from_args(
        {"conversationId": "cvs_1", "type": "text", "text": "x", "send": False}
    ) == {"error": "send is not supported; use deliveryMode"}


def test_all_outbound_payloads_default_and_validate_execution_mode():
    package = _load_plugin_package("gewehub_plugin_outbound_execution_mode_test")

    assert package.tools.send_payload_from_args(
        {"conversationId": "cvs_1", "type": "text", "text": "hello"}
    )["executionMode"] == "sync"
    assert package.tools.send_payload_from_args(
        {"conversationId": "cvs_1", "type": "text", "text": "hello", "executionMode": "async"}
    )["executionMode"] == "async"
    assert package.tools.send_payload_from_args(
        {"conversationId": "cvs_1", "type": "text", "text": "hello", "executionMode": "later"}
    ) == {"error": "executionMode must be one of sync, async"}


@pytest.mark.asyncio
async def test_dispatch_standard_uses_single_client_entry_and_filters_response():
    package = _load_plugin_package("gewehub_plugin_outbound_dispatch_test")
    calls = []

    class Client:
        async def send_message_payload(self, payload):
            calls.append(payload)
            return {
                "success": True,
                "messageId": "msg_1",
                "url": "https://hub.example.test/u/1",
                "accepted": True,
                "pending": True,
                "held": False,
                "sendRequestId": "req_1",
                "htmlPageId": "page_1",
                "htmlHosted": True,
            }

    payload = {
        "conversationId": "cvs_1",
        "type": "text",
        "text": "hello",
        "deliveryMode": "immediate",
            "executionMode": "sync",
        "executionMode": "sync",
    }
    assert await package.outbound.dispatch_standard(Client(), payload) == {
        "success": True,
        "messageId": "msg_1",
        "url": "https://hub.example.test/u/1",
        "accepted": True,
    }
    assert calls == [payload]


@pytest.mark.asyncio
async def test_revoke_tool_posts_stable_message_id_and_returns_standard_response(monkeypatch):
    package = _load_plugin_package("gewehub_plugin_revoke_tool_test")
    monkeypatch.setattr(
        package.tools,
        "resolve_gewehub_connection",
        lambda: {"base_url": "https://hub.example.test", "app_token": "app_token"},
    )
    calls = []

    class Client:
        def __init__(self, base_url, *, app_token):
            assert base_url == "https://hub.example.test"
            assert app_token == "app_token"

        async def revoke_message(self, message_id):
            calls.append(message_id)
            return {"success": True, "messageId": message_id, "accepted": True, "pending": True}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.tools, "GeWeHubClient", Client)
    result = json.loads(await package.tools.handle_gewehub_revoke_message({"messageId": "msg_stable_1"}))

    assert calls == ["msg_stable_1"]
    assert result == {"success": True, "messageId": "msg_stable_1", "accepted": True}


def test_config_resolver_prefers_hermes_profile_loader(monkeypatch, tmp_path):
    config_mod = _load_module("gewehub_config_profile_loader_test", PLUGIN_DIR / "config.py")
    hermes_pkg = types.ModuleType("hermes_cli")
    hermes_config = types.ModuleType("hermes_cli.config")
    calls = []

    def fake_load_config():
        calls.append("load_config")
        return {
            "platforms": {
                "gewehub": {
                    "extra": {
                        "base_url": "https://profile-loader.example.test",
                        "app_token": "profile_loader_token",
                    }
                }
            }
        }

    hermes_config.load_config = fake_load_config
    monkeypatch.setitem(sys.modules, "hermes_cli", hermes_pkg)
    monkeypatch.setitem(sys.modules, "hermes_cli.config", hermes_config)
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        """
platforms:
  gewehub:
    extra:
      base_url: "https://fallback-file.example.test"
      app_token: "fallback_file_token"
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    monkeypatch.delenv("GEWEHUB_BASE_URL", raising=False)
    monkeypatch.delenv("GEWEHUB_APP_TOKEN", raising=False)

    connection = config_mod.resolve_gewehub_connection()

    assert calls == ["load_config"]
    assert connection == {
        "base_url": "https://profile-loader.example.test",
        "app_token": "profile_loader_token",
    }



def test_apply_yaml_config_preserves_group_command_allowlist():
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_group_command_config_test")

    extra = package.adapter.apply_yaml_config(
        {},
        {
            "extra": {
                "base_url": "https://hub.example.test",
                "app_token": "app_token",
                "group_command_allowed_users": {"cvs_group": ["wxid_admin", "wxid_operator"]},
            }
        },
    )

    assert extra == {
        "base_url": "https://hub.example.test",
        "app_token": "app_token",
        "group_command_allowed_users": {"cvs_group": ["wxid_admin", "wxid_operator"]},
    }

def test_adapter_instantiates_with_real_hermes_base():
    hermes_server = Path("/Users/agent/project/hermes-agent-pro/server")
    if not (hermes_server / "gateway/platforms/base.py").is_file():
        pytest.skip("Hermes server checkout is not available on this machine")
    for key in list(sys.modules):
        if key == "gateway" or key.startswith("gateway."):
            sys.modules.pop(key)
    sys.path.insert(0, str(hermes_server))
    try:
        package = _load_plugin_package("gewehub_plugin_real_base_test")
        adapter = package.adapter.GeWeHubAdapter(SimpleNamespace(extra={}))
        info = _run_async(adapter.get_chat_info("cvs_real"))
    finally:
        try:
            sys.path.remove(str(hermes_server))
        except ValueError:
            pass

    assert info == {"name": "cvs_real", "type": "dm", "chat_id": "cvs_real"}


def test_register_exposes_hermes_platform_hooks():
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_register_test")
    ctx = SimpleNamespace(register_platform=lambda **kwargs: kwargs)
    captured = {}
    tools = []

    def register_platform(**kwargs):
        captured.update(kwargs)

    ctx.register_platform = register_platform
    ctx.register_tool = lambda **kwargs: tools.append(kwargs)

    package.register(ctx)

    assert captured["name"] == "gewehub"
    assert captured["adapter_factory"]
    assert captured["cron_deliver_env_var"] == "GEWEHUB_HOME_CONVERSATION_ID"
    assert captured["standalone_sender_fn"]
    assert captured["required_env"] == ["GEWEHUB_BASE_URL", "GEWEHUB_APP_TOKEN"]
    assert captured["allowed_users_env"] == "GEWEHUB_ALLOWED_USERS"
    assert captured["allow_all_env"] == "GEWEHUB_ALLOW_ALL_USERS"
    assert "gewehub_send_message" in captured["platform_hint"]
    assert "replyToMessageId" in captured["platform_hint"]
    assert "stable messageId" in captured["platform_hint"]
    assert "gewehub_revoke_message" in captured["platform_hint"]
    assert "deliveryMode\":\"discard" in captured["platform_hint"]
    assert "@nickname" in captured["platform_hint"]
    assert [tool["name"] for tool in tools] == ["gewehub_send_message", "gewehub_revoke_message"]
    assert all(tool["toolset"] == "gewehub" for tool in tools)
    assert all(tool["is_async"] is True for tool in tools)
    send_tool, revoke_tool = tools
    send_props = send_tool["schema"]["parameters"]["properties"]
    assert "base_url" not in send_props and "app_token" not in send_props
    assert "send" not in send_props
    assert send_props["deliveryMode"]["enum"] == ["immediate", "discard", "confirm"]
    assert send_props["executionMode"]["enum"] == ["sync", "async"]
    assert revoke_tool["schema"]["parameters"]["required"] == ["messageId"]
    assert set(revoke_tool["schema"]["parameters"]["properties"]) == {"messageId"}


def test_tool_prompts_are_concise_current_and_actionable():
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_tool_prompt_test")
    captured_tools = []
    ctx = SimpleNamespace(
        register_platform=lambda **kwargs: None,
        register_tool=lambda **kwargs: captured_tools.append(kwargs),
    )

    package.register(ctx)
    registered = {tool["name"]: tool for tool in captured_tools}
    send_schema = package.tools.GEWEHUB_SEND_MESSAGE_SCHEMA
    revoke_schema = package.tools.GEWEHUB_REVOKE_MESSAGE_SCHEMA
    send_props = send_schema["parameters"]["properties"]

    assert len(send_schema["description"]) <= 240
    assert "messageId" in send_schema["description"]
    assert "reply" in send_schema["description"]
    assert "revoke" in send_schema["description"]

    assert "record without delivery" in send_props["deliveryMode"]["description"]
    assert "human confirmation" in send_props["deliveryMode"]["description"]
    assert "synchronous" in send_props["executionMode"]["description"]
    assert "text message" in send_props["mentions"]["description"]
    assert "Every ID" in send_props["mentions"]["description"]
    assert "@nickname" in send_props["mentions"]["description"]
    assert "conversation context" in send_props["replyToMessageId"]["description"]
    assert "send result" in send_props["replyToMessageId"]["description"]
    assert "text messages" in send_props["replyToMessageId"]["description"]
    assert "Required for remote video" in send_props["thumbUrl"]["description"]
    assert "requestId" not in send_props
    assert "fileUrl" not in send_props
    assert "file" in send_props["mediaUrl"]["description"]
    assert "idempotencyKey" in send_props

    assert "current GeWeHub account" in revoke_schema["description"]
    assert "successful send result" in revoke_schema["parameters"]["properties"]["messageId"]["description"]
    assert registered["gewehub_send_message"]["description"] == "Send a GeWeHub message and return its stable messageId."
    assert registered["gewehub_revoke_message"]["description"] == (
        "Revoke a message sent by the current GeWeHub account using its messageId."
    )

    prompt_text = " ".join(
        [
            send_schema["description"],
            revoke_schema["description"],
            *(prop.get("description", "") for prop in send_props.values()),
            registered["gewehub_send_message"]["description"],
            registered["gewehub_revoke_message"]["description"],
        ]
    )
    for forbidden in (
        "/api/send",
        "held",
        "management UI",
        "quote=true",
        "Markdown quote",
        "sendRequestId",
        "removed",
        "deprecated",
        "legacy",
    ):
        assert forbidden not in prompt_text


@pytest.mark.asyncio
async def test_standalone_sender_uses_config_and_idempotency_key(monkeypatch):
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_standalone_test")
    sent = []

    class FakeStandaloneClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append({"base_url": self.base_url, "app_token": self.app_token, **payload})
            return {"success": True, "messageId": "msg_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})

    result = await package.adapter._standalone_send(cfg, "cvs_1", "hello", thread_id="thread_1")

    assert result == {"success": True, "message_id": "msg_1", "raw_response": {"success": True, "messageId": "msg_1"}}
    assert sent == [
        {
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "conversationId": "cvs_1",
            "type": "text",
            "text": "hello",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "idempotencyKey": "hermes-gewehub-thread_1-cvs_1-text-8ef6b9c93d0bfed7",
        }
    ]


@pytest.mark.asyncio
async def test_standalone_sender_cron_wrapped_json_envelope_sends_message_payload(monkeypatch, tmp_path):
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_standalone_cron_json_test")
    sent_payloads = []
    html_file = tmp_path / "cron-card.html"
    html_file.write_bytes(b"<!doctype html>\n")

    class FakeStandaloneClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_text(self, conversation_id, text, idempotency_key=None):
            raise AssertionError("cron JSON should not fall back to send_text")

        async def send_message_payload(self, payload):
            sent_payloads.append(dict(payload))
            return {"success": True, "messageId": "msg_payload_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    wrapped = (
        "Cronjob Response: one-minute-html-send-test\n"
        "(job_id: 6e9d2665f233)\n"
        "-------------\n\n"
        + json.dumps(
            {
                "deliveryMode": "immediate",
            "executionMode": "sync",
                "type": "html",
                "title": "1 分钟测试卡片",
                "desc": "一个简单好看的移动端 HTML 测试卡片",
                "file": str(html_file),
                "idempotencyKey": "test-one-minute-html-card-20260710",
            },
            ensure_ascii=False,
        )
        + "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder one-minute-html-send-test\")."
    )

    result = await package.adapter._standalone_send(cfg, "cvs_1", wrapped, thread_id="thread_1")

    assert result == {"success": True, "message_id": "msg_payload_1", "raw_response": {"success": True, "messageId": "msg_payload_1"}}
    assert sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "html",
                "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "1 分钟测试卡片",
            "desc": "一个简单好看的移动端 HTML 测试卡片",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+Cg==",
            "htmlFileName": "cron-card.html",
            "idempotencyKey": "test-one-minute-html-card-20260710",
        }
    ]


@pytest.mark.asyncio
async def test_standalone_sender_strips_cron_wrapper_before_text_send(monkeypatch):
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_standalone_cron_text_test")
    sent = []

    class FakeStandaloneClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(dict(payload))
            return {"success": True, "messageId": "msg_text_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    wrapped = (
        "Cronjob Response: wake-up-reminder-10am\n"
        "(job_id: d5426c8ea278)\n"
        "-------------\n\n"
        "该起床啦～"
        "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder wake-up-reminder-10am\")."
    )

    result = await package.adapter._standalone_send(cfg, "cvs_1", wrapped, thread_id="thread_1")

    assert result == {"success": True, "message_id": "msg_text_1", "raw_response": {"success": True, "messageId": "msg_text_1"}}
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "text": "该起床啦～",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "idempotencyKey": package.adapter._generated_idempotency_key("thread_1", "cvs_1", "该起床啦～", "text"),
        }
    ]


@pytest.mark.asyncio
async def test_standalone_sender_sends_media_files(monkeypatch, tmp_path):
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_standalone_media_test")
    sent = []

    class FakeStandaloneClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(dict(payload))
            return {"success": True, "messageId": "msg_media_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    image_path = tmp_path / "result.png"
    image_path.write_bytes(b"\x89PNG\r\n")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})

    result = await package.adapter._standalone_send(cfg, "cvs_1", "", thread_id="thread_1", media_files=[(str(image_path), False)])

    assert result == {"success": True, "message_id": "msg_media_1", "raw_response": {"success": True, "messageId": "msg_media_1"}}
    expected_idempotency_key = package.adapter._generated_idempotency_key("thread_1", "cvs_1", str(image_path), 0, "media")
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "image",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "contentBase64": "iVBORw0K",
            "fileName": "result.png",
            "mimeType": "image/png",
            "idempotencyKey": expected_idempotency_key,
        }
    ]


def test_normalizer_maps_standard_envelope_fields():
    normalizer = _load_module("gewehub_normalizer_test", PLUGIN_DIR / "normalizer.py")
    event = normalizer.normalize_event(_delivery_event("evt_1", "msg_1", "hello", debounce_ms=1200))

    assert event.event_id == "evt_1"
    assert event.event_type == "message.created"
    assert event.message_id == "msg_1"
    assert event.conversation["id"] == "cvs_1"
    assert event.sender["wxid"] == "wxid_user"
    assert event.rendered_text == "hello"
    assert normalizer.is_plain_text_event(event) is True
    assert normalizer.dedupe_key_for_event(event) == "event:evt_1"
    assert normalizer.debounce_config(event, default_debounce_ms=0, default_max_wait_ms=0) == (1200, 5000)


def test_normalizer_prefers_rendered_md_for_ai_text():
    normalizer = _load_module("gewehub_normalizer_rendered_md_test", PLUGIN_DIR / "normalizer.py")
    raw = _delivery_event("evt_md", "msg_md", "旧摘要")
    raw["payload"]["renderedMd"] = (
        "[上下文]\n"
        "消息ID: msg_md\n"
        "会话: User (private, cvs_1)\n"
        "发送者: User <wxid_user>\n\n"
        "[正文]\n"
        "完整 Markdown 正文"
    )

    event = normalizer.normalize_event(raw)

    assert event.rendered_text.startswith("[上下文]")
    assert "消息ID: msg_md" in normalizer.event_text(event)
    assert "完整 Markdown 正文" in normalizer.event_text(event)


def test_normalizer_detects_media_and_quote_context():
    normalizer = _load_module("gewehub_normalizer_media_test", PLUGIN_DIR / "normalizer.py")
    raw = _delivery_event("evt_2", "msg_2", "[图片]", message_type="image")
    raw["payload"]["content"]["media"] = {
        "url": "https://gewehub.example.test/files/a.png",
        "status": "ready",
        "fileName": "a.png",
        "mimeType": "image/png",
    }
    raw["payload"]["quote"] = {
        "type": "text",
        "text": "quoted",
        "sourceMessageId": "msg_q",
        "senderName": "Alice",
    }

    event = normalizer.normalize_event(raw)

    assert normalizer.is_plain_text_event(event) is False
    assert normalizer.media_descriptors(event)[0]["url"].endswith("/a.png")
    assert normalizer.reply_context(event) == {
        "message_id": "msg_q",
        "text": "quoted",
        "author_id": None,
        "author_name": "Alice",
        "is_own_message": False,
    }


def test_bounded_ttl_set_tracks_duplicates_and_evicts(monkeypatch):
    dedupe = _load_module("gewehub_dedupe_test", PLUGIN_DIR / "dedupe.py")
    now = 1000.0
    monkeypatch.setattr(dedupe.time, "time", lambda: now)
    seen = dedupe.BoundedTTLSet(ttl_seconds=10, max_size=2)

    assert seen.add("a") is True
    assert seen.add("a") is False
    assert seen.add("b") is True
    assert seen.add("c") is True
    assert seen.contains("a") is False
    assert seen.contains("b") is True
    now = 1011.0
    assert seen.contains("b") is False


def test_state_store_persists_last_event_and_seen_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    state = _load_module("gewehub_state_test", PLUGIN_DIR / "state.py")
    store = state.GeWeHubStateStore(base_url="https://hub.example.test", app_token="secret")

    store.save_last_event_id("evt_9")
    store.save_seen_keys([{"key": "event:evt_9", "seen_at": 1.5}])

    second = state.GeWeHubStateStore(base_url="https://hub.example.test", app_token="secret")
    assert second.load_last_event_id() == "evt_9"
    assert second.load_seen_keys() == [{"key": "event:evt_9", "seen_at": 1.5}]
    assert "secret" not in str(second.path)


@pytest.mark.asyncio
async def test_client_sse_ack_and_send_use_bearer_token(tmp_path):
    client_mod = _load_module("gewehub_client_test", PLUGIN_DIR / "client.py")
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["authorization"] == "Bearer app_token"
        if request.url.path == "/api/apps/events":
            assert request.headers["last-event-id"] == "evt_0"
            body = (
                "id: evt_1\n"
                "event: message.created\n"
                "data: {\"eventId\":\"evt_1\",\"eventType\":\"message.created\",\"payload\":{}}\n\n"
            )
            return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})
        if request.url.path == "/api/apps/events/ack":
            assert json.loads(request.content) == {"eventIds": ["evt_1", "evt_2"]}
            return httpx.Response(200, json={"ok": True, "acked": 2})
        if request.url.path == "/api/send":
            assert json.loads(request.content) == {
                "conversationId": "cvs_1",
                "type": "text",
                "text": "hi",
                "deliveryMode": "immediate",
            "executionMode": "sync",
                "idempotencyKey": "idem_1",
            }
            return httpx.Response(200, json={"id": "send_1", "status": "sent", "messageId": "msg_send"})
        raise AssertionError(f"unexpected path {request.url.path}")

    client = client_mod.GeWeHubClient(
        "https://hub.example.test",
        app_token="app_token",
        transport=httpx.MockTransport(handler),
    )

    events = [item async for item in client.iter_sse_events(last_event_id="evt_0")]
    assert events == [
        {
            "id": "evt_1",
            "event": "message.created",
            "data": "{\"eventId\":\"evt_1\",\"eventType\":\"message.created\",\"payload\":{}}",
        }
    ]
    assert await client.ack_events(["evt_1", "evt_2"]) == {"ok": True, "acked": 2}
    assert (await client.send_text("cvs_1", "hi", idempotency_key="idem_1"))["messageId"] == "msg_send"
    await client.aclose()


@pytest.mark.asyncio
async def test_client_revoke_posts_only_stable_message_id_path():
    client_mod = _load_module("gewehub_client_revoke_test", PLUGIN_DIR / "client.py")
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append({"method": request.method, "path": request.url.path, "content": request.content})
        return httpx.Response(200, json={"success": True, "messageId": "msg_stable_1", "accepted": True})

    client = client_mod.GeWeHubClient(
        "https://hub.example.test",
        app_token="app_token",
        transport=httpx.MockTransport(handler),
    )
    result = await client.revoke_message("msg_stable_1")
    await client.aclose()

    assert result == {"success": True, "messageId": "msg_stable_1", "accepted": True}
    assert requests == [{"method": "POST", "path": "/api/messages/msg_stable_1/revoke", "content": b""}]


@pytest.mark.asyncio
async def test_client_send_text_includes_mentions_and_reply_to_when_present():
    client_mod = _load_module("gewehub_client_text_reply_test", PLUGIN_DIR / "client.py")
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "send_1", "status": "pending", "messageId": "msg_send"})

    client = client_mod.GeWeHubClient(
        "https://hub.example.test",
        app_token="app_token",
        transport=httpx.MockTransport(handler),
    )

    await client.send_text(
        "cvs_1",
        "@Alice hello",
        mentions=["wxid_alice", "wxid_bob"],
        reply_to_message_id="msg_quoted",
    )
    await client.aclose()

    assert requests == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "text": "@Alice hello",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "mentions": ["wxid_alice", "wxid_bob"],
            "replyToMessageId": "msg_quoted",
        }
    ]


def test_client_sse_stream_waits_for_server_heartbeat_without_client_read_timeout():
    client_mod = _load_module("gewehub_client_timeout_test", PLUGIN_DIR / "client.py")

    assert client_mod._SSE_TIMEOUT.read is None


@pytest.mark.asyncio
async def test_client_send_html_sources_use_html_payload(tmp_path):
    client_mod = _load_module("gewehub_client_html_test", PLUGIN_DIR / "client.py")
    html_file = tmp_path / "report.html"
    html_file.write_text("<!doctype html><html>file</html>", encoding="utf-8")
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": f"send_{len(requests)}",
                "status": "pending",
                "url": f"https://gewehub.yunzxu.com/h/{len(requests)}",
                "htmlPageId": f"html_{len(requests)}",
                "htmlHosted": True,
            },
        )

    client = client_mod.GeWeHubClient(
        "https://hub.example.test",
        app_token="app_token",
        transport=httpx.MockTransport(handler),
    )

    content_result = await client.send_html(
        "cvs_1",
        title="日报",
        desc="今日 AI 日报",
        html_content="<html>content</html>",
        thumb_url="https://example.com/cover.jpg",
        idempotency_key="html_content_1",
    )
    file_result = await client.send_html(
        "cvs_1",
        title="文件报告",
        desc="本地 HTML 文件",
        html_file_path=str(html_file),
    )
    url_result = await client.send_html(
        "cvs_1",
        title="外部报告",
        desc="外部托管",
        link_url="https://example.com/report.html",
    )
    await client.aclose()

    assert content_result["url"] == "https://gewehub.yunzxu.com/h/1"
    assert file_result["url"] == "https://gewehub.yunzxu.com/h/2"
    assert url_result["url"] == "https://gewehub.yunzxu.com/h/3"
    assert requests == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "日报",
            "desc": "今日 AI 日报",
            "htmlContent": "<html>content</html>",
            "thumbUrl": "https://example.com/cover.jpg",
            "idempotencyKey": "html_content_1",
        },
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "文件报告",
            "desc": "本地 HTML 文件",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+ZmlsZTwvaHRtbD4=",
            "htmlFileName": "report.html",
        },
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "外部报告",
            "desc": "外部托管",
            "linkUrl": "https://example.com/report.html",
        },
    ]


def test_cli_send_html_file_outputs_public_url(monkeypatch, tmp_path, capsys):
    cli_mod = _load_module("gewehub_cli_file_test", PLUGIN_DIR / "cli.py")
    html_file = tmp_path / "report.html"
    html_file.write_text("<!doctype html><html>cli</html>", encoding="utf-8")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(dict(payload))
            return {
                "id": "send_html_file",
                "status": "pending",
                "messageId": "msg_html",
                "url": "https://gewehub.yunzxu.com/h/html_cli",
                "htmlPageId": "html_cli",
                "htmlHosted": True,
            }

        async def aclose(self):
            return None

    monkeypatch.setattr(cli_mod, "GeWeHubClient", FakeClient)

    exit_code = _run_async(
        cli_mod.run(
            [
                "send-html",
                "--base-url",
                "https://hub.example.test",
                "--app-key",
                "app_token",
                "--conversation-id",
                "cvs_1",
                "--title",
                "CLI 报告",
                "--desc",
                "本地文件",
                "--thumb-url",
                "https://example.com/cover.jpg",
                "--file",
                str(html_file),
            ]
        )
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "CLI 报告",
            "desc": "本地文件",
            "thumbUrl": "https://example.com/cover.jpg",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+Y2xpPC9odG1sPg==",
            "htmlFileName": "report.html",
        }
    ]
    assert output == {
        "success": True,
        "message_id": 'msg_html',
        "url": 'https://gewehub.yunzxu.com/h/html_cli',
        "accepted": None,
    }


def test_cli_send_html_stdin_outputs_public_url(monkeypatch, capsys):
    cli_mod = _load_module("gewehub_cli_stdin_test", PLUGIN_DIR / "cli.py")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(dict(payload))
            return {
                "id": "send_html_stdin",
                "status": "pending",
                "url": "https://gewehub.yunzxu.com/h/html_stdin",
                "htmlPageId": "html_stdin",
                "htmlHosted": True,
            }

        async def aclose(self):
            return None

    monkeypatch.setattr(cli_mod, "GeWeHubClient", FakeClient)
    monkeypatch.setattr(cli_mod.sys, "stdin", io.StringIO("<html>stdin</html>"))

    exit_code = _run_async(
        cli_mod.run(
            [
                "send-html",
                "--base-url",
                "https://hub.example.test",
                "--app-key",
                "app_token",
                "--conversation-id",
                "cvs_1",
                "--title",
                "STDIN 报告",
                "--stdin",
            ]
        )
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "STDIN 报告",
            "htmlContent": "<html>stdin</html>",
        }
    ]
    assert output["url"] == "https://gewehub.yunzxu.com/h/html_stdin"
    assert "sendRequestId" not in output


def test_cli_send_html_reads_hermes_config_when_auth_args_omitted(monkeypatch, tmp_path, capsys):
    cli_mod = _load_module("gewehub_cli_config_test", PLUGIN_DIR / "cli.py")
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        """
platforms:
  gewehub:
    enabled: true
    extra:
      base_url: "https://config-hub.example.test"
      app_token: "config_app_token"
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    monkeypatch.delenv("GEWEHUB_BASE_URL", raising=False)
    monkeypatch.delenv("GEWEHUB_APP_TOKEN", raising=False)
    clients = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            clients.append({"base_url": base_url, "app_token": app_token})

        async def send_message_payload(self, payload):
            return {
                "id": "send_html_config",
                "status": "pending",
                "url": "https://config-hub.example.test/h/html_config",
                "htmlPageId": "html_config",
                "htmlHosted": True,
            }

        async def aclose(self):
            return None

    monkeypatch.setattr(cli_mod, "GeWeHubClient", FakeClient)

    exit_code = _run_async(
        cli_mod.run(
            [
                "send-html",
                "--conversation-id",
                "cvs_1",
                "--title",
                "配置报告",
                "--content",
                "<html>config</html>",
            ]
        )
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert clients == [{"base_url": "https://config-hub.example.test", "app_token": "config_app_token"}]
    assert output["url"] == "https://config-hub.example.test/h/html_config"


def test_cli_send_html_explicit_auth_args_override_hermes_config(monkeypatch, tmp_path, capsys):
    cli_mod = _load_module("gewehub_cli_config_override_test", PLUGIN_DIR / "cli.py")
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        """
platforms:
  gewehub:
    extra:
      base_url: "https://config-hub.example.test"
      app_token: "config_app_token"
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    monkeypatch.delenv("GEWEHUB_BASE_URL", raising=False)
    monkeypatch.delenv("GEWEHUB_APP_TOKEN", raising=False)
    clients = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            clients.append({"base_url": base_url, "app_token": app_token})

        async def send_message_payload(self, payload):
            return {"id": "send_html_override", "status": "pending"}

        async def aclose(self):
            return None

    monkeypatch.setattr(cli_mod, "GeWeHubClient", FakeClient)

    exit_code = _run_async(
        cli_mod.run(
            [
                "send-html",
                "--base-url",
                "https://arg-hub.example.test",
                "--app-key",
                "arg_app_token",
                "--conversation-id",
                "cvs_1",
                "--title",
                "覆盖报告",
                "--content",
                "<html>override</html>",
            ]
        )
    )

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out)["success"] is True
    assert clients == [{"base_url": "https://arg-hub.example.test", "app_token": "arg_app_token"}]


@pytest.mark.asyncio
async def test_gewehub_send_message_tool_sends_text_with_common_params(monkeypatch):
    tools_mod = _load_module("gewehub_tools_send_message_text_test", PLUGIN_DIR / "tools.py")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(
                {
                    "base_url": self.base_url,
                    "app_token": self.app_token,
                    "payload": payload,
                }
            )
            return {
                "id": "send_text_tool",
                "status": "pending",
                "messageId": "msg_text_tool",
            }

        async def aclose(self):
            return None

    monkeypatch.setattr(tools_mod, "GeWeHubClient", FakeClient)
    monkeypatch.setattr(
        tools_mod,
        "resolve_gewehub_connection",
        lambda: {"base_url": "https://profile-hub.example.test", "app_token": "profile_app_token"},
    )

    result = json.loads(
        await tools_mod.handle_gewehub_send_message(
            {
                "conversationId": "cvs_1",
                "type": "text",
                "text": "@可乐 我引用这条回复",
                "mentions": ["wxid_kele"],
                "replyToMessageId": "msg_quoted",
                "idempotencyKey": "text_tool_req_1",
            }
        )
    )

    assert result["success"] is True
    assert result["messageId"] == "msg_text_tool"
    assert sent == [
        {
            "base_url": "https://profile-hub.example.test",
            "app_token": "profile_app_token",
            "payload": {
                "conversationId": "cvs_1",
                "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
                "text": "@可乐 我引用这条回复",
                "mentions": ["wxid_kele"],
                "replyToMessageId": "msg_quoted",
                "idempotencyKey": "text_tool_req_1",
            },
        }
    ]


@pytest.mark.asyncio
async def test_gewehub_send_message_tool_reads_html_file(monkeypatch, tmp_path):
    tools_mod = _load_module("gewehub_tools_send_message_html_test", PLUGIN_DIR / "tools.py")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(payload)
            return {
                "id": "send_html_tool",
                "status": "pending",
                "messageId": "msg_html_tool",
                "url": "https://profile-hub.example.test/h/html_tool",
                "htmlPageId": "html_tool",
                "htmlHosted": True,
            }

        async def aclose(self):
            return None

    monkeypatch.setattr(tools_mod, "GeWeHubClient", FakeClient)
    monkeypatch.setattr(
        tools_mod,
        "resolve_gewehub_connection",
        lambda: {"base_url": "https://profile-hub.example.test", "app_token": "profile_app_token"},
    )
    html_file = tmp_path / "tool-report.html"
    html_file.write_text("<!doctype html><html>tool</html>", encoding="utf-8")

    result = json.loads(
        await tools_mod.handle_gewehub_send_message(
            {
                "conversationId": "cvs_1",
                "type": "html",
                "title": "工具报告",
                "desc": "高层 tool 发送",
                "file": str(html_file),
                "thumbUrl": "https://example.com/cover.jpg",
                "idempotencyKey": "html_tool_req_1",
            }
        )
    )

    assert result["success"] is True
    assert result["url"] == "https://profile-hub.example.test/h/html_tool"
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "工具报告",
            "desc": "高层 tool 发送",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+dG9vbDwvaHRtbD4=",
            "htmlFileName": "tool-report.html",
            "thumbUrl": "https://example.com/cover.jpg",
            "idempotencyKey": "html_tool_req_1",
        }
    ]


@pytest.mark.asyncio
async def test_gewehub_send_message_tool_reads_media_file_with_common_params(monkeypatch, tmp_path):
    tools_mod = _load_module("gewehub_tools_send_message_media_test", PLUGIN_DIR / "tools.py")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent.append(payload)
            return {"id": "send_image_tool", "status": "pending", "messageId": "msg_image_tool"}

        async def aclose(self):
            return None

    monkeypatch.setattr(tools_mod, "GeWeHubClient", FakeClient)
    monkeypatch.setattr(
        tools_mod,
        "resolve_gewehub_connection",
        lambda: {"base_url": "https://profile-hub.example.test", "app_token": "profile_app_token"},
    )
    image_file = tmp_path / "pixel.png"
    image_file.write_bytes(b"image-bytes")

    result = json.loads(
        await tools_mod.handle_gewehub_send_message(
            {
                "conversationId": "cvs_1",
                "type": "image",
                "file": str(image_file),
                "replyToMessageId": "msg_quoted",
                "idempotencyKey": "image_tool_req_1",
            }
        )
    )

    assert result["success"] is True
    assert sent == [
        {
            "conversationId": "cvs_1",
            "type": "image",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "contentBase64": "aW1hZ2UtYnl0ZXM=",
            "fileName": "pixel.png",
            "mimeType": "image/png",
            "replyToMessageId": "msg_quoted",
            "idempotencyKey": "image_tool_req_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_allows_plain_final_after_status_tool_send(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_tool_send_suppression_test")
    sent_payloads = []

    class FakeToolClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_message_payload(self, payload):
            sent_payloads.append(payload)
            return {"id": "send_tool_1", "status": "pending", "messageId": "msg_tool_1"}

        async def aclose(self):
            return None

    tools_mod = importlib.import_module(f"{package.__name__}.tools")
    monkeypatch.setattr(tools_mod, "GeWeHubClient", FakeToolClient)
    monkeypatch.setattr(
        tools_mod,
        "resolve_gewehub_connection",
        lambda: {"base_url": "https://profile-hub.example.test", "app_token": "profile_app_token"},
    )

    tool_result = json.loads(
        await tools_mod.handle_gewehub_send_message(
            {"conversationId": "cvs_1", "type": "html", "title": "报告", "desc": "已生成", "htmlContent": "<html>ok</html>"}
        )
    )
    adapter = package.adapter.GeWeHubAdapter(SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"}))
    adapter._client = _FakeClient()

    final_result = await adapter.send("cvs_1", "最终总结", metadata={"notify": True})
    normal = await adapter.send("cvs_1", "下一轮普通文本")

    assert tool_result["success"] is True
    assert final_result.success is True
    assert normal.success is True
    assert adapter._client.sent_payloads == [
        {"conversationId": "cvs_1", "type": "text", "text": "最终总结", "deliveryMode": "immediate", "executionMode": "sync"},
        {"conversationId": "cvs_1", "type": "text", "text": "下一轮普通文本", "deliveryMode": "immediate", "executionMode": "sync"},
    ]


@pytest.mark.asyncio
async def test_adapter_final_json_text_envelope_sends_message_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_final_json_text_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send(
        "cvs_1",
        json.dumps(
            {
                "deliveryMode": "immediate",
            "executionMode": "sync",
                "type": "text",
                "text": "@可乐 我引用回复",
                "mentions": ["wxid_kele"],
                "replyToMessageId": "msg_quoted",
                "idempotencyKey": "final_req_1",
            },
            ensure_ascii=False,
        ),
        metadata={"notify": True},
    )

    assert result.success is True
    assert result.message_id in {"msg_text", "msg_html"}
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "@可乐 我引用回复",
            "mentions": ["wxid_kele"],
            "replyToMessageId": "msg_quoted",
            "idempotencyKey": "final_req_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_cron_raw_json_envelope_sends_message_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_cron_raw_json_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    html_file = tmp_path / "daily-brief.html"
    html_file.write_bytes(b"<!doctype html>\n")

    result = await adapter.send(
        "cvs_1",
        json.dumps(
            {
                "deliveryMode": "immediate",
            "executionMode": "sync",
                "type": "html",
                "title": "GitHub 热榜简报 2026-07-10",
                "desc": "今日 AI / 开发工具 / 知识库方向精选",
                "file": str(html_file),
                "idempotencyKey": "github-trending-brief-2026-07-10",
            },
            ensure_ascii=False,
        ),
        metadata={"job_id": "4873205d1709"},
    )

    assert result.success is True
    assert result.message_id in {"msg_text", "msg_html"}
    assert adapter._client.sent == []
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "html",
                "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "GitHub 热榜简报 2026-07-10",
            "desc": "今日 AI / 开发工具 / 知识库方向精选",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+Cg==",
            "htmlFileName": "daily-brief.html",
            "idempotencyKey": "github-trending-brief-2026-07-10",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_cron_wrapped_json_envelope_sends_message_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_cron_wrapped_json_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    html_file = tmp_path / "minute-card.html"
    html_file.write_bytes(b"<!doctype html>\n")
    wrapped = (
        "Cronjob Response: one-minute-html-send-test\n"
        "(job_id: 6e9d2665f233)\n"
        "-------------\n\n"
        + json.dumps(
            {
                "deliveryMode": "immediate",
            "executionMode": "sync",
                "type": "html",
                "title": "1 分钟测试卡片",
                "desc": "一个简单好看的移动端 HTML 测试卡片",
                "file": str(html_file),
                "idempotencyKey": "test-one-minute-html-card-20260710",
            },
            ensure_ascii=False,
        )
        + "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder one-minute-html-send-test\")."
    )

    result = await adapter.send("cvs_1", wrapped, metadata={"job_id": "6e9d2665f233"})

    assert result.success is True
    assert result.message_id in {"msg_text", "msg_html"}
    assert adapter._client.sent == []
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "html",
                "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "1 分钟测试卡片",
            "desc": "一个简单好看的移动端 HTML 测试卡片",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+Cg==",
            "htmlFileName": "minute-card.html",
            "idempotencyKey": "test-one-minute-html-card-20260710",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_cron_wrapped_legacy_send_is_plain_text(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_cron_send_false_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    wrapped = (
        "Cronjob Response: one-minute-html-send-test\n"
        "(job_id: 6e9d2665f233)\n"
        "-------------\n\n"
        '{"send": false, "content": "HTML 卡片已发送，最终不再发送文本。"}'
        "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder one-minute-html-send-test\")."
    )

    result = await adapter.send("cvs_1", wrapped, metadata={"job_id": "6e9d2665f233"})

    assert result.success is True
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "text": '{"send": false, "content": "HTML 卡片已发送，最终不再发送文本。"}',
            "deliveryMode": "immediate",
            "executionMode": "sync",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_cron_wrapped_plain_text_strips_wrapper(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_cron_plain_text_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    wrapped = (
        "Cronjob Response: wake-up-reminder-10am\n"
        "(job_id: d5426c8ea278)\n"
        "-------------\n\n"
        "该起床啦～"
        "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder wake-up-reminder-10am\")."
    )

    result = await adapter.send("cvs_1", wrapped, metadata={"job_id": "d5426c8ea278"})

    assert result.success is True
    assert result.message_id in {"msg_text", "msg_html"}
    assert adapter._client.sent_payloads == [
        {"conversationId": "cvs_1", "type": "text", "deliveryMode": "immediate", "text": "该起床啦～", "executionMode": "sync"}
    ]


@pytest.mark.asyncio
async def test_adapter_cron_invalid_json_payload_returns_error(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_cron_invalid_json_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    wrapped = (
        "Cronjob Response: one-minute-html-send-test\n"
        "(job_id: 6e9d2665f233)\n"
        "-------------\n\n"
        '{"send": true, "type": "text"}'
        "\n\nTo stop or manage this job, send me a new message (e.g. \"stop reminder one-minute-html-send-test\")."
    )

    result = await adapter.send("cvs_1", wrapped, metadata={"job_id": "6e9d2665f233"})

    assert result.success is True
    assert adapter._client.sent_payloads[-1]["text"] == '{"send": true, "type": "text"}'


@pytest.mark.asyncio
async def test_adapter_final_legacy_send_is_plain_text(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_final_json_send_false_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send(
        "cvs_1",
        '{"send": false, "content": "已通过工具发送，最终不再发送。"}',
        metadata={"notify": True},
    )

    assert result.success is True
    assert result.message_id in {"msg_text", "msg_html"}
    assert adapter._client.sent[-1]["text"] == '{"send": false, "content": "已通过工具发送，最终不再发送。"}'
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "text": '{"send": false, "content": "已通过工具发送，最终不再发送。"}',
            "deliveryMode": "immediate",
            "executionMode": "sync",
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "content",
    [
        "内部完成说明",
        '{"type": "text", "text": "缺少 send 字段"}',
        '{"send": "true", "type": "text", "text": "send 不是布尔值"}',
    ],
)
async def test_adapter_final_without_explicit_boolean_send_is_sent_as_original_text(tmp_path, monkeypatch, content):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_final_send_whitelist_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send("cvs_1", content, metadata={"notify": True})

    assert result.success is True
    if '"send"' in content:
        assert adapter._client.sent[-1]["text"] == content
        assert adapter._client.sent_payloads[-1]["text"] == content
    elif content.startswith("{"):
        assert adapter._client.sent_payloads[-1]["text"] == "缺少 send 字段"
    else:
        assert adapter._client.sent_payloads[-1]["text"] == content


@pytest.mark.asyncio
async def test_adapter_final_invalid_json_payload_does_not_leak_raw_json(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_final_invalid_json_payload_test")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send("cvs_1", '{"send": true, "type": "text"}', metadata={"notify": True})

    assert result.success is True
    assert adapter._client.sent_payloads[-1]["text"] == '{"send": true, "type": "text"}'


@pytest.mark.asyncio
async def test_adapter_private_slash_command_uses_exact_source_text_and_skips_debounce(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_private_slash_command_test")
    cfg = SimpleNamespace(
        extra={
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "debounce_ms": 1000,
            "max_wait_ms": 5000,
        }
    )
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    event = _delivery_event("evt_1", "msg_1", "/approve always\n", debounce_ms=1000)
    event["payload"]["renderedMd"] = "已渲染的普通消息"

    await adapter._handle_sse_event({"id": "evt_1", "event": "message.created", "data": json.dumps(event)})

    assert [handled.text for handled in adapter.handled_messages] == ["/approve always\n"]
    assert adapter.handled_messages[0].metadata["gewehub"]["inputMode"] == "slash_command"
    assert adapter._pending_batches == {}


@pytest.mark.asyncio
async def test_adapter_group_allowlisted_slash_command_uses_exact_source_text(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_group_allowlisted_slash_command_test")
    cfg = SimpleNamespace(
        extra={
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "debounce_ms": 1000,
            "max_wait_ms": 5000,
            "group_command_allowed_users": {"cvs_group": ["wxid_operator"]},
        }
    )
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    event = _delivery_event("evt_1", "msg_1", "/approve always\n", debounce_ms=1000)
    event["payload"]["conversation"] = {"id": "cvs_group", "type": "group", "wxid": "123@chatroom", "name": "群聊"}
    event["payload"]["sender"] = {"wxid": "wxid_operator", "name": "操作员", "isOwner": False}
    event["payload"]["renderedMd"] = "已渲染的普通消息"

    await adapter._handle_sse_event({"id": "evt_1", "event": "message.created", "data": json.dumps(event)})

    assert [handled.text for handled in adapter.handled_messages] == ["/approve always\n"]
    assert adapter.handled_messages[0].metadata["gewehub"]["inputMode"] == "slash_command"
    assert adapter._pending_batches == {}


@pytest.mark.asyncio
async def test_adapter_group_non_allowlisted_slash_command_uses_rendered_message_path(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_group_non_allowlisted_slash_command_test")
    cfg = SimpleNamespace(
        extra={
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "debounce_ms": 1000,
            "max_wait_ms": 5000,
            "group_command_allowed_users": {"cvs_group": ["wxid_operator"]},
        }
    )
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    event = _delivery_event("evt_1", "msg_1", "/approve always\n", debounce_ms=1000)
    event["payload"]["conversation"] = {"id": "cvs_group", "type": "group", "wxid": "123@chatroom", "name": "群聊"}
    event["payload"]["sender"] = {"wxid": "wxid_member", "name": "普通成员", "isOwner": False}
    event["payload"]["renderedMd"] = "已渲染的普通消息"

    await adapter._handle_sse_event({"id": "evt_1", "event": "message.created", "data": json.dumps(event)})

    assert adapter.handled_messages == []
    assert len(adapter._pending_batches) == 1
    await adapter.flush_pending_batches()
    assert [handled.text for handled in adapter.handled_messages] == ["已渲染的普通消息"]
    assert "inputMode" not in adapter.handled_messages[0].metadata["gewehub"]


@pytest.mark.asyncio
async def test_adapter_acks_on_receive_and_batches_plain_text_after_flush(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(
        extra={
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "debounce_ms": 1000,
            "max_wait_ms": 5000,
        }
    )
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    await adapter._handle_sse_event({"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "a"))})
    await adapter._handle_sse_event({"id": "evt_2", "event": "message.created", "data": json.dumps(_delivery_event("evt_2", "msg_2", "b"))})
    await adapter._drain_ack_tasks(timeout=1.0)

    assert adapter.handled_messages == []
    assert adapter._client.acked == [["evt_1"], ["evt_2"]]
    assert adapter._state_store.load_last_event_id() == "evt_2"

    await adapter.flush_pending_batches()

    assert [event.text for event in adapter.handled_messages] == ["a\n\nb"]
    assert adapter.handled_messages[0].metadata["gewehub"]["batch"] == {
        "count": 2,
        "message_ids": ["msg_1", "msg_2"],
        "event_ids": ["evt_1", "evt_2"],
    }


@pytest.mark.asyncio
async def test_adapter_acknowledges_revoked_without_dispatch(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    revoked = _delivery_event("evt_r", "msg_1", "撤回了一条消息")
    revoked["eventType"] = "message.revoked"
    revoked["payload"]["eventType"] = "message.revoked"
    revoked["payload"]["status"] = "revoked"
    revoked["payload"]["revokedAt"] = "2026-07-06T00:00:00.000Z"

    with caplog.at_level("INFO"):
        await adapter._handle_sse_event({"id": "evt_r", "event": "message.revoked", "data": json.dumps(revoked)})
        await adapter._drain_ack_tasks(timeout=1.0)

    assert adapter.handled_messages == []
    assert adapter._client.acked == [["evt_r"]]
    assert "message revoked" in caplog.text


@pytest.mark.asyncio
async def test_adapter_flushes_pending_text_before_media_event(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(
        extra={
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "debounce_ms": 1000,
            "max_wait_ms": 5000,
        }
    )
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    image = _delivery_event("evt_img", "msg_img", "[图片]", message_type="image")
    image["payload"]["content"]["media"] = {
        "url": "https://hub.example.test/files/a.png",
        "status": "ready",
        "fileName": "a.png",
        "mimeType": "image/png",
    }

    await adapter._handle_sse_event({"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "a"))})
    await adapter._handle_sse_event({"id": "evt_img", "event": "message.created", "data": json.dumps(image)})
    await adapter._drain_ack_tasks(timeout=1.0)

    assert [event.message_id for event in adapter.handled_messages] == ["msg_1", "msg_img"]
    assert adapter._client.acked == [["evt_1"], ["evt_img"]]


@pytest.mark.asyncio
async def test_adapter_acks_and_advances_cursor_before_dispatch_finishes(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    dispatch_started = asyncio.Event()
    dispatch_can_finish = asyncio.Event()

    async def blocked_handle_message(event):
        dispatch_started.set()
        await dispatch_can_finish.wait()
        adapter.handled_messages.append(event)

    adapter.handle_message = blocked_handle_message
    task = asyncio.create_task(
        adapter._handle_sse_event(
            {"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "hello"))}
        )
    )

    try:
        await asyncio.wait_for(dispatch_started.wait(), timeout=1)
        await asyncio.sleep(0)

        assert adapter._state_store.load_last_event_id() == "evt_1"
        assert adapter._last_event_id == "evt_1"
        assert adapter._client.acked == [["evt_1"]]
        assert task.done() is False
    finally:
        dispatch_can_finish.set()
        await task

    assert [event.text for event in adapter.handled_messages] == ["hello"]


@pytest.mark.asyncio
async def test_adapter_ack_failure_does_not_interrupt_dispatch_or_cursor_advance(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient(ack_error=RuntimeError("network timeout"))
    adapter._ack_retry_delays = ()

    with caplog.at_level("WARNING"):
        result = await adapter._handle_sse_event(
            {"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "hello"))}
        )
        await adapter._drain_ack_tasks(timeout=1.0)

    assert result is True
    assert [event.text for event in adapter.handled_messages] == ["hello"]
    assert adapter._client.acked == [["evt_1"]]
    assert adapter._state_store.load_last_event_id() == "evt_1"
    assert "ACK failed" in caplog.text


@pytest.mark.asyncio
async def test_adapter_sse_loop_uses_fresh_stream_client_after_read_timeout(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    clients = []

    class FakeGeWeHubClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token
            self.acked = []
            self.closed = False
            self.index = len(clients)
            clients.append(self)

        async def iter_sse_events(self, *, last_event_id=None):
            if self.index == 0:
                raise AssertionError("shared ACK/send client must not be used for SSE streaming")
            if self.index == 1:
                raise TimeoutError("stale stream")
            yield {"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "hello"))}

        async def ack_events(self, event_ids):
            self.acked.append(list(event_ids))
            return {"ok": True, "acked": len(event_ids)}

        async def aclose(self):
            self.closed = True

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeGeWeHubClient)
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._ack_retry_delays = ()
    adapter._mark_connected()

    async def stop_after_message(event):
        adapter.handled_messages.append(event)
        adapter._mark_disconnected()

    adapter.handle_message = stop_after_message

    await adapter._sse_loop()
    await adapter._drain_ack_tasks(timeout=1.0)

    assert [event.text for event in adapter.handled_messages] == ["hello"]
    assert [client.closed for client in clients[1:]] == [True, True]
    assert clients[0].acked == [["evt_1"]]


@pytest.mark.asyncio
async def test_adapter_send_forwards_execution_mode_from_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_adapter_execution_mode_test")
    adapter = package.adapter.GeWeHubAdapter(
        SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    )
    adapter._client = _FakeClient()

    result = await adapter.send("cvs_1", "async hello", metadata={"executionMode": "async"})

    assert result.success is True
    assert adapter._client.sent_payloads[-1]["executionMode"] == "async"


@pytest.mark.asyncio
async def test_adapter_send_uses_metadata_idempotency_key(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send("cvs_1", "hello", metadata={"request_id": "req_1"})

    assert result.success is True
    assert adapter._client.sent_payloads == [
        {"conversationId": "cvs_1", "type": "text", "deliveryMode": "immediate", "text": "hello", "idempotencyKey": "req_1", "executionMode": "sync"},
    ]


@pytest.mark.asyncio
async def test_adapter_send_forwards_mentions_and_reply_target(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    await adapter.send(
        "cvs_1",
        "@Alice hello",
        reply_to="msg_reply_arg",
        metadata={"mentions": ["wxid_alice", "wxid_bob"], "request_id": "req_2"},
    )
    await adapter.send(
        "cvs_1",
        "metadata reply",
        metadata={"replyToMessageId": "msg_reply_camel", "mentions": ["wxid_carol"]},
    )
    await adapter.send(
        "cvs_1",
        "snake metadata reply",
        metadata={"replyToMessageId": "msg_reply_snake"},
    )
    await adapter.send(
        "cvs_1",
        "@Nested hello",
        metadata={"gewehub": {"replyToMessageId": "msg_reply_nested", "mentions": ["wxid_nested"]}},
    )

    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "@Alice hello",
            "idempotencyKey": "req_2",
            "mentions": ["wxid_alice", "wxid_bob"],
        },
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "metadata reply",
            "mentions": ["wxid_carol"],
            "replyToMessageId": "msg_reply_camel",
        },
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "snake metadata reply",
            "replyToMessageId": "msg_reply_snake",
        },
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "@Nested hello",
            "mentions": ["wxid_nested"],
            "replyToMessageId": "msg_reply_nested",
        },
    ]


@pytest.mark.asyncio
async def test_adapter_ignores_hermes_auto_reply_anchor_for_plain_text(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send(
        "cvs_1",
        "普通回复",
        reply_to="msg_current_user",
        metadata={"notify": True},
    )

    assert result.success is True
    assert adapter._client.sent_payloads == [
        {"conversationId": "cvs_1", "type": "text", "text": "普通回复", "deliveryMode": "immediate", "executionMode": "sync"}
    ]


@pytest.mark.asyncio
async def test_adapter_uses_explicit_gewehub_reply_target_when_present(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send(
        "cvs_1",
        "显式引用回复",
        reply_to="msg_auto_anchor",
        metadata={"gewehub": {"replyToMessageId": "msg_explicit_reply"}},
    )

    assert result.success is True
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "显式引用回复",
            "replyToMessageId": "msg_explicit_reply",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_send_routes_gewehub_html_metadata_to_send_html(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    html_file = tmp_path / "report.html"
    html_file.write_text("<!doctype html><html>report</html>", encoding="utf-8")

    result = await adapter.send(
        "cvs_1",
        "fallback text",
        metadata={
            "gewehub": {
                "sendType": "html",
                "htmlFilePath": str(html_file),
                "title": "日报",
                "desc": "今日内容",
                "thumbUrl": "https://cdn.example.test/cover.jpg",
                "requestId": "html_req_1",
            }
        },
    )

    assert result.success is True
    assert len(adapter._client.html_sent) == 1
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "title": "日报",
            "desc": "今日内容",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+cmVwb3J0PC9odG1sPg==",
            "htmlFileName": "report.html",
            "thumbUrl": "https://cdn.example.test/cover.jpg",
            "idempotencyKey": "html_req_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_send_keeps_regular_gewehub_metadata_as_text(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send(
        "cvs_1",
        "hello",
        metadata={"gewehub": {"requestId": "text_req_1", "mentions": ["wxid_alice"]}},
    )

    assert result.success is True
    assert adapter._client.html_sent == []
    assert adapter._client.sent_payloads == [
        {
            "conversationId": "cvs_1",
            "type": "text",
            "deliveryMode": "immediate",
            "executionMode": "sync",
            "text": "hello",
            "idempotencyKey": "text_req_1",
            "mentions": ["wxid_alice"],
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_local_media_files_with_base64_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    image_path = tmp_path / "screenshot.png"
    image_path.write_bytes(b"\x89PNG\r\n")

    result = await adapter.send_image_file("cvs_1", str(image_path), metadata={"idempotency_key": "img_1"})

    assert result.success is True
    assert adapter._client.media_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "image",
            "content_base64": "iVBORw0K",
            "file_name": "screenshot.png",
            "mime_type": "image/png",
            "duration_ms": None,
            "idempotency_key": "img_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_document_file_path_from_hermes_base(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    file_path = tmp_path / "report.pdf"
    file_path.write_bytes(b"%PDF-1.4")

    result = await adapter.send_document("cvs_1", file_path=str(file_path), metadata={"request_id": "doc_1"})

    assert result.success is True
    assert adapter._client.media_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "file",
            "content_base64": "JVBERi0xLjQ=",
            "file_name": "report.pdf",
            "mime_type": "application/pdf",
            "duration_ms": None,
            "idempotency_key": "doc_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_document_url_without_reading_local_file(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send_document(
        "cvs_1",
        file_url="https://cdn.example.test/report.pdf",
        file_name="report.pdf",
        metadata={"request_id": "doc_url_1"},
    )

    assert result.success is True
    assert adapter._client.media_sent == []
    assert adapter._client.media_url_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "file",
            "url": "https://cdn.example.test/report.pdf",
            "file_name": "report.pdf",
            "idempotency_key": "doc_url_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_voice_file_with_duration(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    voice_path = tmp_path / "reply.webm"
    voice_path.write_bytes(b"voice")

    result = await adapter.send_voice("cvs_1", str(voice_path), metadata={"duration_ms": 2300, "request_id": "voice_1"})

    assert result.success is True
    assert adapter._client.media_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "voice",
            "content_base64": "dm9pY2U=",
            "file_name": "reply.webm",
            "mime_type": "video/webm",
            "duration_ms": 2300,
            "idempotency_key": "voice_1",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_video_file_without_thumb_and_duration(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    video_path = tmp_path / "clip.mp4"
    video_path.write_bytes(b"video")

    result = await adapter.send_video("cvs_1", str(video_path))

    assert result.success is True
    assert adapter._client.media_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "video",
            "content_base64": "dmlkZW8=",
            "file_name": "clip.mp4",
            "mime_type": "video/mp4",
            "duration_ms": None,
            "idempotency_key": None,
        }
    ]


@pytest.mark.asyncio
async def test_adapter_lets_hub_fill_video_thumb_and_duration(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()
    video_path = tmp_path / "clip.mp4"
    thumb_path = tmp_path / "cover.jpg"
    video_path.write_bytes(b"video")
    thumb_path.write_bytes(b"thumb")

    result = await adapter.send_video(
        "cvs_1",
        str(video_path),
        metadata={"duration_ms": 12_000, "thumb_path": str(thumb_path), "request_id": "vid_2"},
    )

    assert result.success is True
    assert adapter._client.media_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "video",
            "content_base64": "dmlkZW8=",
            "file_name": "clip.mp4",
            "mime_type": "video/mp4",
            "duration_ms": None,
            "idempotency_key": "vid_2",
        }
    ]


@pytest.mark.asyncio
async def test_adapter_sends_video_url_without_thumb_and_duration(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient()

    result = await adapter.send_video("cvs_1", "https://cdn.example.test/clip.mp4", metadata={"request_id": "vid_1"})

    assert result.success is True
    assert adapter._client.media_url_sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "video",
            "url": "https://cdn.example.test/clip.mp4",
            "file_name": None,
            "idempotency_key": "vid_1",
        }
    ]


def _delivery_event(event_id: str, message_id: str, text: str, *, message_type: str = "text", debounce_ms: int | None = None):
    metadata = {"maxWaitMs": 5000}
    if debounce_ms is not None:
        metadata["debounceMs"] = debounce_ms
    return {
        "eventId": event_id,
        "eventType": "message.created",
        "payload": {
            "schemaVersion": 1,
            "eventType": "message.created",
            "messageId": message_id,
            "status": "normal",
            "isSelf": False,
            "isAtMe": False,
            "account": {"id": "acc_1", "wxid": "wxid_bot", "name": "Bot"},
            "conversation": {"id": "cvs_1", "type": "private", "wxid": "wxid_user", "name": "User"},
            "sender": {"wxid": "wxid_user", "name": "User", "isOwner": False},
            "mentions": [],
            "content": {"type": message_type, "text": text},
            "quote": None,
            "renderedText": text,
            "sentAt": "2026-07-06T00:00:00.000Z",
            "metadata": metadata,
        },
    }


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_plugin_package(name: str = "gewehub_plugin_under_test"):
    for key in list(sys.modules):
        if key == name or key.startswith(f"{name}."):
            sys.modules.pop(key)
    spec = importlib.util.spec_from_file_location(
        name,
        PLUGIN_DIR / "__init__.py",
        submodule_search_locations=[str(PLUGIN_DIR)],
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _install_gateway_stubs():
    gateway = types.ModuleType("gateway")
    gateway_config = types.ModuleType("gateway.config")
    gateway_platforms = types.ModuleType("gateway.platforms")
    gateway_base = types.ModuleType("gateway.platforms.base")

    class MessageType(Enum):
        TEXT = "text"
        PHOTO = "photo"
        VIDEO = "video"
        VOICE = "voice"
        DOCUMENT = "document"

    @dataclass
    class MessageEvent:
        text: str
        message_type: MessageType = MessageType.TEXT
        source: object | None = None
        raw_message: object | None = None
        message_id: str | None = None
        media_urls: list[str] = field(default_factory=list)
        media_types: list[str] = field(default_factory=list)
        reply_to_message_id: str | None = None
        reply_to_text: str | None = None
        reply_to_author_id: str | None = None
        reply_to_author_name: str | None = None
        reply_to_is_own_message: bool = False
        channel_prompt: str | None = None
        metadata: dict = field(default_factory=dict)

    @dataclass
    class SendResult:
        success: bool
        message_id: str | None = None
        error: str | None = None
        raw_response: object | None = None

    class BasePlatformAdapter:
        def __init__(self, config=None, platform=None):
            self.config = config
            self.platform = platform
            self.is_connected = False
            self.handled_messages = []

        def _mark_connected(self):
            self.is_connected = True

        def _mark_disconnected(self):
            self.is_connected = False

        def _set_fatal_error(self, *args, **kwargs):
            self.fatal_error = (args, kwargs)

        async def _notify_fatal_error(self):
            return None

        def build_source(self, **kwargs):
            return SimpleNamespace(**kwargs)

        async def handle_message(self, event):
            self.handled_messages.append(event)

    gateway_config.Platform = lambda name: name
    gateway_base.BasePlatformAdapter = BasePlatformAdapter
    gateway_base.MessageEvent = MessageEvent
    gateway_base.MessageType = MessageType
    gateway_base.SendResult = SendResult
    gateway_base.cache_image_from_url = lambda url, ext=".jpg": url
    gateway_base.resolve_channel_prompt = lambda extra, conversation_id: None
    sys.modules["gateway"] = gateway
    sys.modules["gateway.config"] = gateway_config
    sys.modules["gateway.platforms"] = gateway_platforms
    sys.modules["gateway.platforms.base"] = gateway_base


class _FakeClient:
    def __init__(self, ack_error=None):
        self.acked = []
        self.ack_error = ack_error
        self.sent = []
        self.sent_payloads = []
        self.html_sent = []
        self.media_sent = []
        self.media_url_sent = []

    async def ack_events(self, event_ids):
        self.acked.append(list(event_ids))
        if self.ack_error:
            raise self.ack_error
        return {"ok": True, "acked": len(event_ids)}

    async def send_message_payload(self, payload):
        clean = dict(payload)
        self.sent_payloads.append(clean)
        message_type = clean.get("type")
        if message_type == "text":
            item = {
                "conversation_id": clean.get("conversationId"),
                "text": clean.get("text"),
                "idempotency_key": clean.get("idempotencyKey"),
            }
            if "mentions" in clean:
                item["mentions"] = clean["mentions"]
            if "replyToMessageId" in clean:
                item["reply_to_message_id"] = clean["replyToMessageId"]
            self.sent.append(item)
            message_id = "msg_text"
        elif message_type == "html":
            self.html_sent.append(clean)
            message_id = "msg_html"
        elif clean.get("contentBase64"):
            item = {
                "conversation_id": clean.get("conversationId"),
                "media_type": message_type,
                "content_base64": clean.get("contentBase64"),
                "file_name": clean.get("fileName"),
                "mime_type": clean.get("mimeType"),
                "duration_ms": clean.get("durationMs"),
                "idempotency_key": clean.get("idempotencyKey"),
            }
            self.media_sent.append(item)
            message_id = "msg_media"
        else:
            url = clean.get("mediaUrl") or clean.get("fileUrl")
            self.media_url_sent.append({
                "conversation_id": clean.get("conversationId"),
                "media_type": message_type,
                "url": url,
                "file_name": clean.get("fileName"),
                "idempotency_key": clean.get("idempotencyKey"),
            })
            message_id = "msg_media_url"
        return {"success": True, "messageId": message_id, "url": clean.get("linkUrl")}

    async def revoke_message(self, message_id):
        return {"success": True, "messageId": message_id, "accepted": True}

    async def download_media(self, descriptor):
        return None


def _run_async(coro):
    import asyncio

    return asyncio.run(coro)
