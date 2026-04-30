import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AiChatTurn, DeltaRow, InspectInfo, LayersMap, ShareMeta } from "../lib/fitTypes";
import { fitAiChat } from "../lib/tauri";
import type { RelayConnStatus, RelayInbound } from "../lib/relay";
import { FormattedAssistantBody } from "./assistantFormat";

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

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
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

const SUGGESTED_PROMPTS = [
  "Summarize credit, utilization, and score trend from what's disclosed.",
  "What do the most recent deltas suggest changed?",
  "Briefly explain relay subscription status and recent inbound events.",
] as const;

function CopilotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L13.09 6.26L18 7L13.09 7.74L12 12L10.91 7.74L6 7L10.91 6.26L12 2Z"
        className="fill-fit-accent"
        opacity="0.9"
      />
      <path
        d="M19 15L19.74 17.74L22.5 18.5L19.74 19.26L19 22L18.26 19.26L15.5 18.5L18.26 17.74L19 15Z"
        className="fill-fit-accent"
        opacity="0.55"
      />
      <path
        d="M5 14L5.5 15.5L7 16L5.5 16.5L5 18L4.5 16.5L3 16L4.5 15.5L5 14Z"
        className="fill-fit-accent"
        opacity="0.4"
      />
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-0.5" aria-hidden>
      {[0, 1, 2].map((n) => (
        <span
          key={n}
          className="inline-block h-1.5 w-1.5 rounded-full bg-fit-accent/75 animate-bounce"
          style={{ animationDelay: `${n * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function AiCopilot(p: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
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

  useEffect(() => {
    scrollEnd();
  }, [turns.length, thinking]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || thinking || p.cockpitBusy) return;
    const userTurn: AiChatTurn = { role: "user", content: text };
    const historyForModel: AiChatTurn[] = [
      ...turns.map((t) => ({ role: t.role, content: t.content })),
      userTurn,
    ];

    setDraft("");
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setThinking(true);

    try {
      const reply = await fitAiChat({
        history: historyForModel,
        context: contextStatic as Record<string, unknown>,
      });
      setTurns((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTurns((prev) => [...prev, { role: "assistant", content: msg, isError: true }]);
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, turns, contextStatic, p.cockpitBusy]);

  const disabledInput = thinking || p.cockpitBusy;
  const canClear = turns.length > 0 && !thinking;

  return (
    <section className="fit-card-glass overflow-hidden ring-neon-soft">
      <div className="flex items-start justify-between gap-4 border-b border-fit-border/60 px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-fit-border/80 bg-fit-ink/50">
            <CopilotIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fit-accent">FIT Copilot</h2>
            <p className="mt-1 max-w-xl text-[12px] leading-snug text-fit-muted">
              Groq-powered Q&amp;A over this cockpit (read-only). Set{" "}
              <span className="font-mono text-fit-accent/90">GROQ_API_KEY</span> or{" "}
              <span className="font-mono text-fit-accent/90">VITE_GROQ_API_KEY</span> in{" "}
              <span className="font-mono text-white/75">fit-app/.env</span> — restart dev after changes.
            </p>
          </div>
        </div>
        {canClear ? (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="shrink-0 rounded-lg border border-fit-border/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fit-muted transition hover:border-fit-accent/50 hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="max-h-[min(420px,52vh)] min-h-[200px] space-y-4 overflow-y-auto px-5 py-4">
        {turns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-fit-border/70 bg-fit-ink/25 px-4 py-6">
            <p className="text-center text-[12px] leading-relaxed text-fit-muted">
              Ask about disclosed FIT planes, selective share rules, the delta chain, or relay traffic.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabledInput}
                  onClick={() => setDraft(label)}
                  className="max-w-full rounded-full border border-fit-border/70 bg-black/30 px-3 py-1.5 text-left text-[11px] leading-snug text-white/80 transition hover:border-fit-accent/45 hover:bg-fit-accent/10 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div key={`u-${i}`} className="flex justify-end">
                <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md border border-fit-accent/28 bg-fit-accent/[0.12] px-4 py-3 shadow-[inset_0_1px_0_rgba(163,255,51,0.06)]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-fit-accent/80">You</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-white/92">{t.content}</p>
                </div>
              </div>
            ) : (
              <div key={`a-${i}`} className="flex justify-start gap-3">
                <div
                  className={`mt-1 h-8 w-8 shrink-0 rounded-lg border ${
                    t.isError
                      ? "border-amber-500/35 bg-amber-950/40"
                      : "border-fit-border/80 bg-fit-ink/55"
                  } flex items-center justify-center`}
                >
                  <CopilotIcon className={`h-4 w-4 ${t.isError ? "opacity-60" : ""}`} />
                </div>
                <div
                  className={`max-w-[min(100%,36rem)] flex-1 rounded-2xl rounded-bl-md border px-4 py-3 ${
                    t.isError
                      ? "border-amber-500/30 bg-amber-950/25"
                      : "border-fit-border/70 bg-black/40"
                  }`}
                >
                  <p
                    className={`text-[9px] font-bold uppercase tracking-[0.12em] ${
                      t.isError ? "text-amber-200/80" : "text-fit-muted"
                    }`}
                  >
                    {t.isError ? "Error" : "Assistant"}
                  </p>
                  <div className="mt-2">
                    <FormattedAssistantBody text={t.content} isError={t.isError} />
                  </div>
                </div>
              </div>
            )
          )
        )}

        {thinking ? (
          <div className="flex justify-start gap-3 opacity-90">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fit-border/80 bg-fit-ink/55">
              <CopilotIcon className="h-4 w-4 opacity-50" />
            </div>
            <div className="rounded-2xl rounded-bl-md border border-fit-border/60 bg-black/35 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-fit-muted">Assistant</p>
              <p className="mt-2 flex items-center gap-2 text-[12px] text-fit-muted">
                <TypingDots />
                <span>Thinking…</span>
              </p>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="border-t border-fit-border/55 bg-fit-ink/20 px-5 py-4">
        <label className="sr-only" htmlFor="copilot-message">
          Message to FIT Copilot
        </label>
        <textarea
          id="copilot-message"
          rows={3}
          className="w-full resize-y rounded-xl border border-fit-border/90 bg-fit-bg/95 px-4 py-3 font-sans text-[13px] leading-relaxed text-white shadow-inner outline-none ring-0 transition placeholder:text-fit-muted/70 focus:border-fit-accent/45 focus:shadow-[0_0_0_3px_rgba(163,255,51,0.12)]"
          placeholder={
            p.cockpitBusy
              ? "Wait until loading finishes…"
              : "Ask a question… (Enter to send, Shift+Enter for newline)"
          }
          value={draft}
          disabled={disabledInput}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-fit-muted/85">Read-only context from the open cockpit · not legal or investment advice</p>
          <button
            type="button"
            disabled={thinking || !draft.trim() || p.cockpitBusy}
            onClick={() => void send()}
            className="rounded-xl bg-fit-accent px-8 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-black transition hover:bg-fit-accentDim disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
