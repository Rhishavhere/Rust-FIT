import { useMemo, useState, type ReactNode } from "react";

import { formatInr } from "../lib/fmt";

type Tab = "portfolio" | "loans" | "cap_table";

export function HeldDataTables({ layer2, layer3, layer5 }: { layer2: unknown; layer3: unknown; layer5: unknown }) {
  const [tab, setTab] = useState<Tab>("portfolio");

  const portfolioRows = useMemo(() => {
    const o = layer3 && typeof layer3 === "object" ? (layer3 as Record<string, unknown>) : null;
    const eq = o?.equity_portfolio as Record<string, unknown> | undefined;
    const holdings = eq?.holdings;
    return Array.isArray(holdings)
      ? holdings.map((h) => {
          const x = h as Record<string, unknown>;
          return {
            name: String(x.name ?? ""),
            col2: typeof x.value === "number" ? formatInr(x.value) : "—",
            col3: typeof x.weight_pct === "number" ? `${x.weight_pct}%` : "—",
          };
        })
      : [];
  }, [layer3]);

  const loansRows = useMemo(() => {
    const o = layer2 && typeof layer2 === "object" ? (layer2 as Record<string, unknown>) : null;
    const loans = o?.active_loans;
    return Array.isArray(loans)
      ? loans.map((r) => {
          const x = r as Record<string, unknown>;
          return {
            name: `${String(x.type ?? "")} · ${String(x.lender ?? "")}`,
            col2: typeof x.outstanding === "number" ? formatInr(x.outstanding as number) : "—",
            col3: String(x.months_remaining ?? x.status ?? "—"),
          };
        })
      : [];
  }, [layer2]);

  const capRows = useMemo(() => {
    const o = layer5 && typeof layer5 === "object" ? (layer5 as Record<string, unknown>) : null;
    const inv = o?.investments;
    return Array.isArray(inv)
      ? inv.map((r) => {
          const x = r as Record<string, unknown>;
          return {
            name: String(x.startup ?? ""),
            col2: typeof x.amount === "number" ? formatInr(x.amount as number) : "—",
            col3: `${String(x.stage ?? "")} · ${String(x.sector ?? "")}`,
          };
        })
      : [];
  }, [layer5]);

  const cols =
    tab === "portfolio"
      ? { h1: "Holding", h2: "Value", h3: "Weight" }
      : tab === "loans"
        ? { h1: "Loan", h2: "Outstanding", h3: "Horizon · status" }
        : { h1: "Company", h2: "Deployed", h3: "Stage · sector" };

  const rows = tab === "portfolio" ? portfolioRows : tab === "loans" ? loansRows : capRows;

  return (
    <div className="fit-card-glass overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-fit-border/80 px-4 py-3">
        <span className="text-sm font-medium text-slate-300">Portfolio & obligations</span>
        <TabBtn active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          Holdings
        </TabBtn>
        <TabBtn active={tab === "loans"} onClick={() => setTab("loans")}>
          Loan history
        </TabBtn>
        <TabBtn active={tab === "cap_table"} onClick={() => setTab("cap_table")}>
          Cap table entries
        </TabBtn>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-fit-muted">No rows for this persona in this slice.</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-fit-ink/50 text-fit-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{cols.h1}</th>
              <th className="px-4 py-3 font-medium">{cols.h2}</th>
              <th className="px-4 py-3 font-medium">{cols.h3}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.name}-${i}`}
                className="border-t border-fit-border/60 transition hover:bg-fit-highlight/35"
              >
                <td className="max-w-[200px] px-4 py-2.5 text-slate-200">{r.name}</td>
                <td className="px-4 py-2.5 font-mono text-sm text-fit-accent">{r.col2}</td>
                <td className="px-4 py-2.5 text-xs text-fit-muted">{r.col3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-fit-accent text-black shadow-neon"
          : "border border-fit-border bg-fit-ink/50 text-fit-muted hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
