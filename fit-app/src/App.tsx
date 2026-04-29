import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useState } from "react";

import {
  AssetDonut,
  CreditTrendLine,
  IncomeBarChart,
  LockedCard,
  PortfolioTable,
} from "./components/DashboardCharts";
import { DEMO_PATCHES } from "./lib/demoPatches";
import type { DeltaRow, InspectInfo, LayersMap, StoredKeys } from "./lib/fitTypes";
import { badgeText, formatInr, isoDate } from "./lib/fmt";
import {
  fitApplyDelta,
  fitCreateShare,
  fitDeltaSummaries,
  fitInspect,
  fitMaterializeOwner,
  fitOpenShare,
  fitVerify,
  readUtf8,
} from "./lib/tauri";

type UiMode = "idle" | "owner" | "recipient";

function parseKeysJson(raw: string): StoredKeys {
  const j = JSON.parse(raw) as StoredKeys;
  if (!j.ed25519_signing_seed_hex || !j.x25519_static_secret_hex) {
    throw new Error("keys file must include ed25519_signing_seed_hex and x25519_static_secret_hex");
  }
  return j;
}

function getIdentityName(layers: LayersMap): string {
  const l1 = layers["layer1"];
  if (l1 && typeof l1 === "object" && "full_name" in (l1 as object)) {
    const n = (l1 as { full_name?: string }).full_name;
    if (typeof n === "string" && n) return n;
  }
  return "Identity";
}

function fourthStatSubtitle(layers: LayersMap): string {
  const l4 = layers["layer4"] as Record<string, unknown> | undefined;
  const l5 = layers["layer5"] as Record<string, unknown> | undefined;
  if (l4 && typeof l4 === "object") {
    const b = l4.business as Record<string, unknown> | undefined;
    if (b && typeof b.name === "string") return "Active business";
  }
  if (l5 && typeof l5.investment_count === "number") return "Angel investments";
  return "Portfolio signal";
}

function fourthStatValue(layers: LayersMap): string {
  const l4 = layers["layer4"] as Record<string, unknown> | undefined;
  const l5 = layers["layer5"] as Record<string, unknown> | undefined;
  if (l4 && typeof l4 === "object") {
    const b = l4.business as Record<string, unknown> | undefined;
    if (b && typeof b.name === "string") return String(b.name).slice(0, 28);
  }
  if (l5 && typeof l5.investment_count === "number") return String(l5.investment_count);
  return "—";
}

function layerPermitted(
  mode: UiMode,
  id: number,
  permitted: number[] | undefined
): boolean {
  if (mode === "owner") return true;
  return permitted?.includes(id) ?? false;
}

