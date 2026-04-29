#!/usr/bin/env python3
"""FIT WebSocket relay — opaque fan-out (Architecture §3.3 hackathon slice)."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

import websockets

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger("fit-relay")

listeners: dict[str, list[Any]] = defaultdict(list)
replay: dict[str, list[str]] = defaultdict(list)
MAX_REPLAY = 256


async def unregister(ws: Any, fit_ids: set[str]) -> None:
    for fid in fit_ids:
        lst = listeners.get(fid)
        if lst and ws in lst:
            lst.remove(ws)


async def handler(ws: Any) -> None:
    subscribed: set[str] = set()
    try:
        async for raw in ws:
            try:
                text = raw.decode() if isinstance(raw, (bytes, bytearray)) else raw
                msg = json.loads(text)
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                LOG.warning("bad packet: %s", e)
                continue

            mtype = msg.get("type")
            fit_id = msg.get("fit_id")
            if fit_id is None:
                LOG.warning("missing fit_id")
                continue
            payload_text = json.dumps(msg, separators=(",", ":"))

            if mtype == "SUBSCRIBE":
                if fit_id not in subscribed:
                    lst = listeners[fit_id]
                    if ws not in lst:
                        lst.append(ws)
                    subscribed.add(fit_id)
                for past in replay.get(fit_id, [])[-MAX_REPLAY:]:
                    await ws.send(past)

            elif mtype == "PUSH_DELTA":
                replay[fit_id].append(payload_text)
                if len(replay[fit_id]) > MAX_REPLAY:
                    replay[fit_id] = replay[fit_id][-MAX_REPLAY:]
                for peer in list(listeners.get(fit_id, [])):
                    try:
                        await peer.send(payload_text)
                    except Exception:
                        LOG.debug("broadcast drop", exc_info=True)

            elif mtype in ("REVOKED", "MERKLE_UPDATED"):
                for peer in list(listeners.get(fit_id, [])):
                    try:
                        await peer.send(payload_text)
                    except Exception:
                        LOG.debug("event drop", exc_info=True)

            else:
                LOG.debug("Ignoring type=%s", mtype)
    finally:
        await unregister(ws, subscribed)


async def main() -> None:
    async with websockets.serve(handler, "127.0.0.1", 8765):
        LOG.info("FIT relay ws://127.0.0.1:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
