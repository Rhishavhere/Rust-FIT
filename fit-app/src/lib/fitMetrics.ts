import type { LayersMap } from "./fitTypes";

/** Derive dashboard metrics from decrypted layer JSON for any persona. */

export function money(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseLayer2(layers: LayersMap): {
  cibil: number | null;
  utilPct: number | null;
  history: { month: string; score: number }[];
} {
  const raw = layers["layer2"];
  if (!raw || typeof raw !== "object") {
    return { cibil: null, utilPct: null, history: [] };
  }
  const o = raw as Record<string, unknown>;
  const cibil = typeof o.cibil_score === "number" ? o.cibil_score : null;
  const utilPct =
    typeof o.overall_credit_utilization_pct === "number"
      ? o.overall_credit_utilization_pct
      : null;
  const h = o.cibil_score_history;
  const history = Array.isArray(h)
    ? h
        .map((x) => {
          const e = x as Record<string, unknown>;
          return {
            month: String(e.month ?? ""),
            score: typeof e.score === "number" ? e.score : 0,
          };
        })
        .filter((x) => x.month)
    : [];
  return { cibil, utilPct, history };
}

/** ~12-month CIBIL delta (first → last in history). */
export function cibilHistoryDelta(history: { score: number }[]): number | null {
  if (history.length < 2) return null;
  return history[history.length - 1]!.score - history[0]!.score;
}

export function parseLayer5(layers: LayersMap): {
  investmentCount: number | null;
  avgTicket: number | null;
  deployed: number | null;
  trading: { month: string; vol: number }[];
} {
  const raw = layers["layer5"];
  if (!raw || typeof raw !== "object") {
    return { investmentCount: null, avgTicket: null, deployed: null, trading: [] };
  }
  const o = raw as Record<string, unknown>;
  const investmentCount =
    typeof o.investment_count === "number" ? o.investment_count : null;
  const avgTicket = typeof o.avg_ticket_size === "number" ? o.avg_ticket_size : null;
  const deployed = typeof o.total_deployed === "number" ? o.total_deployed : null;
  const tv = o.trading_volume_monthly;
  const trading = Array.isArray(tv)
    ? tv
        .map((x) => {
          const e = x as Record<string, unknown>;
          return {
            month: String(e.month ?? ""),
            vol: typeof e.volume === "number" ? e.volume : 0,
          };
        })
        .filter((x) => x.month)
    : [];
  return { investmentCount, avgTicket, deployed, trading };
}

export function parseLayer4Biz(layers: LayersMap): string | null {
  const raw = layers["layer4"];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const b = o.business as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") return null;
  return typeof b.name === "string" ? b.name : null;
}

export function fourthStatLabel(layers: LayersMap): { title: string; value: string; hint: string } {
  const biz = parseLayer4Biz(layers);
  const L5 = parseLayer5(layers);
  if (biz) {
    return {
      title: "Active business",
      value: biz.length > 32 ? biz.slice(0, 29) + "…" : biz,
      hint: "Layer 4 · MCA / GST identity",
    };
  }
  if (L5.investmentCount != null) {
    return {
      title: "Angel investments",
      value: String(L5.investmentCount),
      hint: L5.deployed != null ? `${money(L5.deployed)} deployed · L5` : "Layer 5 · track record",
    };
  }
  return { title: "Portfolio signal", value: "—", hint: "Layer 4 · 5" };
}
