import { FIT_CLI, MANUAL_DELTA_ROWS, PATCH_SOURCE, quotePath } from "../lib/manualWorkflows";

type Props = {
  /** Selected `.fit` — interpolated into examples */
  fitPath: string | null;
  /** Share form — mirrored in `share` snippet */
  shareLayers: string;
  recipientPub: string;
  expiresDays: number;
  liveTracking: boolean;
};

export function ManualCliGuide(p: Props) {
  const fit = p.fitPath ?? "your-token.fit";
  const keys = "your.keys.json";
  const fitQ = quotePath(fit);
  const keysQ = quotePath(keys);

  const liveFlag = p.liveTracking ? "" : " --live-tracking false";
  const recipient = p.recipientPub.trim() || "RECIPIENT_X25519_HEX64";

  const verify = `${FIT_CLI} verify ${fitQ}`;
  const inspect = `${FIT_CLI} inspect ${fitQ}`;
  const share = `${FIT_CLI} share ${fitQ} -k ${keysQ} --layers "${p.shareLayers.trim() || "2,3,5"}" --recipient ${recipient}${liveFlag} --expires-days ${p.expiresDays} -o investor.fitshare`;

  return (
    <details className="group mt-4 rounded-xl border border-fit-border/70 bg-fit-ink/35 open:border-fit-accent/35 open:bg-fit-ink/55">
      <summary className="cursor-pointer list-none px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fit-muted group-open:text-fit-accent">
          Manual changes · same FIT as the buttons
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-fit-muted/95">
          Prefer <span className="text-white/90">patch files</span> in the terminal — no fragile inline JSON in PowerShell
          or Bash. Patch JSON for each demo lives under keys in <code className="text-fit-accent/90">{PATCH_SOURCE}</code>.
        </span>
      </summary>
      <div className="border-t border-fit-border/50 px-5 pb-5 pt-2 text-[11px] leading-relaxed text-fit-muted">
        <ol className="ml-4 list-decimal space-y-2 text-white/85">
          <li>
            Copy one patch array from <code className="text-fit-accent/90">{PATCH_SOURCE}</code> into a{" "}
            <code className="text-fit-accent/90">.json</code> file (RFC 6902 array).
          </li>
          <li>
            Run <code className="text-fit-accent/90">apply-delta</code> — it updates the <code className="text-fit-accent/90">{fitQ}</code>{" "}
            place on disk (same as the UI).
          </li>
          <li>
            Optional: <code className="text-fit-accent/90">verify</code> then push relay events from your own tooling if the
            relay is running.
          </li>
        </ol>

        <p className="mt-4 text-[10px] uppercase tracking-wider text-fit-muted">Quick checks</p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-fit-border/60 bg-black/40 p-3 font-mono text-[10px] text-fit-accent/95">
          {`${verify}\n${inspect}`}
        </pre>

        <p className="mt-4 text-[10px] uppercase tracking-wider text-fit-muted">Demo deltas → CLI (template)</p>
        <p className="mt-1 text-[10px] text-fit-muted/90">
          Replace <code className="text-white/70">{keysQ}</code> with the path to the same keys JSON you loaded in this app.
        </p>
        <ul className="mt-3 space-y-3">
          {MANUAL_DELTA_ROWS.map((row) => {
            const cmd = `${FIT_CLI} apply-delta ${fitQ} -k ${keysQ} --layer ${row.layer} --summary "${row.summary}" --attester ${row.attester} --patch-file ${row.suggestedPatchFile}`;
            return (
              <li key={row.patchKey} className="rounded-lg border border-fit-border/40 bg-black/25 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/90">
                  {row.label}{" "}
                  <span className="font-normal text-fit-muted">
                    · layer {row.layer} · attester {row.attester}
                  </span>
                </p>
                <pre className="mt-2 overflow-x-auto font-mono text-[10px] leading-snug text-fit-accent/90">{cmd}</pre>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[10px] uppercase tracking-wider text-fit-muted">Selective share (matches form above)</p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-fit-border/60 bg-black/40 p-3 font-mono text-[10px] text-fit-accent/95">
          {share}
        </pre>
        <p className="mt-2 text-[10px] text-fit-muted/90">
          Investor opens <code className="text-fit-accent/90">.fitshare</code> in this app (recipient keys). The CLI{" "}
          <code className="text-white/60">open</code> subcommand is for full owner <code className="text-white/60">.fit</code>{" "}
          materialization, not encrypted envelopes.
        </p>
      </div>
    </details>
  );
}
