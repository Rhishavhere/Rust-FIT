import { useMemo } from "react";

import {
  AssetDonut,
  CreditTrendLine,
  IncomeBarChart,
  LockedCard,
  MiniStatTiles,
  TradingVolumeChart,
} from "./DashboardCharts";
import { HeldDataTables } from "./DataTables";
import { ManualCliGuide } from "./ManualCliGuide";
import {
  cibilHistoryDelta,
  fourthStatLabel,
  money,
  parseLayer2,
  parseLayer5,
} from "../lib/fitMetrics";
import type { DeltaRow, InspectInfo, LayersMap, ShareMeta } from "../lib/fitTypes";
import type { RelayConnStatus, RelayInbound } from "../lib/relay";
import { DEMO_PATCHES } from "../lib/demoPatches";
import { badgeText, isoDate } from "../lib/fmt";
import { AiCopilot } from "./AiCopilot";

type Mode = "owner" | "recipient";

type Props = {
  mode: Mode;
  /** Owner `.fit` path on disk — used in manual CLI snippets */
  fitPath: string | null;
  layers: LayersMap;
  deltas: DeltaRow[];
  inspect: InspectInfo | null;
  shareMeta: ShareMeta | null;
  busy: string | null;
  verifyOk: boolean | null;
  recipientPub: string;
  setRecipientPub: (s: string) => void;
  shareLayers: string;
  setShareLayers: (s: string) => void;
  expiresDays: number;
  setExpiresDays: (n: number) => void;
  liveTracking: boolean;
  setLiveTracking: (v: boolean) => void;
  exportShare: () => void | Promise<void>;
  relayUrl: string;
  relaySubscriptionStatus: RelayConnStatus;
  relayInboundRecent: RelayInbound[];
  onDemoDelta: (
    key: keyof typeof DEMO_PATCHES,
    layerId: number,
    summary: string,
    attester: string
  ) => Promise<void>;
};

function allow(mode: Mode, id: number, permitted: number[] | undefined): boolean {
  if (mode === "owner") return true;
  return permitted?.includes(id) ?? false;
}

/** For CreditTrendLine - has data if history non-empty */
function hasCreditHistory(layer2: unknown): boolean {
  const h = layer2 && typeof layer2 === "object" ? (layer2 as { cibil_score_history?: unknown[] }).cibil_score_history : [];
  return Array.isArray(h) && h.length > 0;
}

/** For TradingVolumeChart - has non-trivial data */
function hasTradingPulse(layer5: unknown): boolean {
  const o = layer5 && typeof layer5 === "object" ? (layer5 as Record<string, unknown>) : null;
  const tv = o?.trading_volume_monthly;
  if (!Array.isArray(tv)) return false;
  return tv.some((x) => {
    const v = (x as { volume?: unknown }).volume;
    return typeof v === "number" && v > 5000;
  });
}

