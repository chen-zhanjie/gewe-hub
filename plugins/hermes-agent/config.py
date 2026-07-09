from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_PLATFORM_KEYS = ("gewehub", "gewehub-hermes-agent")


def resolve_gewehub_connection(*, base_url: str | None = None, app_token: str | None = None) -> dict[str, str]:
    config = load_hermes_config()
    plugin_config = _plugin_config_from_hermes_config(config)
    resolved_base_url = _clean_string(base_url) or _clean_string(os.getenv("GEWEHUB_BASE_URL")) or _clean_string(plugin_config.get("base_url"))
    resolved_app_token = _clean_string(app_token) or _clean_string(os.getenv("GEWEHUB_APP_TOKEN")) or _clean_string(plugin_config.get("app_token"))
    return {"base_url": resolved_base_url.rstrip("/"), "app_token": resolved_app_token}


def load_hermes_config() -> dict[str, Any]:
    try:
        from hermes_cli.config import load_config

        config = load_config()
        return config if isinstance(config, dict) else {}
    except Exception:
        return _load_hermes_config_fallback()


def _load_hermes_config_fallback() -> dict[str, Any]:
    config_path = Path(os.getenv("HERMES_HOME") or Path.home() / ".hermes") / "config.yaml"
    if not config_path.is_file():
        return {}
    try:
        import yaml

        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _plugin_config_from_hermes_config(config: dict[str, Any]) -> dict[str, Any]:
    platforms = config.get("platforms")
    if isinstance(platforms, dict):
        for key in _PLATFORM_KEYS:
            platform_config = platforms.get(key)
            extracted = _extract_platform_extra(platform_config)
            if extracted:
                return extracted

    plugins = config.get("plugins")
    if isinstance(plugins, dict):
        entries = plugins.get("entries")
        if isinstance(entries, dict):
            for key in _PLATFORM_KEYS:
                extracted = _extract_platform_extra(entries.get(key))
                if extracted:
                    return extracted
    return {}


def _extract_platform_extra(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    extra = raw.get("extra")
    if isinstance(extra, dict):
        return extra
    return raw


def _clean_string(value: Any) -> str:
    return str(value or "").strip()
