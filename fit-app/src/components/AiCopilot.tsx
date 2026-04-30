import { useCallback, useMemo, useRef, useState } from "react";

import type { AiChatTurn, DeltaRow, InspectInfo, LayersMap, ShareMeta } from "../lib/fitTypes";
import { fitAiChat } from "../lib/tauri";
import type { RelayConnStatus, RelayInbound } from "../lib/relay";

type Props = {
  mode: "owner" | "recipient";
  inspect: InspectInfo | null;
  shareMeta: ShareMeta | null;
  layers: LayersMap;
  deltas: DeltaRow[];
  verifyOk: boolean | null;
  relayUrl: string;
  /** Recipient WebSocket subscriber state ("off" when not subscribing). */
  relaySubscriptionStatus: RelayConnStatus;
  relayInboundRecent: RelayInbound[];
  cockpitBusy: boolean;
};

function buildContext(p: Props) {
  return {
    cockpit_mode: p.mode,
    header_inspect_owner_only: p.mode === "owner" ? p.inspect : null,
    selective_share_meta_investor_only: p.mode === "recipient" ? p.shareMeta : null,
    materialized_planes: p.layers,
    delta_chain_recent: p.deltas.slice(-100),
    merkle_verify_owner_only: p.mode === "owner" ? p.verifyOk : null,
    relay: {
      url: p.relayUrl,
      subscription_status: p.mode === "recipient" ? p.relaySubscriptionStatus : null,
      recent_inbound_sample: p.relayInboundRecent.slice(-64).map((ev) => ({
        parsed: ev.parsed,
        raw_truncated:
          ev.raw.length > 2_048 ? `${ev.raw.slice(0, 2048)}…[trunc]` : ev.raw,
      })),
    },
  };
}

export function AiCopilot(p: Props) {
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const contextStatic = useMemo(() => buildContext(p), [
    p.mode,
    p.inspect,
    p.shareMeta,
    p.layers,
    p.deltas,
    p.verifyOk,
    p.relayUrl,
    p.relaySubscriptionStatus,
    p.relayInboundRecent,
  ]);

  const scrollEnd = () => {
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  };

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || thinking || p.cockpitBusy) return;
    const userTurn: AiChatTurn = { role: "user", content: text };
    const historyForModel: AiChatTurn[] = [...turns, userTurn];

    setDraft("");
    setErr(null);
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    scrollEnd();
    setThinking(true);

    try {
      const reply = await fitAiChat({
        history: historyForModel,
        context: contextStatic as Record<string, unknown>,
      });
      setTurns((prev) => [...prev, { role: "assistant", content: reply }]);
      scrollEnd();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setTurns((prev) => [...prev, { role: "assistant", content: `(error) ${msg}` }]);
      scrollEnd();
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, turns, contextStatic, p.cockpitBusy]);

  return (
    <div className="mt-8 rounded-xl border border-fit-border/80 bg-fit-ink/40 ring-neon-soft">
      <header className="flex items-center justify-between border-b border-fit-border/60 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fit-accent">FIT Copilot</p>
          <p className="mt-1 text-[10px] text-fit-muted">Groq-backed · read-only context from this cockpit</p>
        </div>
      </header>

      <div className="max-h-[340px] min-h-[180px] space-y-3 overflow-y-auto px-4 py-3 font-sans">
        {turns.length === 0 ? (
          <p className="text-xs leading-relaxed text-fit-muted">
            Ask about disclosed FIT planes, selective shares, deltas, or relay traffic. Reads{" "}
            <span className="font-mono text-fit-accent">GROQ_API_KEY</span> /{" "}
            <span className="font-mono text-fit-accent">VITE_GROQ_API_KEY</span>
            {' '}and model variants from{" "}
            <span className="font-mono text-white/80">fit-app/.env</span>
            {' '}(Rust loads it at startup — restart dev after edits).
          </p>
        ) : (
          turns.map((t, i) => (
            <div
              key={`${t.role}-${i}`}
              className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
                t.role === "user"
                  ? "ml-6 border-fit-accent/30 bg-fit-accent/12 text-white"
                  : "mr-4 border-fit-border bg-black/35 text-fit-muted"
              }`}
            >
              <p className="text-[9px] font-bold uppercase tracking-wider opacity-65">{t.role}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-white/90">{t.content}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {thinking ? (
        <p className="px-4 pb-2 text-[10px] font-medium uppercase tracking-wider animate-pulse text-fit-accent">
          contacting Groq…
        </p>
      ) : null}
      {err ? (
        <p className="px-4 pb-2 text-[10px] text-amber-200/95">Last error: {err}</p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-fit-border/50 px-4 py-3">
        <textarea
          rows={3}
          className="w-full resize-y rounded-lg border border-fit-border bg-fit-bg px-3 py-2 font-sans text-sm text-white outline-none ring-2 ring-transparent focus:border-fit-accent/50 focus:ring-fit-accent/20"
          placeholder={
            p.cockpitBusy
              ? "Wait until loading finishes…"
              : "e.g. Summarize credit posture + liquid assets disclosed here…"
          }
          value={draft}
          disabled={thinking || p.cockpitBusy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          disabled={thinking || !draft.trim() || p.cockpitBusy}
          onClick={() => void send()}
          className="self-end rounded-lg bg-fit-accent px-6 py-2 text-xs font-bold uppercase tracking-[0.12em] text-black hover:bg-fit-accentDim disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
