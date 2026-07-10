from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import importlib.util
import json
import logging
import mimetypes
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Optional

try:
    from gateway.config import Platform
    from gateway.platforms.base import BasePlatformAdapter, MessageEvent, MessageType, SendResult, resolve_channel_prompt
except ImportError:
    Platform = lambda name: name

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
        media_urls: list[str] | None = None
        media_types: list[str] | None = None
        reply_to_message_id: str | None = None
        reply_to_text: str | None = None
        reply_to_author_id: str | None = None
        reply_to_author_name: str | None = None
        reply_to_is_own_message: bool = False
        channel_prompt: str | None = None
        metadata: dict | None = None

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
            self.handled_messages: list[MessageEvent] = []

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

    def resolve_channel_prompt(extra, conversation_id):
        return None

try:
    from .client import GeWeHubAuthError, GeWeHubClient, GeWeHubError, GeWeHubPermissionError
    from .dedupe import BoundedTTLSet
    from .normalizer import (
        debounce_config,
        dedupe_key_for_event,
        event_text,
        is_plain_text_event,
        source_text,
        media_descriptors,
        metadata_for_event,
        normalize_event,
        reply_context,
    )
    from .state import GeWeHubStateStore
    from .outbound import OutboundNormalizationError, dispatch_standard, normalize_explicit_payload, normalize_final_output, normalize_outbound
except ImportError:
    from client import GeWeHubAuthError, GeWeHubClient, GeWeHubError, GeWeHubPermissionError
    from dedupe import BoundedTTLSet
    from normalizer import (
        debounce_config,
        dedupe_key_for_event,
        event_text,
        is_plain_text_event,
        source_text,
        media_descriptors,
        metadata_for_event,
        normalize_event,
        reply_context,
    )
    from state import GeWeHubStateStore
    from outbound import OutboundNormalizationError, dispatch_standard, normalize_explicit_payload, normalize_final_output, normalize_outbound


logger = logging.getLogger(__name__)

_GEWEHUB_PLATFORM_NAME = "gewehub"
_STRING_KEYS = {"base_url", "app_token", "home_conversation_id"}
_INT_KEYS = {"debounce_ms", "max_wait_ms"}


@dataclass
class _PendingBatch:
    events: list[MessageEvent]
    normalized: list[Any]
    sse_events: list[dict[str, Any]]
    event_ids: list[str]
    first_seen: float
    debounce_ms: int
    max_wait_ms: int
    task: asyncio.Task | None = None


def check_gewehub_requirements() -> bool:
    return True


def env_enablement() -> dict[str, Any] | None:
    extra = _extra_from_env()
    if extra.get("base_url") and extra.get("app_token"):
        return extra
    return None


def apply_yaml_config(yaml_cfg: dict, platform_cfg: dict) -> dict[str, Any]:
    source = _platform_config_source(yaml_cfg, platform_cfg)
    extra: dict[str, Any] = {}
    for key in _STRING_KEYS:
        value = _clean_string(source.get(key))
        if value:
            extra[key] = value
    for key in _INT_KEYS:
        parsed = _coerce_int(source.get(key))
        if parsed is not None:
            extra[key] = parsed
    group_command_allowed_users = source.get("group_command_allowed_users")
    if isinstance(group_command_allowed_users, dict):
        extra["group_command_allowed_users"] = group_command_allowed_users
    extra.update(_extra_from_env())
    return extra


def validate_config(config) -> bool:
    extra = getattr(config, "extra", {}) or {}
    return bool(_clean_string(extra.get("base_url")) and _clean_string(extra.get("app_token")))


def is_connected(config) -> bool:
    return validate_config(config)


