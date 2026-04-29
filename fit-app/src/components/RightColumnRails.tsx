import type { DeltaRow, LayersMap } from "../lib/fitTypes";
import type { RelayConnStatus, RelayInbound } from "../lib/relay";
import { isoDate } from "../lib/fmt";

function activitiesFromLayer6(l6: unknown): { id: string; title: string; detail: string; time: string }[] {
  if (!l6 || typeof l6 !== "object") return [];
  const o = l6 as Record<string, unknown>;
  const sum = o.access_log_summary as Record<string, unknown> | undefined;
  const out: { id: string; title: string; detail: string; time: string }[] = [];
  if (sum && typeof sum === "object") {
    const last = typeof sum.last_accessed === "string" ? sum.last_accessed : "";
    const total =
      typeof sum.total_accesses === "number"
        ? `${sum.total_accesses} gated reads`
        : "Access pulses";
    const uniq = typeof sum.unique_accessors === "number" ? sum.unique_accessors : "?";
    out.push({
      id: "a0",
      title: "Last identity surface read",
      detail: `${total} · ${uniq} unique viewers`,
      time: last || "—",
    });
  }
  const atts = o.attestations;
  if (Array.isArray(atts)) {
    for (let i = 0; i < Math.min(3, atts.length); i++) {
      const a = atts[i] as Record<string, unknown>;
      out.push({
        id: `att-${i}`,
        title: `${String(a.type ?? "Attestation")} verified`,
        detail: `${String(a.attester ?? "")}`,
        time: typeof a.date === "string" ? a.date + " UTC" : "—",
      });
    }
  }
  return out.slice(0, 8);
}

function contactsFromLayer6(l6: unknown): {
  initials: string;
  name: string;
  subtitle: string;
  highlight?: boolean;
}[] {
  if (!l6 || typeof l6 !== "object") {
    return [
      { initials: "?", name: "No ledger yet", subtitle: "Export a `.fitshare` to grant timed access.", highlight: true },
    ];
  }
  const o = l6 as Record<string, unknown>;
  const n = typeof o.fit_share_count === "number" ? o.fit_share_count : 0;
  const active = typeof o.active_shares === "number" ? o.active_shares : 0;
  return [
    {
      initials: "VC",
      name: "Growth desk partners",
      subtitle: `${active} active grant · ${n} envelopes issued historically`,
      highlight: active > 0,
    },
    {
      initials: "BK",
      name: "Lending consortium",
      subtitle: "Subscribes when `.fitshare` has live tracking + relay up",
      highlight: false,
    },
    {
      initials: "YOU",
      name: "Owner session",
      subtitle: `Full-plane unlock · attestations synced`,
      highlight: false,
    },
  ];
}

function relayStatusLabel(s: RelayConnStatus): string {
  switch (s) {
    case "live":
      return "connected";
    case "connecting":
      return "connecting…";
    case "error":
      return "offline / error";
    default:
      return "idle";
  }
}

