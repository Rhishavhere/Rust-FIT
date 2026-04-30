import type { DemoAgentKey } from "./demoAgentMeta";

export type AgentId = "share_desk" | "delta_desk" | "audit_desk";

export type AgentAction =
  | {
      type: "create_share";
      recipient_x25519_pub_hex: string;
      layers_csv: string;
      expires_days: number;
      live_tracking: boolean;
      investor_display_name?: string;
    }
  | { type: "run_verify" }
  | { type: "apply_demo_delta"; demo_key: DemoAgentKey };

export type AgentTurnResult = {
  message: string;
  actions: AgentAction[];
};

const DEMO_KEYS = new Set<string>([
  "sellReliance",
  "openFd200k",
  "refreshCibil",
  "fileGstQ1",
  "newAngel",
]);

function isDemoKey(k: string): k is DemoAgentKey {
  return DEMO_KEYS.has(k);
}

export function parseAgentResponse(raw: string): AgentTurnResult | null {
  const trimmed = raw.trim();
  let json = trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) json = fence[1].trim();

  try {
    const j = JSON.parse(json) as Record<string, unknown>;
    if (typeof j.message !== "string") return null;
    const rawActions = Array.isArray(j.actions) ? j.actions : [];
    const actions: AgentAction[] = [];

    for (const item of rawActions) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      const type = a.type;
      if (type === "run_verify") {
        actions.push({ type: "run_verify" });
        continue;
      }
      if (type === "apply_demo_delta" && typeof a.demo_key === "string" && isDemoKey(a.demo_key)) {
        actions.push({ type: "apply_demo_delta", demo_key: a.demo_key });
        continue;
      }
      if (type === "create_share") {
        const recipient =
          typeof a.recipient_x25519_pub_hex === "string" ? a.recipient_x25519_pub_hex : "";
        const layers = typeof a.layers_csv === "string" ? a.layers_csv : "2,3";
        let expires = 30;
        if (typeof a.expires_days === "number" && Number.isFinite(a.expires_days)) {
          expires = Math.floor(a.expires_days);
        }
        const lt = Boolean(a.live_tracking);
        const name = typeof a.investor_display_name === "string" ? a.investor_display_name : undefined;
        actions.push({
          type: "create_share",
          recipient_x25519_pub_hex: recipient,
          layers_csv: layers,
          expires_days: expires,
          live_tracking: lt,
          investor_display_name: name,
        });
      }
    }

    return { message: j.message, actions };
  } catch {
    return null;
  }
}
