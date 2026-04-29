/** Demo JSON Patch ops — RFC 6902 paths match persona `.fit` layer JSON (`priya`). */
export const DEMO_PATCHES = {
  /** Layer 3 — reduce Reliance slice; sync totals (approx. ₹1.4L exit). */
  sellReliance: JSON.stringify([
    { op: "replace", path: "/equity_portfolio/holdings/0/value", value: 140000 },
    { op: "replace", path: "/equity_portfolio/holdings/0/weight_pct", value: 20 },
    { op: "replace", path: "/equity_portfolio/total_value", value: 760000 },
    { op: "replace", path: "/total_assets", value: 9160000 },
    { op: "replace", path: "/net_worth", value: 8600000 },
  ]),
  /** Layer 3 — new FD ₹2L. */
  openFd200k: JSON.stringify([
    {
      op: "add",
      path: "/fixed_deposits/-",
      value: { bank: "HDFC Bank", amount: 200000, maturity: "2028-03-31" },
    },
    { op: "replace", path: "/total_assets", value: 9500000 },
    { op: "replace", path: "/net_worth", value: 8940000 },
  ]),
  /** Layer 2 — CIBIL uptick demo. */
  refreshCibil: JSON.stringify([
    { op: "replace", path: "/cibil_score", value: 762 },
    { op: "replace", path: "/cibil_score_history/11/score", value: 762 },
  ]),
  /** Layer 4 — file Q1 FY26 GST line. */
  fileGstQ1: JSON.stringify([
    {
      op: "add",
      path: "/business/gst_quarterly_turnover/-",
      value: { quarter: "Q1 FY26", turnover: 2950000 },
    },
  ]),
  /** Layer 5 — new angel cheque. */
  newAngel: JSON.stringify([
    {
      op: "add",
      path: "/investments/-",
      value: {
        startup: "GreenGrid Energy Pvt Ltd",
        stage: "Pre-Seed",
        amount: 1500000,
        date: "2026-04-15",
        sector: "CleanTech",
        current_status: "active",
      },
    },
    { op: "replace", path: "/investment_count", value: 3 },
    { op: "replace", path: "/total_deployed", value: 3500000 },
    { op: "add", path: "/sectors/-", value: "CleanTech" },
  ]),
} as const;