export function RightColumnRails({
  layer6,
  deltas,
  relayInbound = [],
  relayStatus = "off",
  relayUrl,
  ownerPushes = false,
}: {
  layer6: unknown;
  deltas: DeltaRow[];
  relayInbound?: RelayInbound[];
  relayStatus?: RelayConnStatus;
  relayUrl: string;
  ownerPushes?: boolean;
}) {
  const notifications = [...deltas].reverse().slice(0, 12);
  const activities = activitiesFromLayer6(layer6);
  const contacts = contactsFromLayer6(layer6);
  const relayPreview = [...relayInbound].reverse().slice(0, 24);

  return (
    <div className="flex flex-col gap-5">
      <section className="fit-card-glass overflow-hidden ring-neon-soft">
        <header className="flex flex-col gap-1 border-b border-fit-border/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Relay bus · WebSocket</h3>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                ownerPushes
                  ? "bg-fit-accent/25 text-fit-accent"
                  : relayStatus === "live"
                    ? "bg-fit-accent text-black"
                    : "bg-fit-border text-fit-muted"
              }`}
            >
              {ownerPushes ? "owner push" : relayStatusLabel(relayStatus)}
            </span>
          </div>
          <p className="break-all font-mono text-[9px] leading-tight text-fit-muted opacity-90">{relayUrl}</p>
          {ownerPushes ? (
            <p className="text-[10px] leading-relaxed text-fit-muted">
              Owner session: each demo Δ runs <span className="text-fit-accent">PUSH_DELTA</span> after the file is
              written (run <code className="text-fit-accent">python fit-relay/relay_server.py</code>).
            </p>
          ) : (
            <p className="text-[10px] leading-relaxed text-fit-muted">
              Investor: <span className="text-fit-accent">SUBSCRIBE</span> when the envelope has live tracking — same{" "}
              <code className="text-fit-accent">fit_id</code> as the owner token.
            </p>
          )}
        </header>
        <ul className="max-h-[200px] space-y-0 divide-y divide-fit-border/50 overflow-auto">
          {relayPreview.length === 0 ? (
            <li className="px-4 py-5 text-[11px] text-fit-muted">
              {ownerPushes
                ? "Fire a demo trigger on the owner machine — packet appears here on subscribed clients."
                : "Waiting for broadcast packets…"}
            </li>
          ) : (
            relayPreview.map((ev, i) => {
              const p = ev.parsed;
              const t = typeof p.type === "string" ? p.type : "?";
              const sum = typeof p.summary === "string" ? p.summary : ev.raw.slice(0, 120);
              const layer = typeof p.layer_affected === "number" ? p.layer_affected : "—";
              const ts = typeof p.ts === "number" ? p.ts : null;
              return (
                <li key={`${i}-${ev.raw.slice(0, 32)}`} className="px-4 py-2.5 text-[10px]">
                  <span className="font-mono text-fit-accent">{t}</span>{" "}
                  <span className="text-slate-200">{sum}</span>
                  <p className="mt-1 text-fit-muted">
                    layer {layer}
                    {ts != null ? ` · ${isoDate(ts)}` : ""}
                  </p>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="fit-card-glass overflow-hidden ring-neon-soft">
        <header className="flex items-center justify-between border-b border-fit-border/80 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">FIT evolution · Δ log</h3>
          <span className="rounded bg-fit-highlight px-2 py-0.5 text-[10px] font-medium uppercase text-fit-accent">
            ON-CHAIN FILE
          </span>
        </header>
        <ul className="max-h-[320px] space-y-0 divide-y divide-fit-border/50 overflow-auto">
          {notifications.length === 0 ? (
            <li className="px-4 py-6 text-xs text-fit-muted">
              No signed deltas in this file yet — use demo triggers on the owner build.
            </li>
          ) : (
            notifications.map((n) => (
              <li key={n.delta_id} className="flex gap-3 px-4 py-3 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fit-accent shadow-[0_0_8px_rgba(163,255,51,.7)]" />
                <div>
                  <p className="leading-snug text-slate-200">{n.summary}</p>
                  <p className="mt-1 text-[10px] text-fit-muted">
                    Layer {n.layer_affected} · {isoDate(n.timestamp)}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="fit-card-glass">
        <header className="border-b border-fit-border/80 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Access activities</h3>
          <p className="mt-1 text-[10px] text-fit-muted">Layer 6 — who touched which plane</p>
        </header>
        <ul className="max-h-[240px] space-y-4 overflow-auto px-4 py-4">
          {(activities.length
            ? activities
            : [
                {
                  id: "fallback",
                  title: "Quiet session",
                  detail: "Mint or share to generate access trails.",
                  time: "now",
                },
              ]
          ).map((a, i) => (
            <li key={typeof a.id === "string" ? a.id : `x-${i}`} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fit-border/70 text-[10px] font-bold text-slate-300">
                {(i % 9) + 1}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">{String(a.title)}</p>
                <p className="mt-0.5 text-[11px] text-fit-muted">{String(a.detail)}</p>
                <p className="mt-1 text-[10px] text-fit-muted/80">{typeof a.time === "string" ? a.time : "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="fit-card-glass">
        <header className="border-b border-fit-border/80 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Access holders · counter-parties</h3>
        </header>
        <ul className="divide-y divide-fit-border/40">
          {contacts.map((c) => (
            <li
              key={`${c.name}-${c.initials}`}
              className={`flex items-center gap-3 px-4 py-4 ${
                c.highlight ? "bg-fit-highlight/40 shadow-neon" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-fit-border to-fit-ink text-xs font-semibold uppercase text-fit-accent shadow-neon">
                {c.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{c.name}</p>
                <p className="truncate text-[11px] text-fit-muted">{c.subtitle}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-fit-border/70 px-2 py-1 text-[10px] text-fit-muted opacity-70"
                disabled
                title="Demo wiring"
              >
                ping
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function resolveLayer6(layers: LayersMap): unknown {
  return layers["layer6"];
}