export default function App() {
  const [mode, setMode] = useState<UiMode>("idle");
  const [fitPath, setFitPath] = useState<string | null>(null);
  const [keysJson, setKeysJson] = useState<StoredKeys | null>(null);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);
  const [layers, setLayers] = useState<LayersMap>({});
  const [deltas, setDeltas] = useState<DeltaRow[]>([]);
  const [shareMeta, setShareMeta] = useState<{
    source_fit_id_short: string;
    permitted_layers: number[];
    expires_at: number;
    live_tracking: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);

  const [recipientPub, setRecipientPub] = useState("");
  const [shareLayers, setShareLayers] = useState("2,3");
  const [expiresDays, setExpiresDays] = useState(30);
  const [liveTracking, setLiveTracking] = useState(true);

  const displayName = useMemo(() => getIdentityName(layers), [layers]);
  const l2 = layers["layer2"];
  const l3 = layers["layer3"];
  const l4 = layers["layer4"];

  const permitted = shareMeta?.permitted_layers;

  const refreshDashboard = useCallback(
    async (path: string | null, m: UiMode, keys: StoredKeys | null) => {
      if (!path || !keys) return;
      setBusy("Loading FIT…");
      setError(null);
      try {
        if (m === "owner") {
          const ms = keys.master_secret_hex;
          if (!ms) throw new Error("Owner keys must include master_secret_hex (from `fit generate`).");
          const [ins, mat, drows] = await Promise.all([
            fitInspect(path),
            fitMaterializeOwner(path, ms),
            fitDeltaSummaries(path),
          ]);
          setInspect(ins);
          setLayers(mat.layers as LayersMap);
          setDeltas(drows);
          try {
            await fitVerify(path);
            setVerifyOk(true);
          } catch {
            setVerifyOk(false);
          }
          setShareMeta(null);
        } else {
          const x = keys.x25519_static_secret_hex;
          const res = await fitOpenShare(path, x);
          setInspect(null);
          setLayers(res.layers as LayersMap);
          setShareMeta({
            source_fit_id_short: res.source_fit_id_short,
            permitted_layers: res.permitted_layers,
            expires_at: res.expires_at,
            live_tracking: res.live_tracking,
          });
          setDeltas([]);
          setVerifyOk(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const reset = () => {
    setMode("idle");
    setFitPath(null);
    setKeysJson(null);
    setInspect(null);
    setLayers({});
    setDeltas([]);
    setShareMeta(null);
    setError(null);
    setVerifyOk(null);
    setBusy(null);
  };

  const chooseOwnerFit = async () => {
    const p = await open({
      filters: [{ name: "FIT binary", extensions: ["fit"] }],
    });
    const path = typeof p === "string" ? p : p?.[0] ?? null;
    if (!path) return;
    setFitPath(path);
  };

  const chooseKeys = async () => {
    const p = await open({
      filters: [{ name: "FIT keys", extensions: ["json"] }],
    });
    const path = typeof p === "string" ? p : p?.[0] ?? null;
    if (!path) return;
    setError(null);
    try {
      const raw = await readUtf8(path);
      setKeysJson(parseKeysJson(raw));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const chooseShareFile = async () => {
    const p = await open({
      filters: [{ name: "FIT share", extensions: ["fitshare"] }],
    });
    const path = typeof p === "string" ? p : p?.[0] ?? null;
    if (!path) return;
    setFitPath(path);
  };

  const loadOwner = async () => {
    if (!fitPath || !keysJson) return;
    setMode("owner");
    await refreshDashboard(fitPath, "owner", keysJson);
  };

  const loadRecipient = async () => {
    if (!fitPath || !keysJson) return;
    setMode("recipient");
    await refreshDashboard(fitPath, "recipient", keysJson);
  };

  const cibil =
    l2 && typeof l2 === "object" && typeof (l2 as { cibil_score?: number }).cibil_score === "number"
      ? (l2 as { cibil_score: number }).cibil_score
      : null;
  const netWorth =
    l3 && typeof l3 === "object" && typeof (l3 as { net_worth?: number }).net_worth === "number"
      ? (l3 as { net_worth: number }).net_worth
      : null;

  const applyDemo = async (
    key: keyof typeof DEMO_PATCHES,
    layerId: number,
    summary: string,
    attester: string
  ) => {
    if (mode !== "owner" || !fitPath || !keysJson?.master_secret_hex) return;
    setBusy(summary);
    setError(null);
    try {
      await fitApplyDelta({
        filePath: fitPath,
        masterSecretHex: keysJson.master_secret_hex,
        ed25519SeedHex: keysJson.ed25519_signing_seed_hex,
        layerId,
        patchJson: DEMO_PATCHES[key],
        summary,
        attester,
      });
      await refreshDashboard(fitPath, "owner", keysJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const exportShare = async () => {
    if (mode !== "owner" || !fitPath || !keysJson?.master_secret_hex || !recipientPub.trim()) {
      setError("Recipient X25519 pubkey (hex, 64 chars) is required.");
      return;
    }
    const out = await save({
      defaultPath: "share.fitshare",
      filters: [{ name: "FIT share", extensions: ["fitshare"] }],
    });
    if (!out || typeof out !== "string") return;
    const exp = Math.floor(Date.now() / 1000) + expiresDays * 86400;
    setBusy("Creating share envelope…");
    setError(null);
    try {
      await fitCreateShare({
        filePath: fitPath,
        masterSecretHex: keysJson.master_secret_hex,
        ed25519SeedHex: keysJson.ed25519_signing_seed_hex,
        recipientX25519PubHex: recipientPub.trim(),
        layersCsv: shareLayers.replace(/\s+/g, ""),
        expiresUnix: exp,
        liveTracking,
        outPath: out,
      });
      setError(null);
      alert(`Share written to:\n${out}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fitScore = inspect?.fit_score;

  return (
    <div className="min-h-full">
      <header className="border-b border-fit-border bg-fit-card/80 px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Financial Identity Token</h1>
            <p className="text-sm text-fit-muted">
              Desktop dashboard — open a <code className="text-emerald-400/90">.fit</code> or{" "}
              <code className="text-emerald-400/90">.fitshare</code> with matching keys.
            </p>
          </div>
          {mode !== "idle" && (
            <button
              type="button"
              className="rounded-lg border border-fit-border px-4 py-2 text-sm text-slate-300 hover:bg-fit-highlight/30"
              onClick={reset}
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {mode === "idle" && (
          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-fit-border bg-fit-card p-6">
              <h2 className="text-lg font-medium text-white">Owner — full FIT</h2>
              <p className="mt-2 text-sm leading-relaxed text-fit-muted">
                Generate with{" "}
                <code className="text-xs text-emerald-300/90">cargo run -p fit-cli -- generate --persona priya -o priya.fit -k priya.keys.json</code>
                , then load the <code className="text-xs">.fit</code> and <code className="text-xs">.keys.json</code> here.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-black hover:bg-emerald-500"
                  onClick={chooseOwnerFit}
                >
                  Choose .fit file
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-fit-border px-4 py-2.5 text-sm text-slate-200 hover:bg-fit-highlight/30"
                  onClick={chooseKeys}
                >
                  Choose keys.json
                </button>
              </div>
              <p className="mt-4 font-mono text-xs text-fit-muted">{fitPath ?? "No .fit selected"}</p>
              <p className="font-mono text-xs text-fit-muted">
                Keys: {keysJson ? `${keysJson.ed25519_signing_seed_hex.slice(0, 10)}…` : "(none)"}
              </p>
              <button
                type="button"
                disabled={!fitPath || !keysJson?.master_secret_hex}
                className="mt-6 w-full rounded-lg bg-emerald-500/90 py-3 text-sm font-semibold text-black disabled:opacity-40"
                onClick={loadOwner}
              >
                Load owner dashboard
              </button>
            </div>

            <div className="rounded-2xl border border-fit-border bg-fit-card p-6">
              <h2 className="text-lg font-medium text-white">Recipient — share envelope</h2>
              <p className="mt-2 text-sm text-fit-muted">
                Open a <code className="text-xs text-emerald-300/90">.fitshare</code> saved by the owner (
                <code className="text-xs">fit share …</code> or the exporter below).
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-black hover:bg-emerald-500"
                  onClick={chooseShareFile}
                >
                  Choose .fitshare
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-fit-border px-4 py-2.5 text-sm text-slate-200 hover:bg-fit-highlight/30"
                  onClick={chooseKeys}
                >
                  Recipient keys.json (X25519 decrypt)
                </button>
              </div>
              <button
                type="button"
                disabled={!fitPath || !keysJson}
                className="mt-8 w-full rounded-lg border border-fit-border py-3 text-sm font-medium text-emerald-200 hover:bg-fit-highlight/40 disabled:opacity-40"
                onClick={loadRecipient}
              >
                Load investor view
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {(busy ?? null) && (
          <p className="mb-6 text-sm text-emerald-200/90">{busy}…</p>
        )}

        {(mode === "owner" || mode === "recipient") && (
          <>
            {/* Hero */}
            <section className="mb-8 overflow-hidden rounded-2xl border border-fit-border bg-gradient-to-br from-fit-card via-fit-card to-fit-highlight/60 p-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-fit-muted">
                    FIT ID ·{" "}
                    {mode === "owner" ? badgeText(inspect?.fit_id_short ?? "") : badgeText(shareMeta?.source_fit_id_short ?? "")}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                    {displayName}
                  </h2>
                  <p className="mt-3 text-sm text-fit-muted">
                    {mode === "owner"
                      ? `Last deltas: ${inspect?.delta_count ?? 0}`
                      : `Share expiry: ${shareMeta ? isoDate(shareMeta.expires_at) : "—"} · tracking ${shareMeta?.live_tracking ? "on" : "off"}`}
                  </p>
                  {mode === "owner" && verifyOk !== null && (
                    <p className="mt-2 text-xs text-fit-muted">
                      Merkle signature: {verifyOk ? "✓ verified" : "✗ failed"}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-fit-muted">FIT score</p>
                  <p className="text-5xl font-bold tabular-nums text-emerald-400">
                    {fitScore != null ? fitScore : "—"}
                  </p>
                  {mode === "recipient" && (
                    <p className="mt-2 max-w-xs text-xs text-fit-muted">
                      Headline score is stored in the full <code>.fit</code> header; share envelopes carry permitted layers only.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Stat cards */}
            <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Net worth"
                value={layerPermitted(mode, 3, permitted) && netWorth != null ? formatInr(netWorth) : "—"}
                sub={layerPermitted(mode, 3, permitted) ? "Layer 3" : "Locked"}
              />
              <StatCard label="FIT score" value={fitScore != null ? String(fitScore) : "—"} sub="Public header / owner full file" />
              <StatCard
                label="CIBIL score"
                value={
                  layerPermitted(mode, 2, permitted) && cibil != null ? String(cibil) : "—"
                }
                sub={layerPermitted(mode, 2, permitted) ? "Layer 2 — credit" : "Locked"}
              />
              <StatCard
                label={fourthStatSubtitle(layers)}
                value={fourthStatValue(layers)}
                sub="Layer 4 · 5"
              />
            </section>

            {mode === "owner" && (
              <section className="mb-10 rounded-xl border border-fit-border bg-fit-highlight/35 p-4">
                <h3 className="text-sm font-medium text-emerald-200/90">Demo triggers (Δ + signed delta log)</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <MiniTrigger
                    label="Sell Reliance"
                    disabled={busy != null || !layers["layer3"]}
                    onClick={() => applyDemo("sellReliance", 3, "Sold slice of Reliance (demo)", "owner")}
                  />
                  <MiniTrigger
                    label="Open FD ₹2L"
                    disabled={busy != null || !layers["layer3"]}
                    onClick={() => applyDemo("openFd200k", 3, "Opened new FD ₹2L", "bankaa")}
                  />
                  <MiniTrigger
                    label="Refresh CIBIL"
                    disabled={busy != null || !layers["layer2"]}
                    onClick={() => applyDemo("refreshCibil", 2, "CIBIL refresh (demo uplink)", "cibil")}
                  />
                  <MiniTrigger
                    label="GST Q1 FY26"
                    disabled={busy != null || !layers["layer4"]}
                    onClick={() =>
                      applyDemo("fileGstQ1", 4, "Filed GST Q1 FY26 turnover line", "gstn")
                    }
                  />
                  <MiniTrigger
                    label="New angel cheque"
                    disabled={busy != null || !layers["layer5"]}
                    onClick={() =>
                      applyDemo("newAngel", 5, "Angel ticket — GreenGrid (demo)", "owner")
                    }
                  />
                </div>
              </section>
            )}

            {mode === "owner" && inspect && keysJson?.master_secret_hex && (
              <section className="mb-10 rounded-xl border border-fit-border bg-fit-card/80 p-5">
                <h3 className="text-base font-medium text-white">Share FIT (Envelope)</h3>
                <p className="mt-2 text-xs text-fit-muted">
                  Paste investor <strong>X25519</strong> public key hex (see <code>fit keygen</code>). Layers CSV e.g.
                  <code className="ml-1">2,3</code>.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-fit-muted">
                    Recipient pubkey (hex)
                    <input
                      className="rounded border border-fit-border bg-fit-bg px-3 py-2 font-mono text-sm text-emerald-100"
                      value={recipientPub}
                      onChange={(e) => setRecipientPub(e.target.value)}
                      spellCheck={false}
                      placeholder="64 hex chars"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fit-muted">
                    Layers
                    <input
                      className="w-24 rounded border border-fit-border bg-fit-bg px-2 py-2 font-mono text-sm"
                      value={shareLayers}
                      onChange={(e) => setShareLayers(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fit-muted">
                    Expiry (days)
                    <input
                      type="number"
                      className="w-24 rounded border border-fit-border bg-fit-bg px-2 py-2 text-sm"
                      value={expiresDays}
                      onChange={(e) => setExpiresDays(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={liveTracking}
                      onChange={(e) => setLiveTracking(e.target.checked)}
                    />
                    Live tracking
                  </label>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500"
                    onClick={exportShare}
                  >
                    Export .fitshare
                  </button>
                </div>
              </section>
            )}

            <div className="grid gap-8 xl:grid-cols-3">
              <div className="space-y-8 xl:col-span-2">
                {layerPermitted(mode, 3, permitted) ? (
                  <AssetDonut layer3={l3} />
                ) : (
                  <LockedCard layerId={3} title="Assets" />
                )}
                <div className="grid gap-8 md:grid-cols-2">
                  {layerPermitted(mode, 2, permitted) ? (
                    <CreditTrendLine layer2={l2} />
                  ) : (
                    <LockedCard layerId={2} title="Credit & trust" />
                  )}
                  {layerPermitted(mode, 4, permitted) ? (
                    <IncomeBarChart layer4={l4} />
                  ) : (
                    <LockedCard layerId={4} title="Business & income" />
                  )}
                </div>
                {layerPermitted(mode, 3, permitted) ? (
                  <PortfolioTable layer3={l3} />
                ) : (
                  <LockedCard layerId={3} title="Portfolio table" />
                )}
              </div>

              <div className="space-y-8">
                <div className="rounded-xl border border-fit-border bg-fit-card p-4">
                  <h3 className="text-sm font-medium text-slate-200">Delta feed</h3>
                  <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto text-xs">
                    {deltas.length === 0 ? (
                      <li className="text-fit-muted">No signed deltas yet.</li>
                    ) : (
                      [...deltas].reverse().map((d) => (
                        <li key={d.delta_id} className="rounded border border-fit-border/70 bg-fit-bg/60 px-3 py-2">
                          <span className="text-emerald-400/95">#{d.delta_id}</span>{" "}
                          <span className="text-fit-muted">Layer {d.layer_affected}</span>
                          <p className="mt-1 text-slate-300">{d.summary}</p>
                          <p className="mt-1 text-fit-muted">{isoDate(d.timestamp)}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-fit-border bg-fit-card/80 p-4 text-xs leading-relaxed text-fit-muted">
                  <strong className="text-slate-400">Held layers</strong>
                  <p className="mt-2">
                    {mode === "owner"
                      ? "Layers 1–6 decrypted locally with your master secret."
                      : permitted?.join(", ") ?? "(see envelope metadata)"}
                  </p>
                </div>
              </div>
            </div>

            {(layerPermitted(mode, 6, permitted) || mode === "owner") && layers["layer6"] && (
              <section className="mt-10 rounded-xl border border-fit-border bg-fit-card/60 p-4 text-xs text-fit-muted">
                <strong className="text-slate-400">Reputation & attestations</strong>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-500">
                  {JSON.stringify(layers["layer6"], null, 2)}
                </pre>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-fit-border bg-fit-card p-5">
      <p className="text-xs uppercase tracking-wide text-fit-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-fit-muted">{sub}</p> : null}
    </div>
  );
}

function MiniTrigger({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded-lg border border-emerald-900/70 bg-fit-bg/70 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-fit-highlight/50 disabled:opacity-35"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
