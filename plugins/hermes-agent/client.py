from __future__ import annotations

import base64
import mimetypes
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx


_SSE_TIMEOUT = httpx.Timeout(connect=30.0, read=None, write=30.0, pool=30.0)


class GeWeHubError(RuntimeError):
    pass


class GeWeHubAuthError(GeWeHubError):
    pass


class GeWeHubPermissionError(GeWeHubError):
    pass


class GeWeHubClient:
    def __init__(
        self,
        base_url: str,
        *,
        app_token: str,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = str(base_url or "").rstrip("/")
        self.app_token = str(app_token or "")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=timeout, transport=transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def iter_sse_events(self, *, last_event_id: str | None = None):
        headers = {"Accept": "text/event-stream", **self._auth_header()}
        if last_event_id:
            headers["Last-Event-ID"] = last_event_id
        async with self._client.stream("GET", "/api/apps/events", headers=headers, timeout=_SSE_TIMEOUT) as response:
            await self._raise_for_status(response)
            buffer: dict[str, Any] = {}
            data_lines: list[str] = []
            async for line in response.aiter_lines():
                if not line:
                    if data_lines:
                        yield {
                            "id": buffer.get("id"),
                            "event": buffer.get("event", "message"),
                            "data": "\n".join(data_lines),
                        }
                    buffer = {}
                    data_lines = []
                    continue
                if line.startswith(":"):
                    continue
                field, sep, value = line.partition(":")
                if not sep:
                    continue
                value = value[1:] if value.startswith(" ") else value
                if field == "data":
                    data_lines.append(value)
                elif field in {"id", "event"}:
                    buffer[field] = value
            if data_lines:
                yield {"id": buffer.get("id"), "event": buffer.get("event", "message"), "data": "\n".join(data_lines)}

    async def ack_events(self, event_ids: list[str]) -> dict[str, Any]:
        clean = [str(item).strip() for item in event_ids if str(item or "").strip()]
        if not clean:
            return {"ok": True, "acked": 0}
        return await self._request("POST", "/api/apps/events/ack", json={"eventIds": clean})

    async def send_text(self, conversation_id: str, text: str, idempotency_key: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"conversationId": str(conversation_id), "type": "text", "text": text}
        if idempotency_key:
            payload["idempotencyKey"] = idempotency_key
        return await self._request(
            "POST",
            "/api/send",
            json=payload,
        )

    async def send_media_url(
        self,
        conversation_id: str,
        *,
        media_type: str,
        url: str,
        file_name: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"conversationId": str(conversation_id), "type": media_type}
        if media_type == "image":
            payload["mediaUrl"] = url
        else:
            payload["fileUrl"] = url
        if file_name:
            payload["fileName"] = file_name
        if idempotency_key:
            payload["idempotencyKey"] = idempotency_key
        return await self._request("POST", "/api/send", json=payload)

    async def send_media_file(
        self,
        conversation_id: str,
        *,
        media_type: str,
        path: str | None = None,
        content_base64: str | None = None,
        file_name: str | None = None,
        mime_type: str | None = None,
        duration_ms: int | None = None,
        thumb_path: str | None = None,
        thumb_content_base64: str | None = None,
        thumb_mime_type: str | None = None,
        thumb_file_name: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        file_path = Path(path) if path else None
        if not content_base64:
            if file_path is None or not file_path.is_file():
                raise GeWeHubError(f"media file does not exist: {file_path}")
            content_base64 = base64.b64encode(file_path.read_bytes()).decode("ascii")
        resolved_name = file_name or (file_path.name if file_path else "media.bin")
        resolved_mime = mime_type or mimetypes.guess_type(resolved_name)[0] or "application/octet-stream"
        payload: dict[str, Any] = {
            "conversationId": str(conversation_id),
            "type": media_type,
            "contentBase64": content_base64,
            "fileName": resolved_name,
            "mimeType": resolved_mime,
        }
        if duration_ms is not None:
            payload["durationMs"] = duration_ms
        if thumb_path:
            thumb_file = Path(thumb_path)
            if not thumb_file.is_file():
                raise GeWeHubError(f"thumbnail file does not exist: {thumb_file}")
            thumb_file_name = thumb_file_name or thumb_file.name
            thumb_mime_type = thumb_mime_type or mimetypes.guess_type(thumb_file_name)[0] or "image/jpeg"
            thumb_content_base64 = base64.b64encode(thumb_file.read_bytes()).decode("ascii")
        if thumb_content_base64:
            payload["thumbContentBase64"] = thumb_content_base64
            if thumb_mime_type:
                payload["thumbMimeType"] = thumb_mime_type
            if thumb_file_name:
                payload["thumbFileName"] = thumb_file_name
        if idempotency_key:
            payload["idempotencyKey"] = idempotency_key
        return await self._request("POST", "/api/send", json=payload)

    async def download_media(self, descriptor: dict[str, Any]) -> dict[str, Any]:
        url = str(descriptor.get("url") or "").strip()
        if not url:
            return {"status": "skipped", "error": "missing url"}
        response = await self._client.get(url, headers=self._auth_header(), follow_redirects=True)
        await self._raise_for_status(response)
        file_name = str(descriptor.get("fileName") or descriptor.get("file_name") or "").strip()
        if not file_name:
            path_part = urlparse(url).path.rsplit("/", 1)[-1]
            file_name = path_part or "media.bin"
        suffix = Path(file_name).suffix or mimetypes.guess_extension(response.headers.get("content-type", "")) or ".bin"
        cache_dir = Path(os.getenv("HERMES_HOME") or tempfile.gettempdir()) / "plugins" / "gewehub-hermes-agent" / "media"
        cache_dir.mkdir(parents=True, exist_ok=True)
        fd, path = tempfile.mkstemp(prefix="media_", suffix=suffix, dir=str(cache_dir))
        with os.fdopen(fd, "wb") as fh:
            fh.write(response.content)
        return {
            "status": "downloaded",
            "url": url,
            "local_path": path,
            "kind": descriptor.get("kind") or "file",
            "file_name": file_name,
            "mime_type": response.headers.get("content-type") or descriptor.get("mimeType"),
        }

    async def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
        response = await self._client.request(method, path, json=json, headers=self._auth_header())
        await self._raise_for_status(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise GeWeHubError(self._redact(f"GeWeHub returned non-JSON response: {response.text}")) from exc
        if isinstance(payload, dict) and "error" in payload:
            raise GeWeHubError(self._redact(str(payload["error"])))
        return payload if isinstance(payload, (dict, list)) else {}

    async def _raise_for_status(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        body = await response.aread()
        text = body.decode("utf-8", errors="replace")
        message = self._redact(f"GeWeHub HTTP {response.status_code}: {text}")
        if response.status_code == 401:
            raise GeWeHubAuthError(message)
        if response.status_code == 403:
            raise GeWeHubPermissionError(message)
        raise GeWeHubError(message)

    def _auth_header(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.app_token}"}

    def _redact(self, text: str) -> str:
        return text.replace(self.app_token, "[REDACTED]") if self.app_token else text
