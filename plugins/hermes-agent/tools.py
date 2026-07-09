from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from typing import Any

try:
    from .client import GeWeHubClient
    from .config import resolve_gewehub_connection
    from .send_state import mark_tool_sent
except ImportError:
    from client import GeWeHubClient
    from config import resolve_gewehub_connection
    from send_state import mark_tool_sent


_SEND_TYPES = ["text", "image", "file", "voice", "video", "link", "html"]
_PAYLOAD_STRING_FIELDS = [
    "text",
    "mediaUrl",
    "fileUrl",
    "fileName",
    "contentBase64",
    "mimeType",
    "thumbUrl",
    "thumbContentBase64",
    "thumbMimeType",
    "thumbFileName",
    "title",
    "desc",
    "linkUrl",
    "htmlContent",
    "htmlContentBase64",
    "htmlFileName",
    "replyToMessageId",
    "requestId",
    "idempotencyKey",
]


GEWEHUB_SEND_MESSAGE_SCHEMA: dict[str, Any] = {
    "description": (
        "Send one GeWeHub message through the standard /api/send contract. "
        "Use this for text, image, file, voice, video, link, and html messages. "
        "Prefer this tool over normal plain text replies when the platform has a real capability such as quote/reply, mentions, media, link, or HTML. "
        "Do not simulate platform capabilities with plain text or Markdown when this tool can express them. "
        "Calling this tool is the message send; for a single final send, the final response JSON envelope can express the same /api/send payload. "
        "Do not repeat the same content in a normal final text reply."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "conversationId": {"type": "string", "description": "GeWeHub conversation id."},
            "type": {"type": "string", "enum": _SEND_TYPES, "description": "Standard /api/send message type."},
            "text": {"type": "string", "description": "Text body for type=text."},
            "mediaUrl": {"type": "string", "description": "Public media URL for image/video or fallback media sends."},
            "fileUrl": {"type": "string", "description": "Public file/media URL for file/voice/video sends."},
            "fileName": {"type": "string", "description": "File name for uploaded or URL media."},
            "contentBase64": {"type": "string", "description": "Base64 content for image/file/voice/video."},
            "mimeType": {"type": "string", "description": "MIME type for contentBase64 media."},
            "thumbUrl": {"type": "string", "description": "Public thumbnail URL for video/link/html cards."},
            "thumbContentBase64": {"type": "string", "description": "Base64 thumbnail content."},
            "thumbMimeType": {"type": "string", "description": "Thumbnail MIME type."},
            "thumbFileName": {"type": "string", "description": "Thumbnail file name."},
            "title": {"type": "string", "description": "Title for link/html cards."},
            "desc": {"type": "string", "description": "Short description for link/html cards."},
            "linkUrl": {"type": "string", "description": "URL for link cards or already-hosted HTML."},
            "htmlContent": {"type": "string", "description": "Raw HTML content for type=html."},
            "htmlContentBase64": {"type": "string", "description": "Base64 HTML content for type=html."},
            "htmlFileName": {"type": "string", "description": "HTML file name for type=html uploads."},
            "durationMs": {"type": "integer", "description": "Voice/video duration in milliseconds."},
            "mentions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Mentioned wxid list. This is a common send parameter, not a separate message type.",
            },
            "replyToMessageId": {
                "type": "string",
                "description": "Message id to quote/reply to with the platform's real quote capability. Only include this when you intentionally want a quoted reply; omit it for normal replies. Do not use quote=true. Do not simulate quotes with Markdown quote blocks.",
            },
            "requestId": {"type": "string", "description": "Optional stable request id."},
            "idempotencyKey": {"type": "string", "description": "Optional stable idempotency key."},
            "file": {
                "type": "string",
                "description": "Convenience local file path. The tool reads it into contentBase64 or htmlContentBase64.",
            },
            "thumbFile": {
                "type": "string",
                "description": "Convenience local thumbnail path. The tool reads it into thumbContentBase64.",
            },
        },
        "required": ["conversationId", "type"],
        "additionalProperties": False,
    },
}


def check_gewehub_tool_available() -> bool:
    connection = resolve_gewehub_connection()
    return bool(connection["base_url"] and connection["app_token"])


