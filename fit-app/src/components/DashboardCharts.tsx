import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { formatInr } from "../lib/fmt";

export const CHART_GREEN = "#a3ff33";
const MUTED = "#5c6478";

type L2 = {
  cibil_score_history?: { month?: string; score?: number }[];
};

function donutFromLayer3(layer: unknown): { name: string; value: number }[] | null {
  if (!layer || typeof layer !== "object") return null;
  const o = layer as Record<string, unknown>;
  let re = 0;
  let eq = 0;
  let mf = 0;
  let gold = 0;
  let fd = 0;
  if (Array.isArray(o.real_estate)) {
    for (const x of o.real_estate) {
      const v = x as Record<string, unknown>;
      re += typeof v.estimated_value === "number" ? v.estimated_value : 0;
    }
  }
  const eqP = o.equity_portfolio as Record<string, unknown> | undefined;
  if (eqP && typeof eqP.total_value === "number") eq = eqP.total_value;
  const mfO = o.mutual_funds as Record<string, unknown> | undefined;
  if (mfO && typeof mfO.total_nav === "number") mf = mfO.total_nav;
  const g = o.gold as Record<string, unknown> | undefined;
  if (g && typeof g.value === "number") gold = g.value;
  if (Array.isArray(o.fixed_deposits)) {
    for (const fdv of o.fixed_deposits) {
      const v = fdv as Record<string, unknown>;
      fd += typeof v.amount === "number" ? v.amount : 0;
    }
  }
  const rng = typeof o.bank_balance_range === "string" ? parseBankMid(o.bank_balance_range) : 0;

  const parts = [
    { name: "Real estate", value: re },
    { name: "Equity", value: eq },
    { name: "Mutual funds", value: mf },
    { name: "Fixed deposits", value: fd },
    { name: "Gold", value: gold },
    { name: "Cash (mid)", value: rng },
  ].filter((p) => p.value > 0);
  return parts.length ? parts : null;
}

function parseBankMid(s: string): number {
  const m = s.match(/([\d.-]+).*?([\d.-]+)/);
  if (!m?.[1] || !m?.[2]) return 0;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return (a + b) / 2;
}

function nwFromL3(layer: unknown): number | null {
  if (!layer || typeof layer !== "object") return null;
  const nw = (layer as { net_worth?: number }).net_worth;
  return typeof nw === "number" ? nw : null;
}

