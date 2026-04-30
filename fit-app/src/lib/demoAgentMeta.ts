export const DEMO_AGENT_META = {
  sellReliance: { layerId: 3, summary: "Sold slice of Reliance (demo)", attester: "owner" },
  openFd200k: { layerId: 3, summary: "Opened new FD ₹2L", attester: "bankaa" },
  refreshCibil: { layerId: 2, summary: "CIBIL refresh", attester: "cibil" },
  fileGstQ1: { layerId: 4, summary: "GST Q1 FY26", attester: "gstn" },
  newAngel: { layerId: 5, summary: "Angel ticket", attester: "owner" },
} as const;

export type DemoAgentKey = keyof typeof DEMO_AGENT_META;
