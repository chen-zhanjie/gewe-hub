from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from .client import GeWeHubClient
    from .config import resolve_gewehub_connection
    from .outbound import dispatch_standard, normalize_explicit_payload, standard_response
except ImportError:
    from client import GeWeHubClient
    from config import resolve_gewehub_connection
    from outbound import dispatch_standard, normalize_explicit_payload, standard_response


async def run(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "send-html":
        return await run_send_html(args)
    parser.print_help(sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(argv))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gewehub-hermes-agent")
    subcommands = parser.add_subparsers(dest="command")

    send_html = subcommands.add_parser("send-html")
    send_html.add_argument("--base-url", default="")
    send_html.add_argument("--app-key", "--app-token", dest="app_key", default="")
    send_html.add_argument("--conversation-id", required=True)
    send_html.add_argument("--title", required=True)
    send_html.add_argument("--desc", default="")
    send_html.add_argument("--thumb-url")
    send_html.add_argument("--idempotency-key")
    source = send_html.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", dest="html_file")
    source.add_argument("--content")
    source.add_argument("--content-base64")
    source.add_argument("--stdin", action="store_true")
    source.add_argument("--url")
    return parser


async def run_send_html(args: argparse.Namespace) -> int:
    client: GeWeHubClient | None = None
    try:
        connection = resolve_gewehub_connection(base_url=args.base_url, app_token=args.app_key)
        base_url = connection["base_url"]
        app_key = connection["app_token"]
        if not base_url:
            raise RuntimeError("missing --base-url, GEWEHUB_BASE_URL, or platforms.gewehub.extra.base_url in Hermes config")
        if not app_key:
            raise RuntimeError("missing --app-key, GEWEHUB_APP_TOKEN, or platforms.gewehub.extra.app_token in Hermes config")

        kwargs: dict[str, Any] = {
            "title": args.title,
            "desc": args.desc or "",
            "idempotency_key": args.idempotency_key,
        }
        if args.thumb_url:
            kwargs["thumb_url"] = args.thumb_url
        if args.html_file:
            html_file = Path(args.html_file)
            if not html_file.is_file():
                raise RuntimeError(f"html file does not exist: {html_file}")
            kwargs["html_content_base64"] = base64.b64encode(html_file.read_bytes()).decode("ascii")
            kwargs["html_file_name"] = html_file.name
        elif args.content is not None:
            kwargs["html_content"] = args.content
        elif args.content_base64 is not None:
            kwargs["html_content_base64"] = args.content_base64
        elif args.stdin:
            kwargs["html_content"] = sys.stdin.read()
        elif args.url:
            kwargs["link_url"] = args.url

        explicit = {
            "type": "html",
            "title": kwargs.pop("title"),
            "desc": kwargs.pop("desc"),
            "thumbUrl": kwargs.pop("thumb_url", None),
            "idempotencyKey": kwargs.pop("idempotency_key", None),
            "htmlContent": kwargs.pop("html_content", None),
            "htmlContentBase64": kwargs.pop("html_content_base64", None),
            "htmlFileName": kwargs.pop("html_file_name", None),
            "linkUrl": kwargs.pop("link_url", None),
        }
        client = GeWeHubClient(base_url, app_token=app_key)
        response = await dispatch_standard(
            client, normalize_explicit_payload(args.conversation_id, explicit).payload
        )
        print(json.dumps(format_send_html_result(response), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        return 1
    finally:
        if client is not None:
            await client.aclose()


def format_send_html_result(response: dict[str, Any]) -> dict[str, Any]:
    standard = standard_response(response)
    return {
        "success": bool(standard.get("success", True)),
        "message_id": standard.get("messageId"),
        "url": standard.get("url"),
        "accepted": standard.get("accepted"),
    }


if __name__ == "__main__":
    raise SystemExit(main())