async def handle_gewehub_send_message(args: dict[str, Any], **_kwargs) -> str:
    connection = resolve_gewehub_connection()
    base_url = connection["base_url"]
    app_token = connection["app_token"]
    if not base_url or not app_token:
        return _tool_error(
            "GeWeHub is not configured for the active Hermes profile. Configure the plugin profile connection before using this send tool."
        )

    payload = send_payload_from_args(args)
    if "error" in payload:
        return _tool_error(payload["error"])

    client = GeWeHubClient(base_url, app_token=app_token)
    try:
        response = await client.send_message_payload(payload)
        mark_tool_sent(payload["conversationId"])
        return _tool_result(
            success=True,
            message_id=response.get("messageId") or response.get("message_id"),
            send_request_id=response.get("id"),
            status=response.get("status"),
            html_public_url=response.get("htmlPublicUrl"),
            html_page_id=response.get("htmlPageId"),
            html_hosted=response.get("htmlHosted"),
            raw_response=response,
        )
    except Exception as exc:
        return _tool_error(f"GeWeHub send failed: {_redact(str(exc), app_token)}")
    finally:
        await client.aclose()


def send_payload_from_args(args: dict[str, Any], *, default_conversation_id: str | None = None) -> dict[str, Any]:
    conversation_id = _clean_string(args.get("conversationId") or args.get("conversation_id") or default_conversation_id)
    if not conversation_id:
        return {"error": "conversationId is required"}

    message_type = _clean_string(args.get("type") or args.get("sendType") or args.get("send_type")).lower()
    if message_type not in _SEND_TYPES:
        return {"error": f"type must be one of {', '.join(_SEND_TYPES)}"}

    payload: dict[str, Any] = {"conversationId": conversation_id, "type": message_type}
    for field in _PAYLOAD_STRING_FIELDS:
        value = _clean_string(args.get(field))
        if value:
            payload[field] = value

    duration_ms = _coerce_int(args.get("durationMs") or args.get("duration_ms"))
    if duration_ms is not None:
        payload["durationMs"] = duration_ms

    mentions = _clean_list(args.get("mentions"))
    if mentions:
        payload["mentions"] = mentions

    file_error = _apply_local_file(payload, args)
    if file_error:
        return {"error": file_error}
    thumb_error = _apply_local_thumb_file(payload, args)
    if thumb_error:
        return {"error": thumb_error}

    if message_type == "text" and not _clean_string(payload.get("text")):
        return {"error": "text is required when type=text"}
    return payload


def _send_payload_from_args(args: dict[str, Any]) -> dict[str, Any]:
    return send_payload_from_args(args)


def _apply_local_file(payload: dict[str, Any], args: dict[str, Any]) -> str | None:
    local_file = _clean_string(args.get("file"))
    if not local_file:
        return None
    path = Path(local_file)
    if not path.is_file():
        return f"local file does not exist: {path}"
    message_type = str(payload.get("type") or "")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    if message_type == "html":
        payload.setdefault("htmlContentBase64", encoded)
        payload.setdefault("htmlFileName", _clean_string(args.get("htmlFileName")) or path.name)
        return None
    payload.setdefault("contentBase64", encoded)
    payload.setdefault("fileName", _clean_string(args.get("fileName")) or path.name)
    payload.setdefault("mimeType", _clean_string(args.get("mimeType")) or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    return None


def _apply_local_thumb_file(payload: dict[str, Any], args: dict[str, Any]) -> str | None:
    local_file = _clean_string(args.get("thumbFile") or args.get("thumb_file"))
    if not local_file:
        return None
    path = Path(local_file)
    if not path.is_file():
        return f"local thumbnail file does not exist: {path}"
    payload.setdefault("thumbContentBase64", base64.b64encode(path.read_bytes()).decode("ascii"))
    payload.setdefault("thumbFileName", _clean_string(args.get("thumbFileName")) or path.name)
    payload.setdefault("thumbMimeType", _clean_string(args.get("thumbMimeType")) or mimetypes.guess_type(path.name)[0] or "image/jpeg")
    return None


def _tool_result(**kwargs) -> str:
    return json.dumps({key: value for key, value in kwargs.items() if value is not None}, ensure_ascii=False)


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _redact(text: str, app_token: str) -> str:
    return text.replace(app_token, "[REDACTED]") if app_token else text


def _clean_string(value: Any) -> str:
    return str(value or "").strip()


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
