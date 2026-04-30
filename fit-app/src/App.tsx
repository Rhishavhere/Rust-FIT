import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { FitDashboard } from "./components/FitDashboard";
import { RightColumnRails } from "./components/RightColumnRails";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { useRecipientRelay } from "./hooks/useFitRelay";
import { DEMO_PATCHES } from "./lib/demoPatches";
import type { DeltaRow, InspectInfo, LayersMap, ShareMeta, StoredKeys } from "./lib/fitTypes";
import { closeRelayOwner, relayPushDelta, RELAY_WS_URL } from "./lib/relay";
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
  return "Guy Hawkins archetype";
}

export default function App() {
  const [mode, setMode] = useState<UiMode>("idle");
  const [fitPath, setFitPath] = useState<string | null>(null);
  const [keysJson, setKeysJson] = useState<StoredKeys | null>(null);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);
  const [layers, setLayers] = useState<LayersMap>({});
  const [deltas, setDeltas] = useState<DeltaRow[]>([]);
  const [shareMeta, setShareMeta] = useState<ShareMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);

  const [recipientPub, setRecipientPub] = useState("");
  const [shareLayers, setShareLayers] = useState("2,3");
  const [expiresDays, setExpiresDays] = useState(30);
  const [liveTracking, setLiveTracking] = useState(true);

  const personaName = useMemo(() => getIdentityName(layers), [layers]);
  const idShort =
    mode === "owner"
      ? inspect?.fit_id_short
      : shareMeta?.source_fit_id_short ?? inspect?.fit_id_short;

  const recipientRelayOn =
    mode === "recipient" && shareMeta?.live_tracking === true && Boolean(shareMeta?.source_fit_id_hex);
  const { events: relayInbound, status: relayRecipientStatus } = useRecipientRelay(
    recipientRelayOn,
    shareMeta?.source_fit_id_hex ?? null,
    RELAY_WS_URL
  );

  const relayHint = useMemo(() => {
    if (mode === "idle") return undefined;
    if (mode === "owner") return `Relay push → ${RELAY_WS_URL}`;
    if (!shareMeta?.live_tracking) return "Relay: envelope has no live tracking";
    return `Relay ${relayRecipientStatus} ← ${RELAY_WS_URL}`;
  }, [mode, shareMeta?.live_tracking, relayRecipientStatus]);

  const refreshDashboard = useCallback(async (path: string | null, m: UiMode, keys: StoredKeys | null) => {
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
          source_fit_id_hex: res.source_fit_id_hex,
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
  }, []);

  const reset = () => {
    closeRelayOwner();
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
    const p = await open({ filters: [{ name: "FIT binary", extensions: ["fit"] }] });
    const path = typeof p === "string" ? p : p?.[0] ?? null;
    if (!path) return;
    setFitPath(path);
  };

  const chooseKeys = async () => {
    const p = await open({ filters: [{ name: "FIT keys", extensions: ["json"] }] });
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
    const p = await open({ filters: [{ name: "FIT share", extensions: ["fitshare"] }] });
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

  const onDemoDelta = useCallback(
    async (key: keyof typeof DEMO_PATCHES, layerId: number, summary: string, attester: string) => {
      if (!fitPath || !keysJson?.master_secret_hex) return;
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
        try {
          const ins = await fitInspect(fitPath);
          await relayPushDelta(RELAY_WS_URL, ins.fit_id_hex, {
            summary,
            layer_affected: layerId,
            attester,
          });
        } catch (re) {
          console.warn("[FIT relay] PUSH_DELTA failed — is python fit-relay running?", re);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [fitPath, keysJson, refreshDashboard]
  );

  const exportShare = async () => {
    if (!fitPath || !keysJson?.master_secret_hex || !recipientPub.trim()) {
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

  return (
    <div className="flex min-h-full font-sans">

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <TopBar
          breadcrumbRight={idShort ? `ID ${String(idShort).slice(0, 12)}…` : undefined}
          onReset={mode !== "idle" ? reset : undefined}
          busy={busy}
          relayHint={relayHint}
        />

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1">
            {error ? (
              <div className="mx-8 mt-4 rounded-lg border border-red-900/50 bg-red-950/35 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {mode === "idle" ? (
              <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-14">
                <div className="rounded-xl border border-fit-border/60 bg-fit-ink/30 px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fit-accent/90">
                    Two ways to change the token
                  </p>
                  <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-fit-muted">
                    <li>
                      <span className="text-white/90">In this app</span> — load your <code className="text-fit-accent">.fit</code>{" "}
                      and keys, run the demo delta buttons (JSON patches ship in the binary), export{" "}
                      <code className="text-fit-accent">.fitshare</code>, optional WebSocket relay for live envelopes.
                    </li>
                    <li>
                      <span className="text-white/90">In a terminal</span> — from the repo root, use{" "}
                      <code className="text-fit-accent/90">fit-cli</code> for the same cryptography: generate,{" "}
                      <code className="text-white/70">apply-delta</code> with a <strong className="text-white/85">patch file</strong>{" "}
                      (recommended), <code className="text-white/70">verify</code>, <code className="text-white/70">share</code>.
                      After you open the owner cockpit, expand <strong className="text-white/85">Manual changes</strong> for
                      copy-ready commands tied to your file path.
                    </li>
                  </ul>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <LandingCard title="Owner — full-plane FIT">
                    <p className="text-xs leading-relaxed text-fit-muted">
                      Create a genesis token and keys (run once from the repo):
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-fit-muted">
                      <code className="break-all text-fit-accent">
                        cargo run -p fit-cli -- generate --persona priya -o priya.fit -k priya.keys.json
                      </code>
                    </p>
                    <LaunchRow label=".fit token" hint={fitPath ?? "unset"} />
                    <div className="mt-6 flex gap-3">
                      <GhostBtn onClick={chooseOwnerFit}>Pick .fit</GhostBtn>
                      <GhostBtn onClick={chooseKeys}>Keys JSON</GhostBtn>
                    </div>
                    <PrimaryBtn className="mt-8" disabled={!fitPath || !keysJson?.master_secret_hex} onClick={loadOwner}>
                      Enter owner cockpit
                    </PrimaryBtn>
                  </LandingCard>

                  <LandingCard title="Investor envelope">
                    <p className="text-xs leading-relaxed text-fit-muted">
                      Recipient decrypt opens selectively layered envelopes (.fitshare). Use recipient keys JSON generated beside{" "}
                      genesis (<span className="font-mono text-fit-accent">x25519_static_secret_hex</span>) — not manual HEX edits unless you trust upstream tooling.
                    </p>
                    <LaunchRow label=".fitshare" hint={fitPath ?? "unset"} narrow />
                    <div className="mt-6 flex gap-3">
                      <GhostBtn onClick={chooseShareFile}>Pick .fitshare</GhostBtn>
                      <GhostBtn onClick={chooseKeys}>Recipient keys</GhostBtn>
                    </div>
                    <PrimaryBtnOutline className="mt-8" disabled={!fitPath || !keysJson} onClick={loadRecipient}>
                      Enter investor cockpit
                    </PrimaryBtnOutline>
                  </LandingCard>
                </div>
              </main>
            ) : (
              <FitDashboard
                mode={mode}
                fitPath={fitPath}
                layers={layers}
                deltas={deltas}
                inspect={inspect}
                shareMeta={shareMeta}
                busy={busy}
                verifyOk={verifyOk}
                recipientPub={recipientPub}
                setRecipientPub={setRecipientPub}
                shareLayers={shareLayers}
                setShareLayers={setShareLayers}
                expiresDays={expiresDays}
                setExpiresDays={setExpiresDays}
                liveTracking={liveTracking}
                setLiveTracking={setLiveTracking}
                exportShare={exportShare}
                onDemoDelta={onDemoDelta}
                relayUrl={RELAY_WS_URL}
                relaySubscriptionStatus={
                  mode === "recipient" ? relayRecipientStatus : "off"
                }
                relayInboundRecent={relayInbound}
              />
            )}
          </div>

          {(mode === "owner" || mode === "recipient") && (
            <aside className="hidden w-[332px] shrink-0 overflow-y-auto border-l border-fit-border bg-fit-bg/98 px-6 py-6 xl:flex xl:flex-col">
              <RightColumnRails
                layer6={layers["layer6"]}
                deltas={deltas}
                relayInbound={mode === "recipient" ? relayInbound : []}
                relayStatus={mode === "recipient" ? relayRecipientStatus : "off"}
                relayUrl={RELAY_WS_URL}
                ownerPushes={mode === "owner"}
              />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function LandingCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fit-card-glass px-8 py-10">
      <h2 className="mb-6 text-xl font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}

function LaunchRow({ label, hint, narrow }: { label: string; hint: string; narrow?: boolean }) {
  return (
    <div
      className={`mt-4 rounded-lg border border-fit-border/60 bg-fit-ink/40 px-3 py-2 font-mono text-[11px] text-fit-muted ${narrow ? "truncate" : ""}`}
    >
      <span className="text-fit-accent/85">{label}:</span> {hint}
    </div>
  );
}

function GhostBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-fit-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fit-muted hover:border-fit-accent hover:text-white"
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  children,
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-xl bg-fit-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black hover:bg-fit-accentDim disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function PrimaryBtnOutline({
  children,
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-xl border border-fit-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-fit-accent hover:bg-fit-accent hover:text-black disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

