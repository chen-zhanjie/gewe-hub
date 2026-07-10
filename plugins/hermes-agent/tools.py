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

GEWEHUB_SEND_MESSAGE_SCHEMA: dict[str, Any] = {
    "description": (
        "Send one GeWeHub message. A successful result includes a stable messageId "
        "that can be used to reply to or revoke the sent message."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "conversationId": {
                "type": "string",
                "description": "Target conversation ID from the current message context.",
            },
            "deliveryMode": {
                "type": "string",
                "enum": ["immediate", "discard", "confirm"],
                "description": (
                    "Delivery choice: immediate sends now, discard means record without delivery, "
                    "and confirm records for human confirmation. Defaults to immediate."
                ),
            },
            "executionMode": {
                "type": "string",
                "enum": ["sync", "async"],
                "description": (
                    "Execution choice: sync waits for the send result; async returns after reliable acceptance. "
                    "Defaults to synchronous execution."
                ),
            },
            "type": {
                "type": "string",
                "enum": _SEND_TYPES,
                "description": "Message type to send.",
            },
            "text": {
                "type": "string",
                "description": "Message body. Required for type=text and must include visible @nicknames for mentions.",
            },
            "mediaUrl": {
                "type": "string",
                "description": "Publicly downloadable source URL for an image, file, voice, or video.",
            },
            "fileName": {
                "type": "string",
                "description": "Display file name for media or file content.",
            },
            "contentBase64": {
                "type": "string",
                "description": "Base64 source content for an image, file, voice, or video.",
            },
            "mimeType": {
                "type": "string",
                "description": "MIME type of contentBase64.",
            },
            "thumbUrl": {
                "type": "string",
                "description": (
                    "Public thumbnail URL. Required for remote video messages; optional for link and HTML cards."
                ),
            },
            "thumbContentBase64": {
                "type": "string",
                "description": "Base64 thumbnail content for a video, link card, or HTML card.",
            },
            "thumbMimeType": {
                "type": "string",
                "description": "MIME type of thumbContentBase64.",
            },
            "thumbFileName": {
                "type": "string",
                "description": "File name of the thumbnail content.",
            },
            "title": {
                "type": "string",
                "description": "Card title for type=link or type=html.",
            },
            "desc": {
                "type": "string",
                "description": "Short card description for type=link or type=html.",
            },
            "linkUrl": {
                "type": "string",
                "description": "Required destination for type=link, or the single hosted-page source for type=html.",
            },
            "htmlContent": {
                "type": "string",
                "description": "Raw HTML source for type=html. Use exactly one HTML source.",
            },
            "htmlContentBase64": {
                "type": "string",
                "description": "Base64 HTML source for type=html. Use exactly one HTML source.",
            },
            "htmlFileName": {
                "type": "string",
                "description": "File name for the HTML document.",
            },
            "durationMs": {
                "type": "integer",
                "description": "Voice or video duration in milliseconds.",
            },
            "mentions": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "User IDs to mention in a text message. Every ID must have its matching @nickname "
                    "visible in the text body, in the same order."
                ),
            },
            "replyToMessageId": {
                "type": "string",
                "description": (
                    "Stable messageId of the message to reply to. Use an ID from conversation context "
                    "for a received message or from a successful send result for your own sent message; "
                    "supported for text messages."
                ),
            },
            "idempotencyKey": {
                "type": "string",
                "description": (
                    "Key for retry-safe delivery; reuse the same value only when retrying the same send operation."
                ),
            },
            "file": {
                "type": "string",
                "description": "Absolute local source path for image, file, voice, video, or HTML content.",
            },
            "thumbFile": {
                "type": "string",
                "description": "Absolute local thumbnail image path for video, link, or HTML messages.",
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
    "description": "Revoke a message sent by the current GeWeHub account using its stable messageId.",
    "parameters": {
        "type": "object",
        "properties": {
            "messageId": {
                "type": "string",
                "description": "The stable messageId from the successful send result of the message to revoke.",
            },
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
