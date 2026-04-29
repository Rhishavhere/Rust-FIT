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
import { formatInr } from "../lib/fmt";

const GREEN = "#22c55e";
const MUTED = "#64748b";

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
    { name: "Cash range (mid)", value: rng },
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

export function AssetDonut({ layer3 }: { layer3: unknown }) {
  const data = donutFromLayer3(layer3);
  if (!data?.length) {
    return (
      <div className="rounded-xl border border-fit-border bg-fit-card/60 p-4 text-fit-muted">
        Asset allocation unavailable for this persona / layer.
      </div>
    );
  }

  const colors = ["#22c55e", "#06b6d4", "#8b5cf6", "#eab308", "#f97316", "#94a3b8"];

  return (
    <div className="h-72 rounded-xl border border-fit-border bg-fit-card p-4">
      <h3 className="mb-2 text-sm font-medium text-slate-300">Asset allocation</h3>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={88}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatInr(v)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CreditTrendLine({ layer2 }: { layer2: unknown }) {
  const h = layer2 && typeof layer2 === "object" ? (layer2 as L2).cibil_score_history : undefined;
  const data =
    Array.isArray(h) && h.length
      ? h.map((x) => ({
          month: String(x.month ?? ""),
          score: typeof x.score === "number" ? x.score : 0,
        }))
      : [];

  if (!data.length) {
    return (
      <div className="h-64 rounded-xl border border-fit-border bg-fit-card/60 p-4 text-fit-muted">
        No CIBIL history in this FIT.
      </div>
    );
  }

  return (
    <div className="h-72 rounded-xl border border-fit-border bg-fit-card p-4">
      <h3 className="mb-2 text-sm font-medium text-slate-300">Credit score trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
          <XAxis dataKey="month" stroke={MUTED} tick={{ fill: "#8b929e", fontSize: 11 }} />
          <YAxis stroke={MUTED} domain={[600, "auto"]} tick={{ fill: "#8b929e", fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="score" stroke={GREEN} fill={GREEN} fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type L4 = {
  itr?: { fy?: string; income?: number }[];
};

export function IncomeBarChart({ layer4 }: { layer4: unknown }) {
  const itr = layer4 && typeof layer4 === "object" ? (layer4 as L4).itr : undefined;
  const data =
    Array.isArray(itr) && itr.length
      ? itr.map((x) => ({
          fy: String(x.fy ?? ""),
          income: typeof x.income === "number" ? x.income / 100000 : 0,
        }))
      : [];

  if (!data.length) {
    return (
      <div className="h-64 rounded-xl border border-fit-border bg-fit-card/60 p-4 text-fit-muted">
        No ITR series in this FIT.
      </div>
    );
  }

  return (
    <div className="h-72 rounded-xl border border-fit-border bg-fit-card p-4">
      <h3 className="mb-2 text-sm font-medium text-slate-300">ITR income (₹ Lakhs)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
          <XAxis dataKey="fy" stroke={MUTED} tick={{ fill: "#8b929e", fontSize: 11 }} />
          <YAxis stroke={MUTED} tick={{ fill: "#8b929e", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [`${v.toFixed(2)} L`, "Income"]} />
          <Bar dataKey="income" fill={GREEN} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PortfolioTable({ layer3 }: { layer3: unknown }) {
  const o = layer3 && typeof layer3 === "object" ? (layer3 as Record<string, unknown>) : null;
  const eq = o?.equity_portfolio as Record<string, unknown> | undefined;
  const holdings = eq?.holdings;
  const rows =
    Array.isArray(holdings) && holdings.length
      ? holdings.map((h) => {
          const x = h as Record<string, unknown>;
          return {
            name: String(x.name ?? ""),
            value: typeof x.value === "number" ? x.value : 0,
            weight: typeof x.weight_pct === "number" ? x.weight_pct : 0,
          };
        })
      : [];

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-fit-border bg-fit-card/60 p-4 text-fit-muted">
        No equity holdings in this layer.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-fit-border bg-fit-card">
      <div className="border-b border-fit-border px-4 py-3 text-sm font-medium text-slate-300">
        Portfolio holdings
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-fit-bg/80 text-fit-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Value</th>
            <th className="px-4 py-2 font-medium">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-fit-border hover:bg-fit-highlight/40">
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2 font-mono text-emerald-200/95">{formatInr(r.value)}</td>
              <td className="px-4 py-2 text-fit-muted">{r.weight}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LockedCard({
  layerId,
  title,
}: {
  layerId: number;
  title: string;
}) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-fit-border bg-fit-card/40 p-6 text-center">
      <span className="text-xs uppercase tracking-wide text-fit-muted">
        Layer {layerId}
      </span>
      <p className="mt-2 text-sm font-medium text-slate-400">{title}</p>
      <p className="mt-2 text-xs text-fit-muted">
        Not included in this share envelope.
      </p>
    </div>
  );
}
