import type { LayersMap } from "./types";
import { debugError, debugInfo, debugWarn } from "./debug";

export type QrPayload = {
  v: 1;
  peer_id: string;
  display_name: string;
  fit_score: number;
  pub_key: string;
  enc_pub_key: string; // Used for encrypting a .fitshare TO this user
  nonce: string;
  ts: number;
  exp: number;
};

export type FitShareBlob = {
  ciphertext: string;
  nonce: string;
};

export type SignedEnvelope<T> = {
  payload: T;
  sig: string;
};

export type DirectSharePayload = {
  request_id: string;
  from_peer: string;
  to_peer: string;
  display_name: string;
  fit_score: number;
  pub_key: string;
  enc_pub_key: string; // So Bob can decrypt and reply if he wants
  fitshare_blob: FitShareBlob; // The encrypted layers
  ts: number;
  exp: number; // Expiry timestamp
};

export type RevokePayload = {
  from_peer: string;
  to_peer: string;
  ts: number;
};

export type ProfileUpdatePayload = {
  from_peer: string;
  to_peer: string;
  patch: Array<{ op: "replace" | "add"; path: string; value: unknown }>;
  ts: number;
};

export type RelayMessage =
  | {
      type: "REGISTER";
      peer_id: string;
    }
  | {
      type: "DIRECT_SHARE";
      to_peer: string;
      envelope: SignedEnvelope<DirectSharePayload>;
    }
  | {
      type: "REVOKE_SHARE";
      to_peer: string;
      envelope: SignedEnvelope<RevokePayload>;
    }
  | {
      type: "PROFILE_UPDATE";
      to_peer: string;
      envelope: SignedEnvelope<ProfileUpdatePayload>;
    };

export function encodeQr(envelope: SignedEnvelope<QrPayload>): string {
  debugInfo("Protocol", "encodeQr:start", {
    peerId: envelope.payload.peer_id,
    exp: envelope.payload.exp,
  });
  return `FITQR1:${encodeURIComponent(JSON.stringify(envelope))}`;
}

export function decodeQr(raw: string): SignedEnvelope<QrPayload> {
  debugInfo("Protocol", "decodeQr:start", { rawLength: raw.length });
  if (!raw.startsWith("FITQR1:")) {
    debugWarn("Protocol", "decodeQr:bad-prefix");
    throw new Error("QR must start with FITQR1:");
  }
  const body = decodeURIComponent(raw.slice("FITQR1:".length));
  let parsed: SignedEnvelope<QrPayload>;
  try {
    parsed = JSON.parse(body) as SignedEnvelope<QrPayload>;
  } catch (error) {
    debugError("Protocol", "decodeQr:invalid-json", error instanceof Error ? error.message : error);
    throw new Error("QR payload is invalid JSON");
  }
  if (!parsed.payload || parsed.payload.v !== 1) {
    debugWarn("Protocol", "decodeQr:unsupported-version", {
      version: parsed?.payload?.v,
    });
    throw new Error("Unsupported QR token version");
  }
  debugInfo("Protocol", "decodeQr:done", {
    peerId: parsed.payload.peer_id,
    exp: parsed.payload.exp,
  });
  return parsed;
}
