from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class NormalizedEvent:
    raw_event: dict[str, Any]
    payload: dict[str, Any]
    event_id: str | None
    event_type: str
    message_id: str | None
    status: str
    conversation: dict[str, Any]
    sender: dict[str, Any]
    account: dict[str, Any]
    content: dict[str, Any]
    quote: dict[str, Any] | None
    mentions: list[dict[str, Any]]
    rendered_text: str
    sent_at: str | None
    metadata: dict[str, Any]
    is_self: bool
    is_at_me: bool


def normalize_event(event: dict[str, Any]) -> NormalizedEvent:
    payload = delivery_payload(event)
    content = _dict(payload.get("content"))
    conversation = _dict(payload.get("conversation"))
    sender = _dict(payload.get("sender"))
    account = _dict(payload.get("account"))
    metadata = _dict(payload.get("metadata"))
    quote = payload.get("quote") if isinstance(payload.get("quote"), dict) else None
    mentions = payload.get("mentions") if isinstance(payload.get("mentions"), list) else []
    rendered_text = str(payload.get("renderedMd") or payload.get("renderedText") or content.get("text") or "").strip()
    return NormalizedEvent(
        raw_event=event,
        payload=payload,
        event_id=_first(event, "eventId", "event_id", "id") or _first(payload, "eventId", "event_id"),
        event_type=_first(event, "eventType", "event_type") or _first(payload, "eventType", "event_type") or "message.created",
        message_id=_first(payload, "messageId", "message_id"),
        status=str(payload.get("status") or "normal"),
        conversation=conversation,
        sender=sender,
        account=account,
        content=content,
        quote=quote,
        mentions=[item for item in mentions if isinstance(item, dict)],
        rendered_text=rendered_text,
        sent_at=_first(payload, "sentAt", "sent_at"),
        metadata=metadata,
        is_self=bool(payload.get("isSelf")),
        is_at_me=bool(payload.get("isAtMe")),
    )


def delivery_payload(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload")
    if isinstance(payload, dict):
        return payload
    return event


def dedupe_key_for_event(event: NormalizedEvent) -> str | None:
    if event.event_id:
        return f"event:{event.event_id}"
    if event.message_id:
        return f"message:{event.message_id}"
    return None


def debounce_config(
    event: NormalizedEvent,
    *,
    default_debounce_ms: int,
    default_max_wait_ms: int,
) -> tuple[int, int]:
    return (
        _int_value(event.metadata.get("debounceMs"), default_debounce_ms),
        _int_value(event.metadata.get("maxWaitMs"), default_max_wait_ms),
    )


def is_plain_text_event(event: NormalizedEvent) -> bool:
    return (
        event.event_type == "message.created"
        and str(event.content.get("type") or "") == "text"
        and not event.quote
        and not media_descriptors(event)
    )


def event_text(event: NormalizedEvent) -> str:
    return event.rendered_text or str(event.content.get("text") or "")


def media_descriptors(event: NormalizedEvent) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    _collect_media(event.content, items)
    return items


def reply_context(event: NormalizedEvent) -> dict[str, Any]:
    quote = event.quote
    if not isinstance(quote, dict):
        return {
            "message_id": None,
            "text": None,
            "author_id": None,
            "author_name": None,
            "is_own_message": False,
        }
    return {
        "message_id": _first(quote, "sourceMessageId", "messageId", "id"),
        "text": _first(quote, "text"),
        "author_id": _first(quote, "senderWxid", "sender_wxid"),
        "author_name": _first(quote, "senderName", "sender_name"),
        "is_own_message": False,
    }


def metadata_for_event(event: NormalizedEvent, *, media: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    data = asdict(event)
    data.pop("raw_event", None)
    data["raw"] = event.raw_event
    data["media"] = media or []
    return {"gewehub": data}


def _collect_media(node: dict[str, Any], items: list[dict[str, Any]]) -> None:
    media = node.get("media")
    if isinstance(media, dict):
        item = dict(media)
        item.setdefault("kind", node.get("type") or "file")
        if item.get("url"):
            items.append(item)
    for child in node.get("items") or []:
        if isinstance(child, dict):
            _collect_media(child, items)


def _first(data: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _int_value(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return int(fallback or 0)
    return max(0, parsed)
