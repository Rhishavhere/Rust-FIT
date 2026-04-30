#!/usr/bin/env python3
"""FIT WebSocket relay — opaque fan-out + peer routing for mobile QR connect."""

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
peer_routes: dict[str, Any] = {}
MAX_REPLAY = 256


async def unregister(ws: Any, fit_ids: set[str]) -> None:
    for fid in fit_ids:
        lst = listeners.get(fid)
        if lst and ws in lst:
            lst.remove(ws)
    stale = [pid for pid, sock in peer_routes.items() if sock is ws]
    for pid in stale:
        peer_routes.pop(pid, None)


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
            payload_text = json.dumps(msg, separators=(",", ":"))

            if mtype == "REGISTER":
                peer_id = msg.get("peer_id")
                if not isinstance(peer_id, str) or not peer_id.strip():
                    LOG.warning("REGISTER missing peer_id")
                    continue
                peer_routes[peer_id] = ws
                await ws.send(json.dumps({"type": "REGISTERED", "peer_id": peer_id}))
                continue

            # Peer-routed messages for mobile UI connection/events.
            if mtype in (
                "CONNECT_REQUEST",
                "CONNECT_RESPONSE",
                "REVOKE_SHARE",
                "PROFILE_UPDATE",
                "DIRECT_SHARE",
            ):
                to_peer = msg.get("to_peer")
                if not isinstance(to_peer, str) or not to_peer.strip():
                    LOG.warning("%s missing to_peer", mtype)
                    continue
                dst = peer_routes.get(to_peer)
                if dst is None:
                    LOG.info("target peer offline: %s", to_peer)
                    continue
                try:
                    await dst.send(payload_text)
                except Exception:
                    LOG.debug("peer routed send failed", exc_info=True)
                continue

            if fit_id is None:
                LOG.warning("missing fit_id")
                continue

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
    async with websockets.serve(handler, "0.0.0.0", 8766):
        LOG.info("FIT Mobile relay ws://0.0.0.0:8766")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
