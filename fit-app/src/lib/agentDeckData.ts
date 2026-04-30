import type { AgentId } from "./agentTypes";

export type AgentProfile = {
  id: AgentId;
  name: string;
  title: string;
  blurb: string;
  chips: readonly string[];
};

export const AGENT_DECK: AgentProfile[] = [
  {
    id: "share_desk",
    name: "Agent A",
    title: "Share desk",
    blurb: "Packages .fitshare envelopes — layers, expiry, relay. Same path as Export + fit-cli share.",
    chips: [
      "Prepare a share package for a new investor, give them my credit and asset layers only, valid for 30 days.",
      "Export layers 2,3 to my current recipient with live tracking off.",
    ],
  },
  {
    id: "delta_desk",
    name: "Agent B",
    title: "Delta desk",
    blurb: "Runs demo JSON-patch deltas (bounded presets) and pushes relay events when connected.",
    chips: ["Apply the CIBIL refresh demo patch.", "Record the new angel cheque demo on layer 5."],
  },
  {
    id: "audit_desk",
    name: "Agent C",
    title: "Audit desk",
    blurb: "Merkle/signature verify and delta chain narration — read-mostly, integrity first.",
    chips: ["Run verify on the open .fit and report.", "Summarize the last five deltas from context."],
  },
];
