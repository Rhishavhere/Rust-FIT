import { useEffect, useState } from "react";

import { type RelayConnStatus, type RelayInbound, RELAY_WS_URL } from "../lib/relay";

/**
 * SUBSCRIBE to a FIT hex id — receives replay tail + broadcast PUSH_DELTA events.
 */
export function useRecipientRelay(
  enabled: boolean,
  fitIdHex: string | null,
  url: string = RELAY_WS_URL
): { events: RelayInbound[]; status: RelayConnStatus } {
  const [events, setEvents] = useState<RelayInbound[]>([]);
  const [status, setStatus] = useState<RelayConnStatus>("off");

  useEffect(() => {
    if (!enabled || !fitIdHex) {
      setStatus("off");
      setEvents([]);
      return;
    }

    setStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus("live");
      ws.send(JSON.stringify({ type: "SUBSCRIBE", fit_id: fitIdHex }));
    };

    ws.onmessage = (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      setEvents((prev) => [...prev.slice(-256), { raw, parsed }]);
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus((s) => (s === "live" ? "error" : s));

    return () => {
      ws.close();
    };
  }, [enabled, fitIdHex, url]);

  return { events, status };
}
