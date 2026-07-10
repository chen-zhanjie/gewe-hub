from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from typing import Any

try:
    from .client import GeWeHubClient
    from .config import resolve_gewehub_connection
except ImportError:
    from client import GeWeHubClient
    from config import resolve_gewehub_connection


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
            "deliveryMode": {
                "type": "string",
                "enum": ["immediate", "discard", "confirm"],
                "description": "Delivery mode. immediate dispatches now; discard and confirm are held on the server. The management UI shows discard as 未发送 and confirm as 待确认; both can be sent manually.",
            },
            "executionMode": {
                "type": "string",
                "enum": ["sync", "async"],
                "description": "Execution mode. Defaults to sync; async asks the server to accept the operation asynchronously.",
            },
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



def _load_outbound_module():
    try:
        from . import outbound as module
        return module
    except ImportError:
        import importlib.util
        import sys

        module_name = f"{__name__}_outbound"
        module = sys.modules.get(module_name)
        if module is None:
            spec = importlib.util.spec_from_file_location(module_name, Path(__file__).with_name("outbound.py"))
            if spec is None or spec.loader is None:
                raise RuntimeError("unable to load outbound module")
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        return module


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

    outbound = _load_outbound_module()
    try:
        payload = outbound.normalize_explicit_payload("", args).payload
    except Exception as exc:
        return _tool_error(str(exc))

    client = GeWeHubClient(base_url, app_token=app_token)
    try:
        return _tool_result(**(await outbound.dispatch_standard(client, payload)))
    except Exception as exc:
        return _tool_error(f"GeWeHub send failed: {_redact(str(exc), app_token)}")
    finally:
        await client.aclose()


GEWEHUB_REVOKE_MESSAGE_SCHEMA: dict[str, Any] = {
    "description": "Revoke one GeWeHub message by its stable messageId.",
    "parameters": {
        "type": "object",
        "properties": {
            "messageId": {"type": "string", "description": "Stable GeWeHub message id."},
        },
        "required": ["messageId"],
        "additionalProperties": False,
    },
}


async def handle_gewehub_revoke_message(args: dict[str, Any], **_kwargs) -> str:
    message_id = _clean_string(args.get("messageId"))
    if not message_id:
        return _tool_error("messageId is required")
    connection = resolve_gewehub_connection()
    base_url = connection["base_url"]
    app_token = connection["app_token"]
    if not base_url or not app_token:
        return _tool_error(
            "GeWeHub is not configured for the active Hermes profile. Configure the plugin profile connection before using this revoke tool."
        )
    outbound = _load_outbound_module()
    client = GeWeHubClient(base_url, app_token=app_token)
    try:
        return _tool_result(**outbound.standard_response(await client.revoke_message(message_id)))
    except Exception as exc:
        return _tool_error(f"GeWeHub revoke failed: {_redact(str(exc), app_token)}")
    finally:
        await client.aclose()


def send_payload_from_args(args: dict[str, Any], *, default_conversation_id: str | None = None) -> dict[str, Any]:
    try:
        from .outbound import build_send_payload
    except ImportError:
        import importlib.util
        import sys

        module_name = f"{__name__}_outbound"
        module = sys.modules.get(module_name)
        if module is None:
            spec = importlib.util.spec_from_file_location(module_name, Path(__file__).with_name("outbound.py"))
            if spec is None or spec.loader is None:
                return {"error": "unable to load outbound module"}
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        build_send_payload = module.build_send_payload
    return build_send_payload(args, default_conversation_id=default_conversation_id)


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
