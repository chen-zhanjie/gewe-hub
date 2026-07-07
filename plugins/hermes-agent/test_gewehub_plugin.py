from __future__ import annotations

import importlib.util
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
        "client.py",
        "normalizer.py",
        "dedupe.py",
        "state.py",
        "README.md",
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
    assert (await client.send_text("cvs_1", "hi"))["messageId"] == "msg_send"
    await client.aclose()


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


def _load_plugin_package():
    name = "gewehub_plugin_under_test"
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
    def __init__(self):
        self.acked = []

    async def ack_events(self, event_ids):
        self.acked.append(list(event_ids))
        return {"ok": True, "acked": len(event_ids)}

    async def download_media(self, descriptor):
        return None
