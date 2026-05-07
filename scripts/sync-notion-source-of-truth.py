#!/usr/bin/env python3
"""Mirror Tokenly source-of-truth docs into the Tokenly Launch Notion hub.

Requires:
  NOTION_API_KEY or NOTION_TOKEN
  NOTION_LAUNCH_PAGE_ID

Mirrors:
  docs/SOURCE_OF_TRUTH.md -> Tokenly Source Of Truth
  docs/CONTENT_MAINTENANCE_PLAYBOOK.md -> Tokenly Content Maintenance Playbook
"""
from __future__ import annotations

import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

NOTION_VERSION = "2025-09-03"
REPO_ROOT = Path(__file__).resolve().parents[1]
ITEMS = [
    ("Tokenly Source Of Truth", REPO_ROOT / "docs" / "SOURCE_OF_TRUTH.md"),
    ("Tokenly Content Maintenance Playbook", REPO_ROOT / "docs" / "CONTENT_MAINTENANCE_PLAYBOOK.md"),
]


def notion_token() -> str:
    token = os.getenv("NOTION_API_KEY") or os.getenv("NOTION_TOKEN")
    if not token:
        raise SystemExit("Missing NOTION_API_KEY or NOTION_TOKEN")
    return token


def launch_page_id() -> str:
    page_id = os.getenv("NOTION_LAUNCH_PAGE_ID")
    if not page_id:
        raise SystemExit("Missing NOTION_LAUNCH_PAGE_ID")
    return page_id


def api(path: str, method: str = "GET", body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        "https://api.notion.com/v1" + path,
        method=method,
        data=data,
        headers={
            "Authorization": "Bearer " + notion_token(),
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                raw = response.read().decode("utf-8", "replace")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            if exc.code in {429, 500, 502, 503, 504} and attempt < 3:
                time.sleep(2 * attempt)
                continue
            raise SystemExit(f"Notion API error {exc.code}: {raw[:1200]}")
        except (TimeoutError, socket.timeout):
            if attempt < 3:
                time.sleep(2 * attempt)
                continue
            raise


def list_children(block_id: str):
    children = []
    cursor = None
    while True:
        path = f"/blocks/{block_id}/children?page_size=100"
        if cursor:
            path += "&start_cursor=" + cursor
        data = api(path)
        children.extend(data.get("results", []))
        if not data.get("has_more"):
            return children
        cursor = data.get("next_cursor")


def find_child_page(parent_id: str, title: str) -> str | None:
    for block in list_children(parent_id):
        if block.get("type") == "child_page" and block.get("child_page", {}).get("title") == title:
            return block["id"]
    return None


def create_child_page(parent_id: str, title: str):
    data = api(
        "/pages",
        "POST",
        {
            "parent": {"type": "page_id", "page_id": parent_id},
            "properties": {"title": {"title": [{"type": "text", "text": {"content": title}}]}},
        },
    )
    return data["id"], data.get("url")


def page_url(page_id: str) -> str | None:
    return api("/pages/" + page_id).get("url")


def clear_children(page_id: str):
    for block in list_children(page_id):
        if block.get("archived") or block.get("in_trash"):
            continue
        api("/blocks/" + block["id"], "DELETE")
        time.sleep(0.12)


def rich_text(text: str):
    # Notion rich_text text.content hard-limit is 2000 chars. Keep a margin.
    return [{"type": "text", "text": {"content": text[:1900]}}]


def block(block_type: str, text: str):
    if block_type in {"heading_1", "heading_2", "heading_3"}:
        return {"object": "block", "type": block_type, block_type: {"rich_text": rich_text(text)}}
    if block_type in {"bulleted_list_item", "numbered_list_item"}:
        return {"object": "block", "type": block_type, block_type: {"rich_text": rich_text(text)}}
    if block_type == "code":
        return {"object": "block", "type": "code", "code": {"rich_text": rich_text(text), "language": "plain text"}}
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich_text(text)}}


def markdown_to_blocks(text: str):
    blocks = []
    paragraph = []
    in_code = False
    code_lines = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            joined = " ".join(line.strip() for line in paragraph).strip()
            if joined:
                blocks.append(block("paragraph", joined))
            paragraph = []

    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("```"):
            if in_code:
                blocks.append(block("code", "\n".join(code_lines)))
                code_lines = []
                in_code = False
            else:
                flush_paragraph()
                in_code = True
                code_lines = []
            continue
        if in_code:
            code_lines.append(raw)
            continue
        if not stripped:
            flush_paragraph()
            continue
        if stripped.startswith("# "):
            flush_paragraph(); blocks.append(block("heading_1", stripped[2:].strip())); continue
        if stripped.startswith("## "):
            flush_paragraph(); blocks.append(block("heading_2", stripped[3:].strip())); continue
        if stripped.startswith("### "):
            flush_paragraph(); blocks.append(block("heading_3", stripped[4:].strip())); continue
        if stripped.startswith("- "):
            flush_paragraph(); blocks.append(block("bulleted_list_item", stripped[2:].strip())); continue
        numbered = re.match(r"^(\d+)\.\s+(.*)", stripped)
        if numbered:
            flush_paragraph(); blocks.append(block("numbered_list_item", numbered.group(2).strip())); continue
        paragraph.append(stripped)

    flush_paragraph()
    if code_lines:
        blocks.append(block("code", "\n".join(code_lines)))
    return blocks


def append_blocks(page_id: str, blocks):
    for i in range(0, len(blocks), 100):
        api("/blocks/" + page_id + "/children", "PATCH", {"children": blocks[i : i + 100]})


def mirror_one(parent_id: str, title: str, path: Path):
    page_id = find_child_page(parent_id, title)
    if page_id:
        clear_children(page_id)
        action = "updated"
        url = page_url(page_id)
    else:
        page_id, url = create_child_page(parent_id, title)
        action = "created"
    blocks = markdown_to_blocks(path.read_text())
    append_blocks(page_id, blocks)
    return {"title": title, "action": action, "page_id": page_id, "url": url, "blocks": len(list_children(page_id))}


def main():
    parent_id = launch_page_id()
    results = [mirror_one(parent_id, title, path) for title, path in ITEMS]
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