export function FitDashboard(p: Props) {
  const l2 = p.layers["layer2"];
  const l3 = p.layers["layer3"];
  const l4 = p.layers["layer4"];
  const l5 = p.layers["layer5"];

  const permitted = p.shareMeta?.permitted_layers;

  const L2 = useMemo(() => parseLayer2(p.layers), [p.layers]);
  const L5 = useMemo(() => parseLayer5(p.layers), [p.layers]);
  const fourth = useMemo(() => fourthStatLabel(p.layers), [p.layers]);
  const cdelta = useMemo(() => {
    const d = cibilHistoryDelta(L2.history);
    if (d === null) return "— trend";
    const sign = d >= 0 ? "+" : "";
    return `${sign}${d} pts window`;
  }, [L2.history]);

  const miniInv = useMemo(() => {
    if (L5.investmentCount != null) return String(L5.investmentCount);
    return "—";
  }, [L5.investmentCount]);

  const miniAvg =
    L5.avgTicket != null ? money(L5.avgTicket) : formatCompactAvg(L5);

  const fitScore = p.inspect?.fit_score;
  const netWorth =
    l3 && typeof l3 === "object" && typeof (l3 as { net_worth?: number }).net_worth === "number"
      ? (l3 as { net_worth: number }).net_worth
      : null;

  const utilization = L2.utilPct;

  const creditOk = allow(p.mode, 2, permitted) && hasCreditHistory(l2);
  const tradeOk = allow(p.mode, 5, permitted) && hasTradingPulse(l5);

  const applyDemo = async (
    key: keyof typeof DEMO_PATCHES,
    layerId: number,
    summary: string,
    attester: string
  ) => {
    await p.onDemoDelta(key, layerId, summary, attester);
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <section className="grid gap-4 px-8 pb-2 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlowStatCard
          label="Net worth"
          value={allow(p.mode, 3, permitted) && netWorth != null ? money(netWorth) : "Locked"}
          trend={allow(p.mode, 3, permitted) ? "+ NAV attested paths" : "Layer 3 withheld"}
          positive={allow(p.mode, 3, permitted)}
        />
        <GlowStatCard
          label="FIT score"
          value={fitScore != null ? String(fitScore) : "—"}
          trend="Holistic trust synthesis"
          positive
        />
        <GlowStatCard
          label="Credit utilization"
          value={
            allow(p.mode, 2, permitted) && utilization != null
              ? `${Math.round(utilization)}%`
              : "Locked"
          }
          trend={allow(p.mode, 2, permitted) ? "Blended lines + cards" : "Layer 2 sealed"}
          positive={(utilization ?? 99) <= 70}
        />
        <GlowStatCard label={fourth.title} value={fourth.value} trend={fourth.hint} positive />
      </section>

      {p.mode === "owner" && (
        <div className="px-8 pb-4 pt-4">
          <div className="fit-card-glass px-5 py-4 ring-neon-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fit-muted">
              Demo deltas · synthetic uplinks
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <MiniTrig
                label="Sell Reliance"
                disabled={p.busy != null || !l3}
                onClick={() => void applyDemo("sellReliance", 3, "Sold slice of Reliance (demo)", "owner")}
              />
              <MiniTrig
                label="Open FD ₹2L"
                disabled={p.busy != null || !l3}
                onClick={() => void applyDemo("openFd200k", 3, "Opened new FD ₹2L", "bankaa")}
              />
              <MiniTrig
                label="Refresh CIBIL"
                disabled={p.busy != null || !l2}
                onClick={() => void applyDemo("refreshCibil", 2, "CIBIL refresh", "cibil")}
              />
              <MiniTrig
                label="GST Q1 FY26"
                disabled={p.busy != null || !l4}
                onClick={() => void applyDemo("fileGstQ1", 4, "GST Q1 FY26", "gstn")}
              />
              <MiniTrig
                label="New angel cheque"
                disabled={p.busy != null || !l5}
                onClick={() => void applyDemo("newAngel", 5, "Angel ticket", "owner")}
              />
            </div>
            <ManualCliGuide
              fitPath={p.fitPath}
              shareLayers={p.shareLayers}
              recipientPub={p.recipientPub}
              expiresDays={p.expiresDays}
              liveTracking={p.liveTracking}
            />
          </div>
        </div>
      )}

      {p.mode === "owner" && p.inspect && (
        <div className="px-8 pb-4">
          <div className="fit-card-glass px-6 py-5 lg:flex lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
            <div className="mb-5 flex-1 lg:mb-0">
              <h3 className="text-lg font-semibold text-white">Share selective disclosure</h3>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-fit-muted">
                Paste investor <span className="font-mono text-fit-accent">X25519</span> pubkey, comma-separated
                layers (<code className="text-fit-accent">2,3</code>) and export a relay-ready envelope.
              </p>
              <label className="mt-6 block">
                <span className="block text-[11px] uppercase tracking-wide text-fit-muted">
                  Recipient public key hex
                </span>
                <input
                  className="mt-2 w-full max-w-xl rounded-xl border border-fit-border bg-fit-bg/80 px-4 py-2.5 font-mono text-sm text-fit-accent outline-none ring-2 ring-transparent focus:ring-fit-accent/40"
                  value={p.recipientPub}
                  onChange={(e) => p.setRecipientPub(e.target.value)}
                  spellCheck={false}
                  placeholder="64 hex chars"
                />
              </label>
            </div>
            <label className="flex flex-col text-[11px] text-fit-muted">
              Layers
              <input
                className="mt-1 w-32 rounded-xl border border-fit-border bg-fit-bg px-3 py-2 font-mono text-sm"
                value={p.shareLayers}
                onChange={(e) => p.setShareLayers(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-[11px] text-fit-muted">
              Expiry (days)
              <input
                type="number"
                className="mt-1 w-28 rounded-xl border border-fit-border bg-fit-bg px-3 py-2 text-sm"
                value={p.expiresDays}
                onChange={(e) => p.setExpiresDays(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 py-8 text-[12px] text-slate-200">
              <input
                type="checkbox"
                className="h-5 w-5 rounded accent-fit-accent"
                checked={p.liveTracking}
                onChange={(e) => p.setLiveTracking(e.target.checked)}
              />
              Live tracking relay
            </label>
            <button
              type="button"
              onClick={() => void p.exportShare()}
              className="rounded-xl bg-fit-accent px-8 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black hover:bg-fit-accentDim"
            >
              Export .fitshare
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 px-8 pb-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          {allow(p.mode, 3, permitted) ? <AssetDonut layer3={l3} /> : <LockedCard layerId={3} title="Assets" />}
        </div>

        <div className="xl:col-span-2">
          {allow(p.mode, 3, permitted) ||
          allow(p.mode, 2, permitted) ||
          allow(p.mode, 5, permitted) ? (
            <MiniStatTiles
              invCount={miniInv}
              avgTicketFormatted={miniAvg}
              cibilDelta={allow(p.mode, 2, permitted) ? cdelta : "Layer 2 locked"}
            />
          ) : (
            <LockedCard layerId={5} title="Signals" />
          )}
        </div>

        <div className="flex flex-col gap-5 xl:col-span-5">
          {creditOk ? <CreditTrendLine layer2={l2} /> : null}
          {!creditOk && tradeOk ? <TradingVolumeChart layer5={l5} /> : null}
          {creditOk && tradeOk ? <TradingVolumeChart layer5={l5} /> : null}
          {!creditOk && !tradeOk && (allow(p.mode, 2, permitted) || allow(p.mode, 5, permitted)) ? (
            <LockedCard layerId={2} title="Credit / pulse" />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 px-8 pb-6 lg:grid-cols-2">
        {allow(p.mode, 4, permitted) ? (
          <IncomeBarChart layer4={l4} />
        ) : (
          <div className="fit-card-glass flex min-h-[260px] flex-col items-center justify-center text-xs text-fit-muted">
            ITR plane locked · Layer 4
          </div>
        )}
        <div className="fit-card-glass flex min-h-[260px] flex-col items-center justify-center px-8 text-center">
          <span className="text-[10px] uppercase tracking-[0.4em] text-fit-muted">premium ring</span>
          <p className="mt-6 text-3xl font-semibold text-fit-accent">
            {fitScore ?? "—"}
            <span className="text-sm text-white/60"> FIT</span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-fit-muted">
            Holistic trust index — header materialized at genesis.
          </p>
          <button
            type="button"
            disabled
            className="mt-10 rounded-2xl border border-fit-accent/40 px-10 py-2.5 text-[10px] font-bold uppercase tracking-[0.35em] text-fit-accent opacity-60"
          >
            agent deck soon
          </button>
        </div>
      </div>

      <div className="px-8 pb-8">
        {allow(p.mode, 2, permitted) ||
        allow(p.mode, 3, permitted) ||
        allow(p.mode, 5, permitted) ? (
          <HeldDataTables layer2={l2} layer3={l3} layer5={l5} />
        ) : (
          <LockedCard layerId={3} title="Portfolio surface" />
        )}
      </div>

      <div className="px-8 pb-4">
        <AiCopilot
          mode={p.mode}
          inspect={p.inspect}
          shareMeta={p.shareMeta}
          layers={p.layers}
          deltas={p.deltas}
          verifyOk={p.verifyOk}
          relayUrl={p.relayUrl}
          relaySubscriptionStatus={p.relaySubscriptionStatus}
          relayInboundRecent={p.relayInboundRecent}
          cockpitBusy={p.busy != null}
        />
      </div>

      {p.mode === "recipient" && p.shareMeta && (
        <p className="px-8 pb-6 text-[11px] text-fit-muted">
          Envelope {badgeText(p.shareMeta.source_fit_id_short)} · expires {isoDate(p.shareMeta.expires_at)} · relay{" "}
          {p.shareMeta.live_tracking ? "armed" : "snapshot-only"}
        </p>
      )}

      {p.mode === "owner" && p.inspect != null && p.verifyOk !== null ? (
        <p className="px-8 pb-6 text-[10px] text-fit-muted">
          Signature chain {p.verifyOk ? "matches Merkle envelope" : "FAILED verify"} · owner material.
        </p>
      ) : null}
    </div>
  );
}

function formatCompactAvg(L5: ReturnType<typeof parseLayer5>): string {
  const n = L5.investmentCount && L5.investmentCount > 0 && L5.deployed != null ? L5.deployed / L5.investmentCount : null;
  return n != null ? money(Math.round(n)) : "₹ —";
}

function GlowStatCard({
  label,
  value,
  trend,
  positive,
}: {
  label: string;
  value: string;
  trend: string;
  positive?: boolean;
}) {
  return (
    <div className="fit-card-glass relative overflow-hidden p-6">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${positive ? "from-fit-accent/8" : "from-rose-500/10"} to-transparent`}
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fit-muted">{label}</p>
      <p className="relative z-10 mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">{value}</p>
      <p className="relative z-10 mt-2 text-[11px] text-fit-accent/90">{trend}</p>
    </div>
  );
}

function MiniTrig({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-35 ${
        disabled
          ? "border-fit-border text-fit-muted"
          : "border-fit-accent bg-fit-accent text-black hover:bg-fit-accentDim"
      }`}
    >
      {label}
    </button>
  );
}