export function AssetDonut({ layer3 }: { layer3: unknown }) {
  const data = donutFromLayer3(layer3);
  const nw = nwFromL3(layer3);
  const donutColors = ["#a3ff33", "#06b6d4", "#8b5cf6", "#eab308", "#f97316", "#64748b"];

  if (!data?.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl ring-neon-soft">
        Asset allocation unavailable.
      </div>
    );
  }

  return (
    <div className="fit-card-glass relative h-[320px] p-4 lg:h-[340px]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Sales overview · asset mix</h3>
          <p className="text-[11px] text-fit-accent">
            Center total ·{" "}
            <span className="font-bold tabular-nums text-white">{nw != null ? formatInr(nw) : "—"}</span>
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-fit-muted">Layer 3</span>
      </div>
      <ResponsiveContainer width="100%" height="88%">
        <PieChart>
          <Pie
            data={data}
            cx="38%"
            cy="52%"
            innerRadius={72}
            outerRadius={106}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            stroke="#1a1d28"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={donutColors[i % donutColors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatInr(v)} contentStyle={{ background: "#15171e", border: "1px solid #242833", borderRadius: 8 }} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ right: -4 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** CIBIL 12-month-style trend. */
export function CreditTrendLine({ layer2 }: { layer2: unknown }) {
  const h = layer2 && typeof layer2 === "object" ? (layer2 as L2).cibil_score_history : undefined;
  const chartData =
    Array.isArray(h) && h.length
      ? h.map((x) => ({
          t: String(x.month ?? "").slice(2),
          score: typeof x.score === "number" ? x.score : 0,
        }))
      : [];

  if (!chartData.length) return null;

  return (
    <ChartCard title="CIBIL trajectory" subtitle="12-month window · Layer 2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="cibilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" />
          <XAxis dataKey="t" stroke={MUTED} tick={{ fill: "#7b8494", fontSize: 11 }} axisLine={{ stroke: "#2a3038" }} />
          <YAxis stroke={MUTED} domain={[600, "auto"]} tick={{ fill: "#7b8494", fontSize: 11 }} axisLine={{ stroke: "#2a3038" }} />
          <Tooltip
            formatter={(v: number) => [v, "score"]}
            contentStyle={{ background: "#15171e", border: "1px solid #242833", borderRadius: 8 }}
          />
          <Area type="monotone" dataKey="score" stroke={CHART_GREEN} strokeWidth={2} fill="url(#cibilGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Monthly trading notion (Priya-lite / Arjun-heavy). */
export function TradingVolumeChart({ layer5 }: { layer5: unknown }) {
  const o = layer5 && typeof layer5 === "object" ? (layer5 as Record<string, unknown>) : null;
  const tv = o?.trading_volume_monthly;
  const chartData = Array.isArray(tv)
    ? tv
        .map((x) => {
          const e = x as Record<string, unknown>;
          return {
            t: String(e.month ?? "").slice(2),
            vol_lakh: typeof e.volume === "number" ? e.volume / 100000 : 0,
          };
        })
        .filter((d) => d.t)
    : [];

  if (!chartData.length || chartData.every((d) => d.vol_lakh === 0)) return null;

  return (
    <ChartCard title="Trading pulse" subtitle="Rough monthly turnover (₹ Lakh) · Layer 5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="tvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" />
          <XAxis dataKey="t" stroke={MUTED} tick={{ fill: "#7b8494", fontSize: 11 }} />
          <YAxis stroke={MUTED} tick={{ fill: "#7b8494", fontSize: 11 }} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(2)} L`, "Turnover"]}
            contentStyle={{ background: "#15171e", border: "1px solid #242833", borderRadius: 8 }}
          />
          <Area type="monotone" dataKey="vol_lakh" stroke="#22d3ee" strokeWidth={2} fill="url(#tvGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type L4 = { itr?: { fy?: string; income?: number }[] };

/** Shown beside donut when vertical space allows — ITR ₹ Lakh bars. */
export function IncomeBarChart({ layer4 }: { layer4: unknown }) {
  const itr = layer4 && typeof layer4 === "object" ? (layer4 as L4).itr : undefined;
  const data =
    Array.isArray(itr) && itr.length
      ? itr.map((x) => ({
          fy: String(x.fy ?? ""),
          income: typeof x.income === "number" ? x.income / 100000 : 0,
        }))
      : [];

  if (!data.length) return null;

  return (
    <ChartCard title="ITR runway" subtitle="Income · ₹ Lakhs · Layer 4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3038" vertical={false} />
          <XAxis dataKey="fy" stroke={MUTED} tick={{ fill: "#7b8494", fontSize: 10 }} />
          <YAxis stroke={MUTED} tick={{ fill: "#7b8494", fontSize: 10 }} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)} L`, "Income"]}
            contentStyle={{ background: "#15171e", border: "1px solid #242833", borderRadius: 8 }}
          />
          <Bar dataKey="income" fill={CHART_GREEN} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="fit-card-glass relative flex flex-col pt-4" style={{ minHeight: 280 }}>
      <div className="px-4 pb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-[10px] text-fit-muted">{subtitle}</p>
      </div>
      <div className="flex-1 min-h-[220px] px-2 pb-2">{children}</div>
    </div>
  );
}

export function MiniStatTiles({
  invCount,
  avgTicketFormatted,
  cibilDelta,
}: {
  invCount: string;
  avgTicketFormatted: string;
  cibilDelta: string;
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col gap-4">
      {/* <div className="fit-card-glass flex flex-1 flex-col justify-center px-5 ring-neon-soft">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fit-muted">
          Investments made
        </span>
        <p className="mt-3 text-2xl font-bold tabular-nums text-white">{invCount}</p>
      </div> */}
      <div className="fit-card-glass flex flex-1 flex-col justify-center px-5 py-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fit-muted">
          Avg ticket
        </span>
        <p className="mt-3 font-mono text-xl font-semibold text-fit-accent">{avgTicketFormatted}</p>
      </div>
      <div className="fit-card-glass flex flex-1 flex-col justify-center px-5 py-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fit-muted">
          Credit score shift
        </span>
        <p className="mt-3 text-2xl font-bold tabular-nums text-fit-accent">{cibilDelta}</p>
      </div>
    </div>
  );
}

export function LockedCard({ layerId, title }: { layerId: number; title: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-fit-border/80 bg-fit-ink/40 p-6 text-center">
      <span className="rounded-full bg-fit-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fit-muted">
        Layer {layerId}
      </span>
      <p className="mt-3 text-lg font-medium text-slate-400">{title}</p>
      <p className="mt-2 max-w-xs text-xs text-fit-muted">Not included in this share envelope.</p>
    </div>
  );
}
