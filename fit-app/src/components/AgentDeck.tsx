import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";

import { AGENT_DECK } from "../lib/agentDeckData";
import type { AgentAction, AgentId, AgentTurnResult } from "../lib/agentTypes";
import { parseAgentResponse } from "../lib/agentTypes";
import { DEMO_AGENT_META } from "../lib/demoAgentMeta";
import type { DEMO_PATCHES } from "../lib/demoPatches";
import type { AiChatTurn, DeltaRow, InspectInfo, LayersMap, StoredKeys } from "../lib/fitTypes";
import { badgeText, isoDate } from "../lib/fmt";
import { fitAgentChat, fitCreateShare, fitVerify } from "../lib/tauri";
import { FormattedAssistantBody } from "./assistantFormat";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

type Props = {
  inspect: InspectInfo | null;
  layers: LayersMap;
  deltas: DeltaRow[];
  verifyOk: boolean | null;
  fitPath: string | null;
  keysJson: StoredKeys | null;
  recipientPub: string;
  setRecipientPub: (s: string) => void;
  shareLayers: string;
  setShareLayers: (s: string) => void;
  expiresDays: number;
  setExpiresDays: (n: number) => void;
  liveTracking: boolean;
  setLiveTracking: (v: boolean) => void;
  onDemoDelta: (
    key: keyof typeof DEMO_PATCHES,
    layerId: number,
    summary: string,
    attester: string
  ) => Promise<void>;
  onOwnerRefresh: () => Promise<void>;
  cockpitBusy: boolean;
  setBusy: (s: string | null) => void;
  onError: (msg: string | null) => void;
};

function buildAgentContext(p: Props) {
  const l1 = p.layers["layer1"];
  let displayNameHint = "";
  if (l1 && typeof l1 === "object" && "full_name" in (l1 as object)) {
    const n = (l1 as { full_name?: string }).full_name;
    if (typeof n === "string") displayNameHint = n;
  }
  return {
    cockpit_mode: "owner",
    inspect: p.inspect,
    token_display_name_hint: displayNameHint,
    share_form: {
      recipient_pub: p.recipientPub.trim(),
      layers_csv: p.shareLayers.replace(/\s+/g, ""),
      expires_days: p.expiresDays,
      live_tracking: p.liveTracking,
    },
    merkle_verify_last: p.verifyOk,
    delta_chain_recent: p.deltas.slice(-20).map((d) => ({
      summary: d.summary,
      layer: d.layer_affected,
      delta_id: d.delta_id,
    })),
    demo_patch_keys: Object.keys(DEMO_AGENT_META),
  };
}