class GeWeHubAdapter(BasePlatformAdapter):
    def __init__(self, config=None, **kwargs) -> None:
        if config is None:
            config = SimpleNamespace(extra={})
        super().__init__(config=config, platform=_platform_for_name(_GEWEHUB_PLATFORM_NAME))
        extra = getattr(config, "extra", {}) or {}

        self.base_url = _clean_string(os.getenv("GEWEHUB_BASE_URL") or extra.get("base_url")).rstrip("/")
        self.app_token = _clean_string(os.getenv("GEWEHUB_APP_TOKEN") or extra.get("app_token"))
        self.home_conversation_id = _clean_string(
            os.getenv("GEWEHUB_HOME_CONVERSATION_ID") or extra.get("home_conversation_id")
        )
        self.default_debounce_ms = _coerce_int(os.getenv("GEWEHUB_DEBOUNCE_MS") or extra.get("debounce_ms")) or 0
        self.default_max_wait_ms = _coerce_int(os.getenv("GEWEHUB_MAX_WAIT_MS") or extra.get("max_wait_ms")) or 0
        self.group_command_allowed_users = _group_command_allowed_users(extra.get("group_command_allowed_users"))
        self._client: GeWeHubClient | None = None
        if self.base_url and self.app_token:
            self._client = GeWeHubClient(self.base_url, app_token=self.app_token)
        self._state_store = GeWeHubStateStore(base_url=self.base_url, app_token=self.app_token)
        self._last_event_id: str | None = self._state_store.load_last_event_id()
        self._dedupe = BoundedTTLSet()
        self._dedupe.seed(self._state_store.load_seen_keys())
        self._conversation_locks: dict[str, asyncio.Lock] = {}
        self._pending_batches: dict[str, _PendingBatch] = {}
        self._pending_dedupe_keys: set[str] = set()
        self._ack_tasks: set[asyncio.Task] = set()
        self._ack_retry_delays = (1.0, 2.0, 5.0)
        self._sse_task: asyncio.Task | None = None

    @property
    def name(self) -> str:
        return "GeWeHub"

    async def get_chat_info(self, chat_id: str) -> Dict[str, Any]:
        chat_id = str(chat_id)
        return {"name": chat_id, "type": "dm", "chat_id": chat_id}

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        if self.is_connected and self._sse_task and not self._sse_task.done():
            return True
        if not (self.base_url and self.app_token):
            self._set_fatal_error(
                "config_missing",
                "GEWEHUB_BASE_URL and GEWEHUB_APP_TOKEN must be configured",
                retryable=False,
            )
            return False
        self._client = self._client or GeWeHubClient(self.base_url, app_token=self.app_token)
        if self._sse_task and not self._sse_task.done():
            self._sse_task.cancel()
            try:
                await self._sse_task
            except asyncio.CancelledError:
                pass
        self._sse_task = asyncio.create_task(self._sse_loop())
        self._mark_connected()
        return True

    async def disconnect(self) -> None:
        self._mark_disconnected()
        if self._sse_task and not self._sse_task.done():
            self._sse_task.cancel()
            try:
                await self._sse_task
            except asyncio.CancelledError:
                pass
        self._sse_task = None
        await self.flush_pending_batches()
        await self._drain_ack_tasks(timeout=2.0)
        if self._client:
            await self._client.aclose()
            self._client = None

    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SendResult:
        try:
            client = self._ensure_client()
            html_args = _html_send_payload_from_metadata(metadata, fallback_title=content)
            if html_args is not None:
                explicit = {"type": "html", **_camelize_html_payload(html_args)}
                decision = normalize_explicit_payload(chat_id, explicit, metadata=metadata)
            else:
                delivery_content = _cron_delivery_content(content) if _is_cron_delivery(metadata) else str(content or "")
                decision = normalize_outbound(
                    chat_id,
                    delivery_content,
                    final=_is_gateway_final_text(metadata) or _is_cron_delivery(metadata),
                    metadata=metadata,
                )
            response = await dispatch_standard(client, decision.payload)
            return SendResult(success=True, message_id=_response_message_id(response), raw_response=response)
        except Exception as exc:
            return SendResult(success=False, error=self._redact(str(exc)))

    async def send_message(self, conversation_id: str, text: str, **kwargs) -> SendResult:
        return await self.send(conversation_id, text, metadata=kwargs.get("metadata"))

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SendResult:
        return await self._send_media_url(
            chat_id,
            media_type="image",
            url=image_url,
            caption=caption,
            metadata=metadata,
        )

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_media_file(
            chat_id,
            image_path,
            requested_type="image",
            caption=caption,
            metadata=metadata,
        )

    async def send_document(
        self,
        chat_id: str,
        file_url: str | None = None,
        caption: Optional[str] = None,
        file_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        document_path = file_url or _metadata_string(None, kwargs, "file_path", "path")
        if not document_path:
            return SendResult(success=False, error="document file path or URL is required")
        if _looks_like_url(document_path):
            return await self._send_media_url(
                chat_id,
                media_type="file",
                url=document_path,
                file_name=file_name,
                caption=caption,
                metadata=metadata,
            )
        return await self._send_media_file(
            chat_id,
            document_path,
            requested_type="file",
            caption=caption,
            file_name=file_name,
            metadata=metadata,
        )

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_media_file(
            chat_id,
            audio_path,
            requested_type="voice",
            caption=caption,
            metadata=metadata,
            duration_ms=_duration_ms_from_metadata(metadata, kwargs),
        )

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        if _looks_like_url(video_path):
            return await self._send_media_url(
                chat_id,
                media_type="video",
                url=video_path,
                caption=caption,
                metadata=metadata,
            )
        return await self._send_media_file(
            chat_id,
            video_path,
            requested_type="video",
            caption=caption,
            metadata=metadata,
        )

    async def _sse_loop(self) -> None:
        backoff = 1.0
        while self.is_connected:
            client = GeWeHubClient(self.base_url, app_token=self.app_token)
            try:
                async for sse_event in client.iter_sse_events(last_event_id=self._last_event_id):
                    await self._handle_sse_event(sse_event)
                    backoff = 1.0
            except asyncio.CancelledError:
                raise
            except (GeWeHubAuthError, GeWeHubPermissionError) as exc:
                self._set_fatal_error("auth_failed", self._redact(str(exc)), retryable=False)
                await self._notify_fatal_error()
                return
            except Exception as exc:
                logger.warning("GeWeHub SSE loop error: %s", self._redact(str(exc) or exc.__class__.__name__))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                await client.aclose()

    async def _handle_sse_event(self, sse_event: dict[str, Any]) -> bool:
        event_type = str(sse_event.get("event") or "")
        logger.info("GeWeHub SSE event received: id=%s type=%s", _sse_event_id(sse_event), event_type or "message")
        if event_type == "error":
            raise GeWeHubError(f"GeWeHub SSE error: {_sse_error_message(sse_event)}")
        try:
            raw_event = json.loads(str(sse_event.get("data") or ""))
        except json.JSONDecodeError:
            logger.warning("GeWeHub skipped malformed SSE JSON")
            await self._ack_event_ids([_sse_event_id(sse_event)])
            return False
        if not isinstance(raw_event, dict):
            await self._ack_event_ids([_sse_event_id(sse_event)])
            return False
        if sse_event.get("id") and not raw_event.get("eventId"):
            raw_event["eventId"] = sse_event.get("id")
        if event_type and event_type != "message" and not raw_event.get("eventType"):
            raw_event["eventType"] = event_type

        normalized = normalize_event(raw_event)
        await self._ack_event_ids([_event_id_for_ack(sse_event, normalized)])
        conversation_id = _conversation_id(normalized)
        if not conversation_id:
            logger.warning("GeWeHub skipped message without conversation.id")
            return False

        async with self._conversation_lock(conversation_id):
            if self._seen_before(normalized):
                return False
            if _is_revoked_event(normalized):
                await self._flush_batch_locked(conversation_id)
                logger.info("GeWeHub message revoked: %s", normalized.message_id or normalized.event_id or "")
                self._mark_seen(normalized)
                return True

            event = await self._build_message_event(normalized, raw_event)
            if self._should_batch_event(normalized, event):
                self._enqueue_batch(conversation_id, event, normalized, sse_event)
                return True

            await self._flush_batch_locked(conversation_id)
            await self._dispatch_built_event(event, normalized, sse_event)
            return True

    async def flush_pending_batches(self) -> None:
        for conversation_id in list(self._pending_batches):
            async with self._conversation_lock(conversation_id):
                await self._flush_batch_locked(conversation_id)

    async def _build_message_event(self, normalized, raw_event: dict[str, Any]) -> MessageEvent:
        media_results = await self._download_media(normalized)
        media_urls, media_types = _media_event_fields(media_results)
        reply = reply_context(normalized)
        conversation_id = _conversation_id(normalized)
        metadata = metadata_for_event(normalized, media=media_results)
        slash_command = self._is_trusted_slash_command(normalized)
        if slash_command:
            metadata["gewehub"]["inputMode"] = "slash_command"
        return MessageEvent(
            text=source_text(normalized) if slash_command else event_text(normalized),
            message_type=_message_type_for(normalized, media_types),
            source=self.build_source(
                chat_id=conversation_id,
                chat_name=_conversation_name(normalized.conversation),
                chat_type=_chat_type(normalized.conversation),
                user_id=normalized.sender.get("wxid"),
                user_name=_sender_name(normalized.sender),
                message_id=normalized.message_id,
            ),
            raw_message=raw_event,
            message_id=normalized.message_id,
            media_urls=media_urls,
            media_types=media_types,
            reply_to_message_id=reply["message_id"],
            reply_to_text=reply["text"],
            reply_to_author_id=reply["author_id"],
            reply_to_author_name=reply["author_name"],
            reply_to_is_own_message=reply["is_own_message"],
            channel_prompt=self._resolve_channel_prompt(conversation_id),
            metadata=metadata,
        )

    async def _dispatch_built_event(self, event: MessageEvent, normalized, sse_event: dict[str, Any]) -> None:
        await self.handle_message(event)
        self._mark_seen(normalized)

    def _is_trusted_slash_command(self, normalized) -> bool:
        if not source_text(normalized).startswith("/"):
            return False
        if _chat_type(normalized.conversation) != "group":
            return True
        allowed_users = self.group_command_allowed_users.get(_conversation_id(normalized), set())
        sender_wxid = _clean_string(normalized.sender.get("wxid"))
        return bool(sender_wxid and sender_wxid in allowed_users)

    def _should_batch_event(self, normalized, event: MessageEvent) -> bool:
        debounce_ms, _ = debounce_config(
            normalized,
            default_debounce_ms=self.default_debounce_ms,
            default_max_wait_ms=self.default_max_wait_ms,
        )
        return (
            debounce_ms > 0
            and is_plain_text_event(normalized)
            and event.message_type == MessageType.TEXT
            and not getattr(event, "media_urls", [])
            and not getattr(event, "reply_to_message_id", None)
            and not _is_slash_command_input(event)
        )

    def _enqueue_batch(
        self,
        conversation_id: str,
        event: MessageEvent,
        normalized,
        sse_event: dict[str, Any],
    ) -> None:
        event_id = _event_id_for_ack(sse_event, normalized)
        debounce_ms, max_wait_ms = debounce_config(
            normalized,
            default_debounce_ms=self.default_debounce_ms,
            default_max_wait_ms=self.default_max_wait_ms,
        )
        now = asyncio.get_running_loop().time()
        batch = self._pending_batches.get(conversation_id)
        if batch is None:
            batch = _PendingBatch(
                events=[],
                normalized=[],
                sse_events=[],
                event_ids=[],
                first_seen=now,
                debounce_ms=debounce_ms,
                max_wait_ms=max_wait_ms,
            )
            self._pending_batches[conversation_id] = batch
        batch.events.append(event)
        batch.normalized.append(normalized)
        batch.sse_events.append(sse_event)
        if event_id:
            batch.event_ids.append(event_id)
        dedupe_key = dedupe_key_for_event(normalized)
        if dedupe_key:
            self._pending_dedupe_keys.add(dedupe_key)
        if batch.task and not batch.task.done():
            batch.task.cancel()
        batch.task = asyncio.create_task(self._flush_batch_after_delay(conversation_id, self._batch_delay(batch, now)))

    async def _flush_batch_after_delay(self, conversation_id: str, delay_seconds: float) -> None:
        try:
            await asyncio.sleep(max(0.0, delay_seconds))
            async with self._conversation_lock(conversation_id):
                await self._flush_batch_locked(conversation_id)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.warning("GeWeHub batch flush failed for %s: %s", conversation_id, self._redact(str(exc)))

    async def _flush_batch_locked(self, conversation_id: str) -> None:
        batch = self._pending_batches.get(conversation_id)
        if batch is None:
            return
        current_task = asyncio.current_task()
        if batch.task and not batch.task.done() and batch.task is not current_task:
            batch.task.cancel()
        batch.task = None
        self._pending_batches.pop(conversation_id, None)
        event = _merge_batch_events(batch.events, batch.event_ids)
        await self.handle_message(event)
        for normalized in batch.normalized:
            self._mark_seen(normalized)
            key = dedupe_key_for_event(normalized)
            if key:
                self._pending_dedupe_keys.discard(key)

    def _batch_delay(self, batch: _PendingBatch, now: float) -> float:
        debounce_seconds = max(0.0, batch.debounce_ms / 1000.0)
        if batch.max_wait_ms <= 0:
            return debounce_seconds
        remaining = batch.max_wait_ms / 1000.0 - (now - batch.first_seen)
        return min(debounce_seconds, max(0.0, remaining))

    def _seen_before(self, normalized) -> bool:
        key = dedupe_key_for_event(normalized)
        return self._dedupe.contains(key) or bool(key and key in self._pending_dedupe_keys)

    def _mark_seen(self, normalized) -> bool:
        key = dedupe_key_for_event(normalized)
        added = self._dedupe.add(key)
        if added:
            self._state_store.save_seen_keys(self._dedupe.keys())
        return added

    async def _ack_event_ids(self, event_ids: list[str | None]) -> None:
        clean = [str(event_id).strip() for event_id in event_ids if str(event_id or "").strip()]
        if not clean:
            return
        logger.info("GeWeHub SSE ACK scheduled: %s", clean[-1])
        self._last_event_id = clean[-1]
        self._state_store.save_last_event_id(clean[-1])
        client = self._client
        if client is None:
            return
        task = asyncio.create_task(self._send_ack_event_ids(client, clean))
        self._ack_tasks.add(task)
        task.add_done_callback(self._ack_tasks.discard)

    async def _send_ack_event_ids(self, client: GeWeHubClient, event_ids: list[str]) -> None:
        delays = (0.0, *self._ack_retry_delays)
        last_error: Exception | None = None
        for delay in delays:
            if delay > 0:
                await asyncio.sleep(delay)
            try:
                await client.ack_events(event_ids)
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                last_error = exc
        if last_error is not None:
            logger.warning("GeWeHub SSE ACK failed for %s: %s", event_ids[-1], self._redact(str(last_error)))

    async def _drain_ack_tasks(self, *, timeout: float) -> None:
        if not self._ack_tasks:
            return
        done, pending = await asyncio.wait(set(self._ack_tasks), timeout=timeout)
        for task in done:
            with contextlib.suppress(Exception):
                task.result()
        for task in pending:
            task.cancel()

    async def _download_media(self, normalized) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for descriptor in media_descriptors(normalized):
            try:
                result = await self._ensure_client().download_media(descriptor)
            except Exception as exc:
                result = {
                    "status": "failed",
                    "url": descriptor.get("url"),
                    "kind": descriptor.get("kind") or "file",
                    "error": self._redact(str(exc)),
                }
            if isinstance(result, dict):
                results.append(result)
            else:
                results.append({"status": "skipped", "url": descriptor.get("url"), "kind": descriptor.get("kind")})
        return results

    def _conversation_lock(self, conversation_id: str) -> asyncio.Lock:
        lock = self._conversation_locks.get(conversation_id)
        if lock is None:
            lock = asyncio.Lock()
            self._conversation_locks[conversation_id] = lock
        return lock

    def _resolve_channel_prompt(self, conversation_id: str) -> str | None:
        return resolve_channel_prompt(getattr(self.config, "extra", {}) or {}, str(conversation_id))

    def _ensure_client(self) -> GeWeHubClient:
        if self._client is None:
            self._client = GeWeHubClient(self.base_url, app_token=self.app_token)
        return self._client

    async def _send_media_url(
        self,
        chat_id: str,
        *,
        media_type: str,
        url: str,
        file_name: str | None = None,
        caption: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SendResult:
        try:
            explicit: dict[str, Any] = {"type": media_type, "fileName": file_name}
            explicit["mediaUrl" if media_type == "image" else "fileUrl"] = url
            response = await dispatch_standard(
                self._ensure_client(),
                normalize_explicit_payload(chat_id, explicit, metadata=metadata).payload,
            )
            raw_response: dict[str, Any] = {"media": response}
            if caption:
                caption_metadata = dict(metadata or {})
                caption_metadata["idempotencyKey"] = _derived_idempotency_key(
                    _idempotency_key_from_metadata(metadata), "caption"
                )
                raw_response["caption"] = await dispatch_standard(
                    self._ensure_client(),
                    normalize_explicit_payload(
                        chat_id, {"type": "text", "text": caption}, metadata=caption_metadata
                    ).payload,
                )
            return SendResult(success=True, message_id=_response_message_id(response), raw_response=raw_response)
        except Exception as exc:
            return SendResult(success=False, error=self._redact(str(exc)))

    async def _send_media_file(
        self,
        chat_id: str,
        path: str,
        *,
        requested_type: str,
        caption: str | None = None,
        file_name: str | None = None,
        metadata: dict[str, Any] | None = None,
        duration_ms: int | None = None,
        thumb_path: str | None = None,
        thumb_content_base64: str | None = None,
        thumb_mime_type: str | None = None,
        thumb_file_name: str | None = None,
    ) -> SendResult:
        try:
            file_path = Path(path)
            if not file_path.is_file():
                raise GeWeHubError(f"media file does not exist: {file_path}")
            resolved_name = file_name or file_path.name
            explicit: dict[str, Any] = {
                "type": requested_type,
                "file": str(file_path),
                "fileName": resolved_name,
                "mimeType": mimetypes.guess_type(resolved_name)[0] or "application/octet-stream",
            }
            if requested_type == "voice" and duration_ms is not None:
                explicit["durationMs"] = duration_ms
            # 视频缩略图与时长由服务端统一探测，避免客户端分叉。
            response = await dispatch_standard(
                self._ensure_client(),
                normalize_explicit_payload(chat_id, explicit, metadata=metadata).payload,
            )
            raw_response: dict[str, Any] = {"media": response}
            if caption:
                caption_metadata = dict(metadata or {})
                caption_metadata["idempotencyKey"] = _derived_idempotency_key(
                    _idempotency_key_from_metadata(metadata), "caption"
                )
                raw_response["caption"] = await dispatch_standard(
                    self._ensure_client(),
                    normalize_explicit_payload(
                        chat_id, {"type": "text", "text": caption}, metadata=caption_metadata
                    ).payload,
                )
            return SendResult(success=True, message_id=_response_message_id(response), raw_response=raw_response)
        except Exception as exc:
            return SendResult(success=False, error=self._redact(str(exc)))

    def _redact(self, text: str) -> str:
        return text.replace(self.app_token, "[REDACTED]") if self.app_token else text



def _is_slash_command_input(event: MessageEvent) -> bool:
    metadata = getattr(event, "metadata", None)
    gewehub = metadata.get("gewehub") if isinstance(metadata, dict) else None
    return isinstance(gewehub, dict) and gewehub.get("inputMode") == "slash_command"


def _group_command_allowed_users(value: Any) -> dict[str, set[str]]:
    if not isinstance(value, dict):
        return {}
    allowed_by_conversation: dict[str, set[str]] = {}
    for conversation_id, users in value.items():
        normalized_conversation_id = _clean_string(conversation_id)
        if not normalized_conversation_id:
            continue
        if isinstance(users, str):
            candidates = [users]
        elif isinstance(users, (list, tuple, set)):
            candidates = users
        else:
            continue
        normalized_users = {_clean_string(user) for user in candidates}
        normalized_users.discard("")
        if normalized_users:
            allowed_by_conversation[normalized_conversation_id] = normalized_users
    return allowed_by_conversation


def _extra_from_env() -> dict[str, Any]:
    extra: dict[str, Any] = {}
    for env_name, key in (
        ("GEWEHUB_BASE_URL", "base_url"),
        ("GEWEHUB_APP_TOKEN", "app_token"),
        ("GEWEHUB_HOME_CONVERSATION_ID", "home_conversation_id"),
    ):
        value = _clean_string(os.getenv(env_name))
        if value:
            extra[key] = value
    for env_name, key in (("GEWEHUB_DEBOUNCE_MS", "debounce_ms"), ("GEWEHUB_MAX_WAIT_MS", "max_wait_ms")):
        parsed = _coerce_int(os.getenv(env_name))
        if parsed is not None:
            extra[key] = parsed
    return extra


def _platform_for_name(name: str):
    try:
        return Platform(name)
    except Exception:
        return SimpleNamespace(value=name, name=name.upper().replace("-", "_"))


def _platform_config_source(yaml_cfg: dict, platform_cfg: dict) -> dict[str, Any]:
    if isinstance(platform_cfg, dict):
        nested_extra = platform_cfg.get("extra")
        if isinstance(nested_extra, dict):
            return nested_extra
        if any(key in platform_cfg for key in (_STRING_KEYS | _INT_KEYS)):
            return platform_cfg
    return yaml_cfg or {}


def _merge_batch_events(events: list[MessageEvent], event_ids: list[str]) -> MessageEvent:
    if len(events) == 1:
        event = events[0]
        metadata = dict(getattr(event, "metadata", {}) or {})
        gewehub = dict(metadata.get("gewehub") or {})
        gewehub["batch"] = {
            "count": 1,
            "message_ids": [event.message_id] if event.message_id else [],
            "event_ids": list(event_ids),
        }
        metadata["gewehub"] = gewehub
        event.metadata = metadata
        return event

    first = events[0]
    message_ids = [str(event.message_id) for event in events if event.message_id]
    metadata = dict(getattr(first, "metadata", {}) or {})
    gewehub = dict(metadata.get("gewehub") or {})
    gewehub["batch"] = {
        "count": len(events),
        "message_ids": message_ids,
        "event_ids": list(event_ids),
    }
    gewehub["batched"] = [getattr(event, "metadata", {}).get("gewehub", {}) for event in events]
    metadata["gewehub"] = gewehub
    return MessageEvent(
        text="\n\n".join(event.text for event in events if event.text),
        message_type=first.message_type,
        source=first.source,
        raw_message=[event.raw_message for event in events],
        message_id=message_ids[-1] if message_ids else first.message_id,
        media_urls=[url for event in events for url in (getattr(event, "media_urls", []) or [])],
        media_types=[media_type for event in events for media_type in (getattr(event, "media_types", []) or [])],
        reply_to_message_id=first.reply_to_message_id,
        reply_to_text=first.reply_to_text,
        reply_to_author_id=first.reply_to_author_id,
        reply_to_author_name=first.reply_to_author_name,
        reply_to_is_own_message=first.reply_to_is_own_message,
        channel_prompt=getattr(first, "channel_prompt", None),
        metadata=metadata,
    )

def _media_event_fields(results: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    urls: list[str] = []
    types: list[str] = []
    for result in results:
        local_path = result.get("local_path")
        if local_path:
            urls.append(str(local_path))
        mime_type = result.get("mime_type") or result.get("mimeType")
        if mime_type:
            types.append(str(mime_type))
        elif result.get("kind"):
            types.append(str(result["kind"]))
    return urls, types


def _message_type_for(normalized, media_types: list[str]) -> MessageType:
    content_type = str(normalized.content.get("type") or "").lower()
    probe = " ".join([content_type, *[item.lower() for item in media_types]])
    if "image" in probe:
        return MessageType.PHOTO
    if "video" in probe:
        return MessageType.VIDEO
    if "voice" in probe or "audio" in probe:
        return MessageType.VOICE
    if content_type in {"file", "document"} or "application/" in probe:
        return MessageType.DOCUMENT
    return MessageType.TEXT


def _idempotency_key_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    if not isinstance(metadata, dict):
        return None
    value = _first_metadata_value(metadata, ("idempotency_key", "idempotencyKey", "request_id", "requestId"))
    if value:
        return value
    gewehub = metadata.get("gewehub")
    if isinstance(gewehub, dict):
        return _first_metadata_value(gewehub, ("idempotency_key", "idempotencyKey", "request_id", "requestId"))
    return None


def _reply_to_message_id_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    return _metadata_string(metadata, None, "replyToMessageId", "reply_to_message_id")


def _mentions_from_metadata(metadata: dict[str, Any] | None) -> list[str] | None:
    if not isinstance(metadata, dict):
        return None
    for source in (metadata, metadata.get("gewehub")):
        if not isinstance(source, dict):
            continue
        value = source.get("mentions")
        if not isinstance(value, list):
            continue
        clean = [str(item).strip() for item in value if str(item or "").strip()]
        if clean:
            return clean
    return None



def _is_gateway_final_text(metadata: dict[str, Any] | None) -> bool:
    if not isinstance(metadata, dict):
        return False
    if bool(metadata.get("non_conversational")):
        return False
    gewehub = metadata.get("gewehub")
    if isinstance(gewehub, dict) and bool(gewehub.get("system")):
        return False
    return bool(metadata.get("notify") or metadata.get("expect_edits"))


def _is_cron_delivery(metadata: dict[str, Any] | None) -> bool:
    return isinstance(metadata, dict) and bool(_clean_string(metadata.get("job_id")))


def _cron_delivery_content(content: str) -> str:
    raw = str(content or "").strip()
    body = _cron_wrapped_body(raw)
    return body if body is not None else raw


def _cron_wrapped_body(content: str) -> str | None:
    if not content.startswith("Cronjob Response: "):
        return None
    divider = "\n-------------\n\n"
    footer_prefix = '\n\nTo stop or manage this job, send me a new message (e.g. "stop reminder '
    divider_pos = content.find(divider)
    footer_pos = content.rfind(footer_prefix)
    if divider_pos < 0 or footer_pos < 0 or footer_pos <= divider_pos:
        return None
    header = content[:divider_pos]
    if "\n(job_id: " not in header:
        return None
    body_start = divider_pos + len(divider)
    return content[body_start:footer_pos].strip()


def _html_send_payload_from_metadata(metadata: dict[str, Any] | None, *, fallback_title: str) -> dict[str, Any] | None:
    gewehub = _gewehub_metadata(metadata)
    if not gewehub:
        return None
    send_type = _first_metadata_value(gewehub, ("sendType", "send_type", "type"))
    if not send_type or send_type.lower() != "html":
        return None

    payload: dict[str, Any] = {
        "title": _first_metadata_value(gewehub, ("title",)) or _clean_string(fallback_title) or "HTML 页面",
        "desc": _first_metadata_value(gewehub, ("desc", "description")) or "",
        "idempotency_key": _idempotency_key_from_metadata(metadata),
    }
    optional_fields = {
        "link_url": ("linkUrl", "link_url", "url"),
        "html_content": ("htmlContent", "html_content"),
        "html_content_base64": ("htmlContentBase64", "html_content_base64"),
        "html_file_path": ("htmlFilePath", "html_file_path", "filePath", "path"),
        "html_file_name": ("htmlFileName", "html_file_name", "fileName", "file_name"),
        "thumb_url": ("thumbUrl", "thumb_url"),
    }
    for payload_key, metadata_keys in optional_fields.items():
        value = _first_metadata_value(gewehub, metadata_keys)
        if value:
            payload[payload_key] = value
    return payload


def _camelize_html_payload(payload: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "link_url": "linkUrl",
        "html_content": "htmlContent",
        "html_content_base64": "htmlContentBase64",
        "html_file_path": "file",
        "html_file_name": "htmlFileName",
        "thumb_url": "thumbUrl",
        "idempotency_key": "idempotencyKey",
    }
    return {aliases.get(key, key): value for key, value in payload.items() if value not in (None, "")}


def _gewehub_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(metadata, dict):
        return None
    gewehub = metadata.get("gewehub")
    return gewehub if isinstance(gewehub, dict) else None


def _derived_idempotency_key(idempotency_key: str | None, suffix: str) -> str | None:
    if not idempotency_key:
        return None
    return f"{idempotency_key}:{suffix}"


def _duration_ms_from_metadata(metadata: dict[str, Any] | None, kwargs: dict[str, Any] | None = None) -> int | None:
    raw = _metadata_string(metadata, kwargs, "duration_ms", "durationMs", "audio_duration_ms", "video_duration_ms")
    if raw is None:
        return None
    parsed = _coerce_int(raw)
    return parsed if parsed and parsed > 0 else None


def _metadata_string(metadata: dict[str, Any] | None, kwargs: dict[str, Any] | None, *keys: str) -> str | None:
    if isinstance(kwargs, dict):
        value = _first_metadata_value(kwargs, keys)
        if value:
            return value
    if isinstance(metadata, dict):
        value = _first_metadata_value(metadata, keys)
        if value:
            return value
        gewehub = metadata.get("gewehub")
        if isinstance(gewehub, dict):
            value = _first_metadata_value(gewehub, keys)
            if value:
                return value
    return None


def _first_metadata_value(source: dict[str, Any], keys) -> str | None:
    for key in keys:
        value = source.get(key)
        text = _clean_string(value)
        if text:
            return text
    return None


def _looks_like_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _conversation_id(normalized) -> str:
    return _clean_string(normalized.conversation.get("id") or normalized.conversation.get("wxid"))


def _conversation_name(conversation: dict[str, Any]) -> str:
    return _clean_string(conversation.get("remark") or conversation.get("name") or conversation.get("wxid") or conversation.get("id"))


def _sender_name(sender: dict[str, Any]) -> str:
    return _clean_string(sender.get("memberRemark") or sender.get("remark") or sender.get("name") or sender.get("wxid"))


def _chat_type(conversation: dict[str, Any]) -> str:
    return "group" if str(conversation.get("type") or "").lower() == "group" else "dm"


def _is_revoked_event(normalized) -> bool:
    return normalized.event_type == "message.revoked" or normalized.status == "revoked"


def _event_id_for_ack(sse_event: dict[str, Any], normalized) -> str:
    return _sse_event_id(sse_event) or _clean_string(getattr(normalized, "event_id", None))


def _sse_event_id(sse_event: dict[str, Any]) -> str:
    return _clean_string(sse_event.get("id"))


def _sse_error_message(sse_event: dict[str, Any]) -> str:
    raw = str(sse_event.get("data") or "").strip()
    if not raw:
        return "unknown"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    if isinstance(parsed, dict):
        return str(parsed.get("error") or parsed.get("message") or parsed)
    return str(parsed)


def _response_message_id(response: dict[str, Any]) -> str | None:
    if not isinstance(response, dict):
        return None
    value = response.get("messageId")
    return str(value) if value is not None else None


async def _standalone_send(
    pconfig=None,
    chat_id: str | None = None,
    message: str | None = None,
    *,
    base_url: str | None = None,
    app_token: str | None = None,
    conversation_id: str | None = None,
    thread_id: str | None = None,
    media_files=None,
    force_document: bool = False,
    **kwargs,
) -> dict[str, Any]:
    extra = getattr(pconfig, "extra", {}) or {}
    base_url = _clean_string(os.getenv("GEWEHUB_BASE_URL") or base_url or extra.get("base_url")).rstrip("/")
    app_token = _clean_string(os.getenv("GEWEHUB_APP_TOKEN") or app_token or extra.get("app_token"))
    conversation_id = _clean_string(conversation_id or chat_id)
    if not (base_url and app_token and conversation_id):
        return {"error": "GeWeHub standalone send requires base_url, app_token, and conversation_id"}
    client = GeWeHubClient(base_url, app_token=app_token)
    last_response: dict[str, Any] | None = None
    try:
        text = _cron_delivery_content(str(message or ""))
        if text:
            decision = normalize_final_output(
                conversation_id,
                text,
                metadata={"idempotencyKey": _generated_idempotency_key(thread_id, conversation_id, text, "text")},
            )
            last_response = await dispatch_standard(client, decision.payload)
        for index, item in enumerate(media_files or []):
            media_path, is_voice = _standalone_media_entry(item)
            media_type = "voice" if is_voice else ("file" if force_document else _requested_media_type_for_path(media_path))
            file_name = Path(media_path).name
            media_payload = normalize_explicit_payload(
                conversation_id,
                {
                    "type": media_type,
                    "file": media_path,
                    "fileName": file_name,
                    "mimeType": mimetypes.guess_type(file_name)[0],
                    "idempotencyKey": _generated_idempotency_key(thread_id, conversation_id, media_path, index, "media"),
                },
            ).payload
            last_response = await dispatch_standard(client, media_payload)
        if last_response is None:
            return {"error": "GeWeHub standalone send requires message or media_files"}
        return {"success": True, "message_id": _response_message_id(last_response), "raw_response": last_response}
    except Exception as exc:
        redacted = str(exc).replace(app_token, "[REDACTED]") if app_token else str(exc)
        return {"error": f"GeWeHub standalone send failed: {redacted}"}
    finally:
        await client.aclose()


def _clean_string(value: Any) -> str:
    return str(value or "").strip()


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _standalone_media_entry(item: Any) -> tuple[str, bool]:
    if isinstance(item, (list, tuple)):
        media_path = item[0] if item else ""
        is_voice = bool(item[1]) if len(item) > 1 else False
        return str(media_path), is_voice
    return str(item), False


def _requested_media_type_for_path(path: str) -> str:
    mime_type = mimetypes.guess_type(path)[0] or ""
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("audio/"):
        return "voice"
    if mime_type.startswith("video/"):
        return "video"
    return "file"


def _generated_idempotency_key(*parts: Any) -> str:
    raw = "|".join(str(part or "") for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    label = _clean_string(parts[0]) or "standalone"
    return f"hermes-gewehub-{label}-{_clean_string(parts[1])}-{_clean_string(parts[-1])}-{digest}"


def register(ctx) -> None:
    try:
        from .tools import GEWEHUB_REVOKE_MESSAGE_SCHEMA, GEWEHUB_SEND_MESSAGE_SCHEMA, check_gewehub_tool_available, handle_gewehub_revoke_message, handle_gewehub_send_message
    except ImportError:
        tools_path = Path(__file__).with_name("tools.py")
        spec = importlib.util.spec_from_file_location("gewehub_plugin_tools", tools_path)
        if spec is None or spec.loader is None:
            raise
        tools_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(tools_module)
        GEWEHUB_SEND_MESSAGE_SCHEMA = tools_module.GEWEHUB_SEND_MESSAGE_SCHEMA
        GEWEHUB_REVOKE_MESSAGE_SCHEMA = tools_module.GEWEHUB_REVOKE_MESSAGE_SCHEMA
        check_gewehub_tool_available = tools_module.check_gewehub_tool_available
        handle_gewehub_send_message = tools_module.handle_gewehub_send_message
        handle_gewehub_revoke_message = tools_module.handle_gewehub_revoke_message

    ctx.register_platform(
        name=_GEWEHUB_PLATFORM_NAME,
        label="GeWeHub",
        adapter_factory=lambda cfg: GeWeHubAdapter(cfg),
        check_fn=check_gewehub_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=["GEWEHUB_BASE_URL", "GEWEHUB_APP_TOKEN"],
        install_hint="Configure a GeWeHub application token.",
        env_enablement_fn=env_enablement,
        apply_yaml_config_fn=apply_yaml_config,
        cron_deliver_env_var="GEWEHUB_HOME_CONVERSATION_ID",
        standalone_sender_fn=_standalone_send,
        allowed_users_env="GEWEHUB_ALLOWED_USERS",
        allow_all_env="GEWEHUB_ALLOW_ALL_USERS",
        emoji="GH",
        pii_safe=True,
        platform_hint=(
            "You are replying through GeWeHub. "
            "Plain final text sends an immediate synchronous reply; use a final JSON object only when structured message parameters are needed. "
            "Use gewehub_send_message for media, HTML, links, mentions, native replies, or messages sent before the final response. "
            "For every ID in mentions, include the matching @nickname in the message text. "
            "Normal delivery uses deliveryMode=immediate and executionMode=sync; use deliveryMode=discard to record without delivery, deliveryMode=confirm for human confirmation, and executionMode=async only when explicitly needed. "
            "Use the stable messageId from conversation context or send results for replyToMessageId and gewehub_revoke_message. "
            "If a final turn is required after a tool sends the complete answer, return {\"deliveryMode\":\"discard\",\"type\":\"text\",\"text\":\"Reply completed by tool\"} so it is recorded without another user-visible send."
        ),
    )
    if hasattr(ctx, "register_tool"):
        ctx.register_tool(
            name="gewehub_send_message",
            toolset="gewehub",
            schema=GEWEHUB_SEND_MESSAGE_SCHEMA,
            handler=handle_gewehub_send_message,
            check_fn=check_gewehub_tool_available,
            is_async=True,
            description="Send a standard GeWeHub message through /api/send.",
            emoji="GH",
        )
        ctx.register_tool(
            name="gewehub_revoke_message",
            toolset="gewehub",
            schema=GEWEHUB_REVOKE_MESSAGE_SCHEMA,
            handler=handle_gewehub_revoke_message,
            check_fn=check_gewehub_tool_available,
            is_async=True,
            description="Revoke a GeWeHub message by stable messageId.",
            emoji="GH",
        )
