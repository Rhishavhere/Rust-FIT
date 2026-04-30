import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { debugInfo, debugWarn } from "./debug";
import type { PersistedState } from "./types";

const APP_STATE_KEY = "fit_mobile_state_v1";
const KEY_SECRET_HEX = "fit_sign_secret_hex";
const KEY_PUBLIC_HEX = "fit_sign_public_hex";
const KEY_ENC_SECRET_HEX = "fit_enc_secret_hex";
const KEY_ENC_PUBLIC_HEX = "fit_enc_public_hex";
const KEY_PEER_ID = "fit_peer_id";

function suffix(profileId: string): string {
  return profileId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function appStateKey(profileId: string): string {
  return `${APP_STATE_KEY}_${suffix(profileId)}`;
}

function keySecretHex(profileId: string): string {
  return `${KEY_SECRET_HEX}_${suffix(profileId)}`;
}

function keyPublicHex(profileId: string): string {
  return `${KEY_PUBLIC_HEX}_${suffix(profileId)}`;
}

function keyPeerId(profileId: string): string {
  return `${KEY_PEER_ID}_${suffix(profileId)}`;
}

function keyEncSecretHex(profileId: string): string {
  return `${KEY_ENC_SECRET_HEX}_${suffix(profileId)}`;
}

function keyEncPublicHex(profileId: string): string {
  return `${KEY_ENC_PUBLIC_HEX}_${suffix(profileId)}`;
}

export async function saveState(profileId: string, state: PersistedState): Promise<void> {
  debugInfo("Storage", "saveState:start", {
    profileId,
    incoming: state.incoming.length,
    outgoing: state.outgoing.length,
    contacts: state.contacts.length,
    activity: state.activity.length,
  });
  await AsyncStorage.setItem(appStateKey(profileId), JSON.stringify(state));
  debugInfo("Storage", "saveState:done");
}

export async function loadState(profileId: string): Promise<PersistedState | null> {
  debugInfo("Storage", "loadState:start", { profileId });
  const raw = await AsyncStorage.getItem(appStateKey(profileId));
  if (!raw) {
    debugInfo("Storage", "loadState:empty", { profileId });
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    debugInfo("Storage", "loadState:done", {
      profileId,
      incoming: parsed.incoming?.length ?? 0,
      outgoing: parsed.outgoing?.length ?? 0,
      contacts: parsed.contacts?.length ?? 0,
      activity: parsed.activity?.length ?? 0,
    });
    return parsed;
  } catch (error) {
    debugWarn("Storage", "loadState:invalid-json", {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
    await AsyncStorage.removeItem(appStateKey(profileId));
    debugInfo("Storage", "loadState:invalid-json-cleared", { profileId });
    return null;
  }
}

export async function saveKeyBag(bag: {
  profileId: string;
  secretHex: string;
  publicHex: string;
  encSecretHex: string;
  encPublicHex: string;
  peerId: string;
}): Promise<void> {
  debugInfo("Storage", "saveKeyBag:start", {
    profileId: bag.profileId,
    peerId: bag.peerId,
  });
  await SecureStore.setItemAsync(keySecretHex(bag.profileId), bag.secretHex);
  await SecureStore.setItemAsync(keyPublicHex(bag.profileId), bag.publicHex);
  await SecureStore.setItemAsync(keyEncSecretHex(bag.profileId), bag.encSecretHex);
  await SecureStore.setItemAsync(keyEncPublicHex(bag.profileId), bag.encPublicHex);
  await SecureStore.setItemAsync(keyPeerId(bag.profileId), bag.peerId);
  debugInfo("Storage", "saveKeyBag:done");
}

export async function loadKeyBag(profileId: string): Promise<{
  profileId: string;
  secretHex: string;
  publicHex: string;
  encSecretHex: string;
  encPublicHex: string;
  peerId: string;
} | null> {
  debugInfo("Storage", "loadKeyBag:start", { profileId });
  const [secretHex, publicHex, encSecretHex, encPublicHex, peerId] = await Promise.all([
    SecureStore.getItemAsync(keySecretHex(profileId)),
    SecureStore.getItemAsync(keyPublicHex(profileId)),
    SecureStore.getItemAsync(keyEncSecretHex(profileId)),
    SecureStore.getItemAsync(keyEncPublicHex(profileId)),
    SecureStore.getItemAsync(keyPeerId(profileId)),
  ]);
  if (!secretHex || !publicHex || !encSecretHex || !encPublicHex || !peerId) {
    debugWarn("Storage", "loadKeyBag:missing", {
      profileId,
    });
    return null;
  }
  debugInfo("Storage", "loadKeyBag:done", { profileId, peerId });
  return { profileId, secretHex, publicHex, encSecretHex, encPublicHex, peerId };
}

export async function resetLocalData(profileId: string): Promise<void> {
  debugInfo("Storage", "resetLocalData:start", { profileId });
  await Promise.all([
    AsyncStorage.removeItem(appStateKey(profileId)),
    SecureStore.deleteItemAsync(keySecretHex(profileId)),
    SecureStore.deleteItemAsync(keyPublicHex(profileId)),
    SecureStore.deleteItemAsync(keyEncSecretHex(profileId)),
    SecureStore.deleteItemAsync(keyEncPublicHex(profileId)),
    SecureStore.deleteItemAsync(keyPeerId(profileId)),
  ]);
  debugInfo("Storage", "resetLocalData:done", { profileId });
}

const LOCAL_RELAY_KEY = "fit_local_relay_inbox";

export async function pushToLocalRelay(message: unknown): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RELAY_KEY);
    const inbox = raw ? JSON.parse(raw) : [];
    inbox.push(message);
    await AsyncStorage.setItem(LOCAL_RELAY_KEY, JSON.stringify(inbox));
    debugInfo("Storage", "pushToLocalRelay:done");
  } catch (e) {
    debugWarn("Storage", "pushToLocalRelay:failed", e);
  }
}

export async function pollLocalRelay(peerId: string): Promise<unknown[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RELAY_KEY);
    if (!raw) return [];
    const inbox = JSON.parse(raw) as any[];
    const myMessages = inbox.filter((m) => m.to_peer === peerId || m?.envelope?.payload?.to_peer === peerId);
    const otherMessages = inbox.filter((m) => m.to_peer !== peerId && m?.envelope?.payload?.to_peer !== peerId);
    if (myMessages.length > 0) {
      await AsyncStorage.setItem(LOCAL_RELAY_KEY, JSON.stringify(otherMessages));
      debugInfo("Storage", "pollLocalRelay:found", { count: myMessages.length });
    }
    return myMessages;
  } catch (e) {
    debugWarn("Storage", "pollLocalRelay:failed", e);
    return [];
  }
}
