from __future__ import annotations

import base64
import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DELIVERY_MODES = {"immediate", "discard", "confirm"}
EXECUTION_MODES = {"sync", "async"}
_STANDARD_RESPONSE_FIELDS = ("success", "messageId", "url", "accepted")


class OutboundNormalizationError(ValueError):
    """标准 outbound payload 无法构建。"""


@dataclass(frozen=True)
class OutboundDecision:
    payload: dict[str, Any]


def normalize_outbound(
    conversation_id: str,
    value: str | dict[str, Any],
    *,
    final: bool,
    metadata: dict[str, Any] | None = None,
) -> OutboundDecision:
    if isinstance(value, dict):
        return OutboundDecision(_normalize_explicit(conversation_id, value, metadata=metadata))

    original = str(value or "")
    if final:
        parsed = _json_object(original)
        if parsed is not None and "send" not in parsed:
            return OutboundDecision(_normalize_explicit(conversation_id, parsed, metadata=metadata))
    return OutboundDecision(_text_payload(conversation_id, original, metadata=metadata))


def normalize_final_output(
    conversation_id: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> OutboundDecision:
    return normalize_outbound(conversation_id, content, final=True, metadata=metadata)


def normalize_explicit_payload(
    conversation_id: str,
    value: str | dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> OutboundDecision:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise OutboundNormalizationError("explicit outbound payload must be a JSON object") from exc
        if not isinstance(parsed, dict):
            raise OutboundNormalizationError("explicit outbound payload must be a JSON object")
        value = parsed
    return OutboundDecision(_normalize_explicit(conversation_id, value, metadata=metadata))


async def dispatch_standard(client: Any, payload: dict[str, Any]) -> dict[str, Any]:
    response = await client.send_message_payload(payload)
    return standard_response(response)


def standard_response(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        return {}
    standard = {field: response[field] for field in _STANDARD_RESPONSE_FIELDS if field in response}
    standard.setdefault("success", True)
    return standard


def _json_object(content: str) -> dict[str, Any] | None:
    raw = content.strip()
    if not (raw.startswith("{") and raw.endswith("}")):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_explicit(
    conversation_id: str,
    value: dict[str, Any],
    *,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    args = dict(value)
    if "send" in args:
        raise OutboundNormalizationError("send is not supported; use deliveryMode")
    args.setdefault("deliveryMode", "immediate")
    args.setdefault("executionMode", "sync")
    if "content" in args and not args.get("text"):
        message_type = str(args.get("type") or args.get("sendType") or args.get("send_type") or "text").strip().lower()
        if message_type == "text":
            args["type"] = "text"
            args["text"] = str(args.get("content") or "")
    args.pop("content", None)
    for key, item in _metadata_fields(metadata).items():
        args.setdefault(key, item)
    payload = build_send_payload(args, default_conversation_id=conversation_id)
    error = payload.get("error")
    if error:
        raise OutboundNormalizationError(str(error))
    return payload


def _text_payload(
    conversation_id: str,
    text: str,
    *,
    metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    args: dict[str, Any] = {"type": "text", "text": text}
    args.update(_metadata_fields(metadata))
    args.setdefault("deliveryMode", "immediate")
    args.setdefault("executionMode", "sync")
    return _normalize_explicit(conversation_id, args, metadata=None)



def build_send_payload(args: dict[str, Any], *, default_conversation_id: str | None = None) -> dict[str, Any]:
    conversation_id = _clean_string(args.get("conversationId") or args.get("conversation_id") or default_conversation_id)
    if not conversation_id:
        return {"error": "conversationId is required"}
    message_type = _clean_string(args.get("type") or args.get("sendType") or args.get("send_type")).lower()
    if message_type not in {"text", "image", "file", "voice", "video", "link", "html"}:
        return {"error": "type must be one of text, image, file, voice, video, link, html"}
    if "send" in args:
        return {"error": "send is not supported; use deliveryMode"}
    delivery_mode = args.get("deliveryMode", "immediate")
    if not isinstance(delivery_mode, str) or delivery_mode not in DELIVERY_MODES:
        return {"error": "deliveryMode must be one of immediate, discard, confirm"}
    execution_mode = args.get("executionMode", "sync")
    if not isinstance(execution_mode, str) or execution_mode not in EXECUTION_MODES:
        return {"error": "executionMode must be one of sync, async"}
    payload: dict[str, Any] = {
        "conversationId": conversation_id,
        "type": message_type,
        "deliveryMode": delivery_mode,
        "executionMode": execution_mode,
    }
    for field in (
        "text", "mediaUrl", "fileUrl", "fileName", "contentBase64", "mimeType", "thumbUrl",
        "thumbContentBase64", "thumbMimeType", "thumbFileName", "title", "desc", "linkUrl",
        "htmlContent", "htmlContentBase64", "htmlFileName", "replyToMessageId", "requestId", "idempotencyKey",
    ):
        item = _clean_string(args.get(field))
        if item:
            payload[field] = item
    duration_ms = _coerce_int(args.get("durationMs") or args.get("duration_ms"))
    if duration_ms is not None:
        payload["durationMs"] = duration_ms
    mentions = args.get("mentions")
    if isinstance(mentions, list):
        clean_mentions = [_clean_string(item) for item in mentions if _clean_string(item)]
        if clean_mentions:
            payload["mentions"] = clean_mentions
    local_file = _clean_string(args.get("file"))
    if local_file:
        path = Path(local_file)
        if not path.is_file():
            return {"error": f"local file does not exist: {path}"}
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        if message_type == "html":
            payload.setdefault("htmlContentBase64", encoded)
            payload.setdefault("htmlFileName", _clean_string(args.get("htmlFileName")) or path.name)
        else:
            payload.setdefault("contentBase64", encoded)
            payload.setdefault("fileName", _clean_string(args.get("fileName")) or path.name)
            payload.setdefault("mimeType", _clean_string(args.get("mimeType")) or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    thumb_file = _clean_string(args.get("thumbFile") or args.get("thumb_file"))
    if thumb_file:
        path = Path(thumb_file)
        if not path.is_file():
            return {"error": f"local thumbnail file does not exist: {path}"}
        payload.setdefault("thumbContentBase64", base64.b64encode(path.read_bytes()).decode("ascii"))
        payload.setdefault("thumbFileName", _clean_string(args.get("thumbFileName")) or path.name)
        payload.setdefault("thumbMimeType", _clean_string(args.get("thumbMimeType")) or mimetypes.guess_type(path.name)[0] or "image/jpeg")
    if message_type == "text" and not _clean_string(payload.get("text")):
        return {"error": "text is required when type=text"}
    return payload


def _clean_string(value: Any) -> str:
    return str(value or "").strip()


def _coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def _metadata_fields(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    fields: dict[str, Any] = {}
    for source in (metadata, metadata.get("gewehub")):
        if not isinstance(source, dict):
            continue
        for target, aliases in {
            "idempotencyKey": ("idempotencyKey", "idempotency_key", "requestId", "request_id"),
            "replyToMessageId": ("replyToMessageId", "reply_to_message_id"),
            "mentions": ("mentions",),
            "deliveryMode": ("deliveryMode", "delivery_mode"),
            "executionMode": ("executionMode", "execution_mode"),
        }.items():
            if target in fields:
                continue
            for alias in aliases:
                item = source.get(alias)
                if item is not None and item != "":
                    fields[target] = item
                    break
    return fields
