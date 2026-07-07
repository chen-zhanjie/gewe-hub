from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any


class BoundedTTLSet:
    def __init__(self, *, ttl_seconds: float = 24 * 60 * 60, max_size: int = 4096) -> None:
        self.ttl_seconds = float(ttl_seconds)
        self.max_size = int(max_size)
        self._items: OrderedDict[str, float] = OrderedDict()

    def add(self, key: str | None) -> bool:
        if not key:
            return True
        now = time.time()
        self._evict(now)
        if key in self._items:
            self._items.move_to_end(key)
            self._items[key] = now
            return False
        self._items[key] = now
        self._evict(now)
        return True

    def contains(self, key: str | None) -> bool:
        if not key:
            return False
        now = time.time()
        self._evict(now)
        if key not in self._items:
            return False
        self._items.move_to_end(key)
        return True

    def seed(self, keys: list[Any]) -> None:
        now = time.time()
        for item in keys:
            key, seen_at = _seen_record(item, default_seen_at=now)
            if key:
                self._items[key] = seen_at
                self._items.move_to_end(key)
        self._evict(now)

    def keys(self) -> list[dict[str, Any]]:
        self._evict(time.time())
        return [{"key": key, "seen_at": seen_at} for key, seen_at in self._items.items()]

    def _evict(self, now: float) -> None:
        if self.ttl_seconds > 0:
            expired = now - self.ttl_seconds
            while self._items:
                _, seen_at = next(iter(self._items.items()))
                if seen_at >= expired:
                    break
                self._items.popitem(last=False)
        while self.max_size > 0 and len(self._items) > self.max_size:
            self._items.popitem(last=False)


def _seen_record(item: Any, *, default_seen_at: float) -> tuple[str | None, float]:
    if isinstance(item, dict):
        key = str(item.get("key") or "").strip()
        try:
            seen_at = float(item.get("seen_at"))
        except (TypeError, ValueError):
            seen_at = default_seen_at
        return (key or None), seen_at
    if item:
        return str(item), default_seen_at
    return None, default_seen_at