export function AgentDeck(p: Props) {
  const [agentId, setAgentId] = useState<AgentId>("share_desk");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const ctx = useMemo(() => buildAgentContext(p), [
    p.inspect,
    p.layers,
    p.deltas,
    p.verifyOk,
    p.recipientPub,
    p.shareLayers,
    p.expiresDays,
    p.liveTracking,
  ]);

  const scrollEnd = () => {
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  };

  useEffect(() => {
    scrollEnd();
  }, [turns.length, thinking]);

  const executeActions = useCallback(
    async (actions: AgentAction[], parsed: AgentTurnResult): Promise<string> => {
      const notes: string[] = [];
      const displayName = parsed.actions.find(
        (a): a is Extract<AgentAction, { type: "create_share" }> => a.type === "create_share"
      )?.investor_display_name;

      for (const a of actions) {
        if (a.type === "run_verify") {
          if (!p.fitPath) {
            notes.push("Verify skipped — no FIT file path.");
            continue;
          }
          p.setBusy("Verifying…");
          try {
            await fitVerify(p.fitPath);
            notes.push("Verify: **OK** — signature chain matches Merkle envelope.");
          } catch (e) {
            notes.push(`Verify: **failed** — ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            p.setBusy(null);
          }
          await p.onOwnerRefresh();
          continue;
        }

        if (a.type === "apply_demo_delta") {
          const meta = DEMO_AGENT_META[a.demo_key];
          p.setBusy(`Applying ${a.demo_key}…`);
          try {
            await p.onDemoDelta(a.demo_key, meta.layerId, meta.summary, meta.attester);
            notes.push(`Applied demo delta **${a.demo_key}** on layer ${meta.layerId}.`);
          } catch (e) {
            notes.push(`Delta failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            p.setBusy(null);
          }
          continue;
        }

        if (a.type === "create_share") {
          const pk = (a.recipient_x25519_pub_hex || p.recipientPub).trim().replace(/^0x/i, "");
          const layers = a.layers_csv.replace(/\s+/g, "").replace(/,,+/g, ",") || "2,3";
          const days = Math.max(1, Math.min(3650, Math.floor(Number(a.expires_days)) || 30));

          p.setRecipientPub(pk);
          p.setShareLayers(layers);
          p.setExpiresDays(days);
          p.setLiveTracking(a.live_tracking);

          if (pk.length !== 64 || !/^[0-9a-fA-F]+$/.test(pk)) {
            notes.push(
              "Share not exported — need recipient **X25519** public key (64 hex chars). Paste it in the form above or mention it in chat."
            );
            continue;
          }

          if (!p.fitPath || !p.keysJson?.master_secret_hex) {
            notes.push("Share not exported — missing FIT path or owner keys.");
            continue;
          }

          p.setBusy("Creating share envelope…");
          p.onError(null);
          try {
            const out = await save({
              defaultPath: "investor.fitshare",
              filters: [{ name: "FIT share", extensions: ["fitshare"] }],
            });
            if (out == null || typeof out !== "string") {
              notes.push("Share export cancelled (save dialog).");
            } else {
              const exp = Math.floor(Date.now() / 1000) + days * 86400;
              await fitCreateShare({
                filePath: p.fitPath,
                masterSecretHex: p.keysJson.master_secret_hex,
                ed25519SeedHex: p.keysJson.ed25519_signing_seed_hex,
                recipientX25519PubHex: pk,
                layersCsv: layers,
                expiresUnix: exp,
                liveTracking: a.live_tracking,
                outPath: out,
              });
              const who = displayName || a.investor_display_name || "Investor";
              const expLabel = isoDate(exp);
              notes.push(
                `**Done.** Share envelope written to disk. **${who}** can open layers **${layers}** until **${expLabel}**.`
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notes.push(`Share failed: ${msg}`);
            p.onError(msg);
          } finally {
            p.setBusy(null);
          }
        }
      }

      if (notes.length === 0) return parsed.message;
      return `${parsed.message}\n\n---\n${notes.join("\n")}`;
    },
    [p]
  );

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
    p.onError(null);

    try {
      const raw = await fitAgentChat({
        history: historyForModel,
        context: ctx as Record<string, unknown>,
        agentId,
      });
      const parsed = parseAgentResponse(raw);
      if (!parsed) {
        setTurns((prev) => [...prev, { role: "assistant", content: raw, isError: true }]);
        return;
      }
      const after = await executeActions(parsed.actions, parsed);
      setTurns((prev) => [...prev, { role: "assistant", content: after }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTurns((prev) => [...prev, { role: "assistant", content: msg, isError: true }]);
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, turns, ctx, agentId, p, executeActions]);

  const disabledInput = thinking || p.cockpitBusy;
  const selected = AGENT_DECK.find((a) => a.id === agentId)!;

  return (
    <div className="mt-6 w-full border-t border-fit-border/60 pt-5 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fit-muted">Agent deck</p>
      <p className="mt-1 text-[11px] leading-snug text-fit-muted">
        Groq JSON agents — actions run locally via Tauri (same ops as the buttons / CLI).
      </p>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {AGENT_DECK.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={disabledInput}
            onClick={() => setAgentId(a.id)}
            className={`min-w-[8.5rem] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
              agentId === a.id
                ? "border-fit-accent/50 bg-fit-accent/10"
                : "border-fit-border/70 bg-fit-fg/[0.03] hover:border-fit-accent/30"
            }`}
          >
            <p className="text-[11px] font-semibold text-fit-fg">{a.name}</p>
            <p className="text-[9px] uppercase tracking-wider text-fit-muted">{a.title}</p>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-fit-muted">{selected.blurb}</p>
      {p.inspect ? (
        <p className="mt-1 font-mono text-[9px] text-fit-muted">
          FIT {badgeText(p.inspect.fit_id_short)} · scorer {p.inspect.fit_score}
        </p>
      ) : null}

      <div className="mt-3 max-h-[220px] space-y-3 overflow-y-auto rounded-lg border border-fit-border/50 bg-fit-fg/[0.02] px-3 py-2">
        {turns.length === 0 ? (
          <div className="flex flex-wrap gap-1.5 py-2">
            {selected.chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabledInput}
                onClick={() => setDraft(c)}
                className="rounded-full border border-fit-border/60 bg-fit-ink/40 px-2.5 py-1 text-left text-[10px] text-fit-fg/85 hover:border-fit-accent/35 disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div key={`u-${i}`} className="flex justify-end">
                <div className="max-w-[95%] rounded-xl border border-fit-accent/20 bg-fit-accent/[0.06] px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fit-muted">You</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-fit-fg/92">{t.content}</p>
                </div>
              </div>
            ) : (
              <div key={`a-${i}`} className="rounded-xl border border-fit-border/60 bg-fit-ink/30 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-fit-muted">
                  {selected.name} · {t.isError ? "Error" : "Agent"}
                </p>
                <div className="mt-1 text-[11px]">
                  <FormattedAssistantBody text={t.content} isError={t.isError} />
                </div>
              </div>
            )
          )
        )}
        {thinking ? (
          <p className="animate-pulse px-1 py-2 text-[10px] text-fit-muted">Planning & executing…</p>
        ) : null}
        <div ref={bottomRef} className="h-px" />
      </div>

      <textarea
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-fit-border/80 bg-fit-bg/90 px-3 py-2 text-[12px] text-fit-fg outline-none focus:ring-2 focus:ring-fit-accent/25"
        placeholder={`Message ${selected.name}…`}
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
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={turns.length === 0 || thinking}
          onClick={() => setTurns([])}
          className="text-[10px] uppercase tracking-wider text-fit-muted hover:text-fit-fg disabled:opacity-40"
        >
          Clear thread
        </button>
        <button
          type="button"
          disabled={disabledInput || !draft.trim()}
          onClick={() => void send()}
          className="rounded-lg bg-fit-accent px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-fit-onAccent hover:bg-fit-accentDim disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
