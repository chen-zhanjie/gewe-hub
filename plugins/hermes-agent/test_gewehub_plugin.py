from __future__ import annotations

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
        "client.py",
        "normalizer.py",
        "dedupe.py",
        "state.py",
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

    def register_platform(**kwargs):
        captured.update(kwargs)

    ctx.register_platform = register_platform

    package.register(ctx)

    assert captured["name"] == "gewehub"
    assert captured["adapter_factory"]
    assert captured["cron_deliver_env_var"] == "GEWEHUB_HOME_CONVERSATION_ID"
    assert captured["standalone_sender_fn"]
    assert captured["required_env"] == ["GEWEHUB_BASE_URL", "GEWEHUB_APP_TOKEN"]
    assert captured["allowed_users_env"] == "GEWEHUB_ALLOWED_USERS"
    assert captured["allow_all_env"] == "GEWEHUB_ALLOW_ALL_USERS"


@pytest.mark.asyncio
async def test_standalone_sender_uses_config_and_idempotency_key(monkeypatch):
    _install_gateway_stubs()
    package = _load_plugin_package("gewehub_plugin_standalone_test")
    sent = []

    class FakeStandaloneClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_text(self, conversation_id, text, idempotency_key=None):
            sent.append(
                {
                    "base_url": self.base_url,
                    "app_token": self.app_token,
                    "conversation_id": conversation_id,
                    "text": text,
                    "idempotency_key": idempotency_key,
                }
            )
            return {"id": "send_1", "messageId": "msg_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})

    result = await package.adapter._standalone_send(cfg, "cvs_1", "hello", thread_id="thread_1")

    assert result == {"success": True, "message_id": "msg_1", "raw_response": {"id": "send_1", "messageId": "msg_1"}}
    assert sent == [
        {
            "base_url": "https://hub.example.test",
            "app_token": "app_token",
            "conversation_id": "cvs_1",
            "text": "hello",
            "idempotency_key": "hermes-gewehub-thread_1-cvs_1-text-8ef6b9c93d0bfed7",
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

        async def send_media_file(
            self,
            conversation_id,
            *,
            media_type,
            path=None,
            content_base64=None,
            file_name=None,
            mime_type=None,
            duration_ms=None,
            idempotency_key=None,
            **_kwargs,
        ):
            sent.append(
                {
                    "conversation_id": conversation_id,
                    "media_type": media_type,
                    "path": path,
                    "content_base64": content_base64,
                    "file_name": file_name,
                    "mime_type": mime_type,
                    "duration_ms": duration_ms,
                    "idempotency_key": idempotency_key,
                }
            )
            return {"id": "send_media_1", "messageId": "msg_media_1"}

        async def aclose(self):
            return None

    monkeypatch.setattr(package.adapter, "GeWeHubClient", FakeStandaloneClient)
    image_path = tmp_path / "result.png"
    image_path.write_bytes(b"\x89PNG\r\n")
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})

    result = await package.adapter._standalone_send(cfg, "cvs_1", "", thread_id="thread_1", media_files=[(str(image_path), False)])

    assert result == {"success": True, "message_id": "msg_media_1", "raw_response": {"id": "send_media_1", "messageId": "msg_media_1"}}
    expected_idempotency_key = package.adapter._generated_idempotency_key("thread_1", "cvs_1", str(image_path), 0, "media")
    assert sent == [
        {
            "conversation_id": "cvs_1",
            "media_type": "image",
            "path": str(image_path),
            "content_base64": None,
            "file_name": "result.png",
            "mime_type": "image/png",
            "duration_ms": None,
            "idempotency_key": expected_idempotency_key,
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
                "htmlPublicUrl": f"https://gewehub.yunzxu.com/h/{len(requests)}",
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

    assert content_result["htmlPublicUrl"] == "https://gewehub.yunzxu.com/h/1"
    assert file_result["htmlPublicUrl"] == "https://gewehub.yunzxu.com/h/2"
    assert url_result["htmlPublicUrl"] == "https://gewehub.yunzxu.com/h/3"
    assert requests == [
        {
            "conversationId": "cvs_1",
            "type": "html",
            "title": "日报",
            "desc": "今日 AI 日报",
            "htmlContent": "<html>content</html>",
            "idempotencyKey": "html_content_1",
        },
        {
            "conversationId": "cvs_1",
            "type": "html",
            "title": "文件报告",
            "desc": "本地 HTML 文件",
            "htmlContentBase64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+ZmlsZTwvaHRtbD4=",
            "htmlFileName": "report.html",
        },
        {
            "conversationId": "cvs_1",
            "type": "html",
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

        async def send_html(self, conversation_id, **kwargs):
            sent.append({"conversation_id": conversation_id, **kwargs})
            return {
                "id": "send_html_file",
                "status": "pending",
                "messageId": "msg_html",
                "htmlPublicUrl": "https://gewehub.yunzxu.com/h/html_cli",
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
                "--file",
                str(html_file),
            ]
        )
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert sent == [
        {
            "conversation_id": "cvs_1",
            "title": "CLI 报告",
            "desc": "本地文件",
            "html_content_base64": "PCFkb2N0eXBlIGh0bWw+PGh0bWw+Y2xpPC9odG1sPg==",
            "html_file_name": "report.html",
            "idempotency_key": None,
        }
    ]
    assert output == {
        "success": True,
        "message_id": "msg_html",
        "send_request_id": "send_html_file",
        "status": "pending",
        "html_public_url": "https://gewehub.yunzxu.com/h/html_cli",
        "html_page_id": "html_cli",
        "html_hosted": True,
        "raw_response": {
            "id": "send_html_file",
            "status": "pending",
            "messageId": "msg_html",
            "htmlPublicUrl": "https://gewehub.yunzxu.com/h/html_cli",
            "htmlPageId": "html_cli",
            "htmlHosted": True,
        },
    }


def test_cli_send_html_stdin_outputs_public_url(monkeypatch, capsys):
    cli_mod = _load_module("gewehub_cli_stdin_test", PLUGIN_DIR / "cli.py")
    sent = []

    class FakeClient:
        def __init__(self, base_url, *, app_token):
            self.base_url = base_url
            self.app_token = app_token

        async def send_html(self, conversation_id, **kwargs):
            sent.append({"conversation_id": conversation_id, **kwargs})
            return {
                "id": "send_html_stdin",
                "status": "pending",
                "htmlPublicUrl": "https://gewehub.yunzxu.com/h/html_stdin",
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
            "conversation_id": "cvs_1",
            "title": "STDIN 报告",
            "desc": "",
            "html_content": "<html>stdin</html>",
            "idempotency_key": None,
        }
    ]
    assert output["html_public_url"] == "https://gewehub.yunzxu.com/h/html_stdin"
    assert output["send_request_id"] == "send_html_stdin"


@pytest.mark.asyncio
async def test_adapter_batches_plain_text_and_acks_after_flush(tmp_path, monkeypatch):
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
    assert adapter.handled_messages == []

    await adapter.flush_pending_batches()

    assert [event.text for event in adapter.handled_messages] == ["a\n\nb"]
    assert adapter.handled_messages[0].metadata["gewehub"]["batch"] == {
        "count": 2,
        "message_ids": ["msg_1", "msg_2"],
        "event_ids": ["evt_1", "evt_2"],
    }
    assert adapter._client.acked == [["evt_1", "evt_2"]]
    assert adapter._state_store.load_last_event_id() == "evt_2"


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

    assert [event.message_id for event in adapter.handled_messages] == ["msg_1", "msg_img"]
    assert adapter._client.acked == [["evt_1"], ["evt_img"]]


@pytest.mark.asyncio
async def test_adapter_ack_failure_does_not_interrupt_dispatch_or_advance_cursor(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    _install_gateway_stubs()
    package = _load_plugin_package()
    cfg = SimpleNamespace(extra={"base_url": "https://hub.example.test", "app_token": "app_token"})
    adapter = package.adapter.GeWeHubAdapter(cfg)
    adapter._client = _FakeClient(ack_error=RuntimeError("network timeout"))

    with caplog.at_level("WARNING"):
        result = await adapter._handle_sse_event(
            {"id": "evt_1", "event": "message.created", "data": json.dumps(_delivery_event("evt_1", "msg_1", "hello"))}
        )

    assert result is True
    assert [event.text for event in adapter.handled_messages] == ["hello"]
    assert adapter._client.acked == [["evt_1"]]
    assert adapter._state_store.load_last_event_id() is None
    assert "ACK failed" in caplog.text


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
    assert adapter._client.sent == [
        {"conversation_id": "cvs_1", "text": "hello", "idempotency_key": "req_1"},
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
        self.media_sent = []
        self.media_url_sent = []

    async def ack_events(self, event_ids):
        self.acked.append(list(event_ids))
        if self.ack_error:
            raise self.ack_error
        return {"ok": True, "acked": len(event_ids)}

    async def send_text(self, conversation_id, text, idempotency_key=None):
        self.sent.append({"conversation_id": conversation_id, "text": text, "idempotency_key": idempotency_key})
        return {"id": "send_text", "status": "pending", "messageId": "msg_text"}

    async def send_media_url(self, conversation_id, *, media_type, url, file_name=None, idempotency_key=None):
        self.media_url_sent.append(
            {
                "conversation_id": conversation_id,
                "media_type": media_type,
                "url": url,
                "file_name": file_name,
                "idempotency_key": idempotency_key,
            }
        )
        return {"id": "send_media_url", "status": "pending", "messageId": "msg_media_url"}

    async def send_media_file(
        self,
        conversation_id,
        *,
        media_type,
        content_base64,
        file_name=None,
        mime_type=None,
        duration_ms=None,
        thumb_path=None,
        thumb_content_base64=None,
        thumb_mime_type=None,
        thumb_file_name=None,
        idempotency_key=None,
    ):
        payload = {
            "conversation_id": conversation_id,
            "media_type": media_type,
            "content_base64": content_base64,
            "file_name": file_name,
            "mime_type": mime_type,
            "duration_ms": duration_ms,
            "idempotency_key": idempotency_key,
        }
        if thumb_content_base64 is not None:
            payload["thumb_content_base64"] = thumb_content_base64
            payload["thumb_mime_type"] = thumb_mime_type
            payload["thumb_file_name"] = thumb_file_name
        self.media_sent.append(payload)
        return {"id": "send_media", "status": "pending", "messageId": "msg_media"}

    async def download_media(self, descriptor):
        return None


def _run_async(coro):
    import asyncio

    return asyncio.run(coro)
