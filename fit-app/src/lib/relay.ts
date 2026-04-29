/**
 * Broadcast-only WebSocket helpers for `fit-relay` (SUBSCRIBE / PUSH_DELTA protocol).
 */

export const RELAY_WS_URL = import.meta.env.VITE_RELAY_WS ?? "ws://127.0.0.1:8765";

let ownerSocket: WebSocket | null = null;
let ownerUrl = "";

async function ensureOwnerRelay(url: string): Promise<WebSocket> {
  if (ownerSocket?.readyState === WebSocket.OPEN && ownerUrl === url) {
    return ownerSocket;
  }
  ownerSocket?.close();
  ownerUrl = url;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      ownerSocket = ws;
      resolve(ws);
    };
    ws.onerror = () => reject(new Error("Relay WebSocket connect failed"));
  });
}

export function closeRelayOwner(): void {
  ownerSocket?.close();
  ownerSocket = null;
  ownerUrl = "";
}

/** Fan-out opaque JSON blobs — server stores & rebroadcasts to SUBSCRIBE peers. */
export async function relayPushDelta(
  url: string,
  fitIdHex: string,
  envelope: {
    summary: string;
    layer_affected: number;
    attester: string;
  }
): Promise<void> {
  const ws = await ensureOwnerRelay(url);
  ws.send(
    JSON.stringify({
      type: "PUSH_DELTA",
      fit_id: fitIdHex,
      ts: Math.floor(Date.now() / 1000),
      ...envelope,
    })
  );
}

export type RelayInbound = {
  raw: string;
  parsed: Record<string, unknown>;
};

export type RelayConnStatus = "off" | "connecting" | "live" | "error";
