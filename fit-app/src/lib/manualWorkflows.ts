/** Single place for owner “manual / CLI” docs — kept in sync with `demoPatches.ts` + dashboard buttons. */

export const FIT_CLI = "cargo run -p fit-cli --";

/** Source file to copy JSON patch arrays from when mirroring demo buttons in the terminal. */
export const PATCH_SOURCE = "fit-app/src/lib/demoPatches.ts";

export type DemoPatchKey = keyof typeof import("./demoPatches").DEMO_PATCHES;

export type ManualDeltaRow = {
  /** Key in `DEMO_PATCHES` — use the same JSON blob in a patch file */
  patchKey: DemoPatchKey;
  label: string;
  layer: number;
  summary: string;
  attester: string;
  /** Short hint for which patch file name to use */
  suggestedPatchFile: string;
};

/** Mirrors `FitDashboard` demo triggers + `DEMO_PATCHES` */
export const MANUAL_DELTA_ROWS = [
  {
    patchKey: "sellReliance",
    label: "Sell Reliance",
    layer: 3,
    summary: "Sold slice of Reliance (demo)",
    attester: "owner",
    suggestedPatchFile: "patch-sell-reliance.json",
  },
  {
    patchKey: "openFd200k",
    label: "Open FD ₹2L",
    layer: 3,
    summary: "Opened new FD ₹2L",
    attester: "bankaa",
    suggestedPatchFile: "patch-open-fd.json",
  },
  {
    patchKey: "refreshCibil",
    label: "Refresh CIBIL",
    layer: 2,
    summary: "CIBIL refresh",
    attester: "cibil",
    suggestedPatchFile: "patch-cibil.json",
  },
  {
    patchKey: "fileGstQ1",
    label: "GST Q1 FY26",
    layer: 4,
    summary: "GST Q1 FY26",
    attester: "gstn",
    suggestedPatchFile: "patch-gst-q1.json",
  },
  {
    patchKey: "newAngel",
    label: "New angel cheque",
    layer: 5,
    summary: "Angel ticket",
    attester: "owner",
    suggestedPatchFile: "patch-angel.json",
  },
] as const satisfies readonly ManualDeltaRow[];

export function quotePath(p: string): string {
  const s = p.replace(/\\/g, "/");
  if (/[^\w./-]/.test(s)) return JSON.stringify(p);
  return s;
}
