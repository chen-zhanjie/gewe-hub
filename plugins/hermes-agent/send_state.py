from __future__ import annotations

import time
from threading import Lock


_TTL_SECONDS = 120.0
_lock = Lock()
_tool_sent_conversations: dict[str, float] = {}


def mark_tool_sent(conversation_id: str) -> None:
    clean = str(conversation_id or "").strip()
    if not clean:
        return
    now = time.monotonic()
    with _lock:
        _expire_locked(now)
        _tool_sent_conversations[clean] = now


def consume_tool_sent(conversation_id: str) -> bool:
    clean = str(conversation_id or "").strip()
    if not clean:
        return False
    now = time.monotonic()
    with _lock:
        _expire_locked(now)
        return _tool_sent_conversations.pop(clean, None) is not None


def _expire_locked(now: float) -> None:
    expired = [key for key, marked_at in _tool_sent_conversations.items() if now - marked_at > _TTL_SECONDS]
    for key in expired:
        _tool_sent_conversations.pop(key, None)
