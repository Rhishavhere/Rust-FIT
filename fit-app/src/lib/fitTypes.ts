/** Keys bundle written by `fit generate` / `fit keygen`. */
export type StoredKeys = {
  ed25519_signing_seed_hex: string;
  master_secret_hex?: string;
  x25519_static_secret_hex: string;
};

export type LayersMap = Record<string, unknown>;

export type InspectInfo = {
  fit_id_short: string;
  /** 32 hex chars — same key the relay uses (`PUSH_DELTA` / `SUBSCRIBE`). */
  fit_id_hex: string;
  display_name: string;
  fit_score: number;
  layer_count: number;
  delta_count: number;
  owner_pubkey_hex: string;
};

export type DeltaRow = {
  delta_id: number;
  summary: string;
  timestamp: number;
  layer_affected: number;
};

export type ShareMeta = {
  source_fit_id_short: string;
  source_fit_id_hex: string;
  permitted_layers: number[];
  expires_at: number;
  live_tracking: boolean;
};
