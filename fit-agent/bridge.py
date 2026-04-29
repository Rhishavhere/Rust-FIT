#!/usr/bin/env python3
"""STDIN/STDOUT JSON-lines bridge for FIT agent (Architecture §5.4)."""

from __future__ import annotations

import json
import os
import sys


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run_chat(message: str, fit_data: dict | None, history: list | None) -> dict:
    fit_block = json.dumps(fit_data or {}, indent=2)[:120_000]
    system_prompt = (
        "You are the FIT agent. FIT = Financial Identity Token (India: ₹, CIBIL, GST, ITR).\n"
        "Here is the materialized FIT JSON the user can see:\n"
        f"<fit_data>\n{fit_block}\n</fit_data>\n"
        "Answer succinctly. Never fabricate figures not present."
    )
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return {
            "response": (
                f"(Offline demo — set ANTHROPIC_API_KEY) Q: {message}\n"
                "Tip: once the key is configured the same bridge calls Claude Sonnet."
            ),
            "tool_calls": [],
            "fit_mutations": [],
        }

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    messages = []
    for turn in history or []:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1536,
        system=system_prompt,
        messages=messages,
        temperature=0.2,
    )
    text_parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    answer = "".join(text_parts)
    return {"response": answer, "tool_calls": [], "fit_mutations": []}


def main() -> None:
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"response": "", "error": f"json: {e}"})
            continue
        act = req.get("action")
        if act != "chat":
            emit({"response": "", "error": f"unknown_action:{act}"})
            continue
        out = run_chat(
            str(req.get("message", "")),
            req.get("fit_data"),
            req.get("history"),
        )
        emit(out)


if __name__ == "__main__":
    main()
