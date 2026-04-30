import nacl from "tweetnacl";
import { debugError, debugInfo, debugWarn } from "./debug";

let loggedUtf8Fallback = false;

function payloadKind(payload: unknown): string {
  if (payload === null) return "null";
  if (Array.isArray(payload)) return "array";
  return typeof payload;
}

function encodeUtf8(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }
  if (!loggedUtf8Fallback) {
    loggedUtf8Fallback = true;
    debugWarn("Crypto", "encodeUtf8:fallback", "TextEncoder unavailable, using URI fallback");
  }
  const encoded = unescape(encodeURIComponent(input));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    out[i] = encoded.charCodeAt(i);
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  let str = "";
  for (let i = 0; i < bytes.length; i += 1) {
    str += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(str));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) {
    debugError("Crypto", "fromHex:odd-length", { length: clean.length });
    throw new Error("hex length must be even");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}

export function generateSigningPair(): {
  secretHex: string;
  publicHex: string;
} {
  debugInfo("Crypto", "generateSigningPair:start");
  const pair = nacl.sign.keyPair();
  debugInfo("Crypto", "generateSigningPair:done", {
    publicHexLength: pair.publicKey.length * 2,
    secretHexLength: pair.secretKey.length * 2,
  });
  return {
    secretHex: toHex(pair.secretKey),
    publicHex: toHex(pair.publicKey),
  };
}

export function signPayload(payload: unknown, secretHex: string): string {
  debugInfo("Crypto", "signPayload:start", {
    payloadKind: payloadKind(payload),
    secretHexLength: secretHex.length,
  });
  const bytes = encodeUtf8(stableStringify(payload));
  const sig = nacl.sign.detached(bytes, fromHex(secretHex));
  debugInfo("Crypto", "signPayload:done", { bytesLength: bytes.length });
  return toHex(sig);
}

export function verifyPayload(
  payload: unknown,
  signatureHex: string,
  publicHex: string,
): boolean {
  debugInfo("Crypto", "verifyPayload:start", {
    payloadKind: payloadKind(payload),
    signatureLength: signatureHex.length,
    publicKeyLength: publicHex.length,
  });
  try {
    const ok = nacl.sign.detached.verify(
      encodeUtf8(stableStringify(payload)),
      fromHex(signatureHex),
      fromHex(publicHex),
    );
    debugInfo("Crypto", "verifyPayload:done", { ok });
    return ok;
  } catch {
    debugError("Crypto", "verifyPayload:error");
    return false;
  }
}

export function generateEncryptionPair(): { publicHex: string; secretHex: string } {
  const kp = nacl.box.keyPair();
  return {
    publicHex: toHex(kp.publicKey),
    secretHex: toHex(kp.secretKey),
  };
}

export function encryptForPeer(payload: unknown, mySecretHex: string, peerPublicHex: string): { ciphertext: string; nonce: string } {
  debugInfo("Crypto", "encryptForPeer:start");
  const mySecretKey = fromHex(mySecretHex);
  const peerPublicKey = fromHex(peerPublicHex);
  const nonce = nacl.randomBytes(24);
  const message = encodeUtf8(stableStringify(payload));
  const box = nacl.box(message, nonce, peerPublicKey, mySecretKey);
  debugInfo("Crypto", "encryptForPeer: SUCCESS | Locked to Bob's Public Key", { "Payload size": box.length + " bytes" });
  return {
    ciphertext: toHex(box),
    nonce: toHex(nonce),
  };
}

export function decryptFromPeer(ciphertextHex: string, nonceHex: string, mySecretHex: string, peerPublicHex: string): unknown | null {
  debugInfo("Crypto", "decryptFromPeer:start");
  try {
    const mySecretKey = fromHex(mySecretHex);
    const peerPublicKey = fromHex(peerPublicHex);
    const nonce = fromHex(nonceHex);
    const box = fromHex(ciphertextHex);
    const message = nacl.box.open(box, nonce, peerPublicKey, mySecretKey);
    if (!message) {
      debugError("Crypto", "decryptFromPeer: FAILED (Wrong Device/Key)");
      return null;
    }
    const decodedStr = decodeUtf8(message);
    const parsed = JSON.parse(decodedStr);
    debugInfo("Crypto", "decryptFromPeer: SUCCESS | Authenticated sender");
    return parsed;
  } catch (error) {
    debugError("Crypto", "decryptFromPeer: FAILED (Wrong Device/Key)", error instanceof Error ? error.message : String(error));
    return null;
  }
}
