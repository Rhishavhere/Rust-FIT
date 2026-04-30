import type { FitTheme } from "./fitTheme";

export function getChartTheme(theme: FitTheme) {
  if (theme === "light") {
    return {
      grid: "#e2e8f0",
      axis: "#64748b",
      tick: "#64748b",
      tooltipBg: "#ffffff",
      tooltipBorder: "#dce0ea",
      pieStroke: "#f1f5f9",
      donutFills: ["#0f172a", "#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"],
      seriesPrimary: "#334155",
      seriesSecondary: "#64748b",
      barFill: "#334155",
    };
  }
  return {
    grid: "#3f3f46",
    axis: "#a1a1aa",
    tick: "#d4d4d8",
    tooltipBg: "#18181b",
    tooltipBorder: "#3f3f46",
    pieStroke: "#09090b",
    donutFills: ["#fafafa", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b"],
    seriesPrimary: "#e4e4e7",
    seriesSecondary: "#a1a1aa",
    barFill: "#e4e4e7",
  };
}
