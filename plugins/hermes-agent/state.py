from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any


class GeWeHubStateStore:
    def __init__(self, *, base_url: str, app_token: str) -> None:
        home = Path(os.getenv("HERMES_HOME") or Path.home() / ".hermes")
        token_hash = hashlib.sha256(str(app_token or "").encode("utf-8")).hexdigest()[:12]
        state_key = _safe_state_key(f"{str(base_url or '').rstrip('/')}:{token_hash}")
        self.path = home / "plugins" / "gewehub-hermes-agent" / "state" / f"{state_key}.json"

    def load_last_event_id(self) -> str | None:
        value = self._load_payload().get("last_event_id")
        return str(value) if value else None

    def save_last_event_id(self, event_id: str) -> None:
        event_id = str(event_id or "").strip()
        if not event_id:
            return
        payload = self._load_payload()
        payload["last_event_id"] = event_id
        self._save_payload(payload)

    def load_seen_keys(self) -> list[Any]:
        seen = self._load_payload().get("seen_keys")
        return [item for item in seen if item] if isinstance(seen, list) else []

    def save_seen_keys(self, keys: list[Any]) -> None:
        payload = self._load_payload()
        payload["seen_keys"] = [key for key in keys if key]
        self._save_payload(payload)

    def _load_payload(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _save_payload(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(self.path)


def _safe_state_key(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return cleaned.strip("._-") or "default"
