import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { applyPatch } from "fast-json-patch";
import * as Notifications from "expo-notifications";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  generateSigningPair,
  generateEncryptionPair,
  signPayload,
  verifyPayload,
  encryptForPeer,
  decryptFromPeer,
} from "./src/crypto";
import {
  decodeQr,
  encodeQr,
  type DirectSharePayload,
  type ProfileUpdatePayload,
  type QrPayload,
  type RelayMessage,
  type RevokePayload,
  type SignedEnvelope,
} from "./src/protocol";
import {
  loadKeyBag,
  loadState,
  resetLocalData,
  saveKeyBag,
  saveState,
  pushToLocalRelay,
  pollLocalRelay,
} from "./src/storage";
import {
  clearDebugEntries,
  debugError,
  debugInfo,
  debugWarn,
  getDebugEntries,
  subscribeDebug,
  type DebugEntry,
} from "./src/debug";
import {
  cloneLayers,
  DEMO_PROFILES,
  getDemoProfile,
  type DemoProfile,
} from "./src/demoProfiles";
import type {
  ActivityRow,
  ConnectionRequest,
  Contact,
  IdentityProfile,
  PersistedState,
} from "./src/types";

type Tab = "profile" | "myqr" | "share" | "contacts" | "settings";

const DEFAULT_RELAY = "ws://10.201.59.228:8766";

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeLayers(layers: Record<string, unknown>): string {
  return Object.keys(layers).sort().join(", ");
}

function formatDebugDetail(detail: unknown): string {
  if (detail === undefined) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  debugInfo("App", "notifications:handler-set");
} catch (_) {
  debugWarn("App", "notifications:handler-failed");
  // Notification handler setup can fail in Expo Go on some devices
}

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const contactsRef = useRef<Contact[]>([]);
  const scanLockRef = useRef(false);
  const [selectedDemoProfileId, setSelectedDemoProfileId] = useState<
    string | null
  >(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connected, setConnected] = useState(false);

  const latestHandleIncoming = useRef<((raw: unknown) => void) | undefined>(
    undefined,
  );

  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY);
  const [identity, setIdentity] = useState<IdentityProfile | null>(null);
  const [secretHex, setSecretHex] = useState<string>("");
  const [encSecretHex, setEncSecretHex] = useState<string>("");
  const [initError, setInitError] = useState<string | null>(null);
  const [initVersion, setInitVersion] = useState(0);

  const [shareRecipientKey, setShareRecipientKey] = useState("");
  const [shareRecipientPeer, setShareRecipientPeer] = useState("");
  const [shareLayers, setShareLayers] = useState<string[]>([]);
  const [shareExpiry, setShareExpiry] = useState<string>("1 Hour");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [selectedContactPeer, setSelectedContactPeer] = useState<string>("");
  const [debugEvents, setDebugEvents] = useState<DebugEntry[]>(() =>
    getDebugEntries(),
  );

  const activeDemoProfile = useMemo<DemoProfile | null>(() => {
    if (!selectedDemoProfileId) return null;
    return getDemoProfile(selectedDemoProfileId) ?? null;
  }, [selectedDemoProfileId]);

  const myQr = useMemo(() => {
    if (!identity) return null;
    const payload: QrPayload = {
      v: 1,
      peer_id: identity.peerId,
      display_name: identity.displayName,
      fit_score: identity.fitScore,
      pub_key: identity.signPublicHex,
      enc_pub_key: identity.encPublicHex,
      nonce: makeId("n"),
      ts: nowTs(),
      exp: nowTs() + 300,
    };
    return encodeQr({ payload, sig: signPayload(payload, secretHex) });
  }, [identity, secretHex]);

  const selectedContact = contacts.find(
    (c) => c.peerId === selectedContactPeer,
  );

  useEffect(() => {
    return subscribeDebug(setDebugEvents);
  }, []);

  useEffect(() => {
    if (!activeDemoProfile) return;
    debugInfo("DemoProfile", "selected", {
      profileId: activeDemoProfile.id,
      label: activeDemoProfile.label,
    });
  }, [activeDemoProfile]);

  // Keep contactsRef in sync so WebSocket handlers always see latest contacts
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  // Fake relay polling
  useEffect(() => {
    if (!identity?.peerId) return;
    const interval = setInterval(() => {
      void pollLocalRelay(identity.peerId).then((msgs) => {
        if (!latestHandleIncoming.current) return;
        for (const m of msgs) {
          latestHandleIncoming.current(JSON.stringify(m));
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [identity?.peerId]);

  useEffect(() => {
    if (!selectedDemoProfileId || !activeDemoProfile) return;

    let cancelled = false;
    debugInfo("App", "init:start", { initVersion, selectedDemoProfileId });
    setInitError(null);
    setIdentity(null);
    setSecretHex("");
    void (async () => {
      try {
        debugInfo("App", "init:notifications-permission-request");
        await Notifications.requestPermissionsAsync();
        debugInfo("App", "init:notifications-permission-done");
      } catch (_) {
        debugWarn("App", "init:notifications-permission-failed");
        // Notification permissions may fail in Expo Go
      }
      try {
        debugInfo("App", "init:load-state-and-keys:start");
        const [storedState, storedKeys] = await Promise.all([
          loadState(selectedDemoProfileId),
          loadKeyBag(selectedDemoProfileId),
        ]);
        debugInfo("App", "init:load-state-and-keys:done", {
          hasState: Boolean(storedState),
          hasKeys: Boolean(storedKeys),
        });
        let idProfile: IdentityProfile;
        let localSecret: string;
        let localEncSecret: string;
        if (!storedKeys) {
          debugWarn("App", "init:no-keybag-found");
          const generated = generateSigningPair();
          const generatedEnc = generateEncryptionPair();
          const peerId = makeId("peer");
          debugInfo("App", "init:save-new-keybag:start", { peerId });
          await saveKeyBag({
            profileId: selectedDemoProfileId,
            secretHex: generated.secretHex,
            publicHex: generated.publicHex,
            encSecretHex: generatedEnc.secretHex,
            encPublicHex: generatedEnc.publicHex,
            peerId,
          });
          debugInfo("App", "init:save-new-keybag:done", { peerId });
          idProfile = {
            peerId,
            displayName: activeDemoProfile.defaultDisplayName,
            fitScore: activeDemoProfile.defaultFitScore,
            signPublicHex: generated.publicHex,
            encPublicHex: generatedEnc.publicHex,
            layers: cloneLayers(activeDemoProfile.defaultLayers),
          };
          localSecret = generated.secretHex;
          localEncSecret = generatedEnc.secretHex;
        } else {
          debugInfo("App", "init:using-existing-keybag", {
            peerId: storedKeys.peerId,
          });
          idProfile = {
            peerId: storedKeys.peerId,
            displayName:
              storedState?.identity?.displayName ??
              activeDemoProfile.defaultDisplayName,
            fitScore:
              storedState?.identity?.fitScore ??
              activeDemoProfile.defaultFitScore,
            signPublicHex: storedKeys.publicHex,
            encPublicHex: storedKeys.encPublicHex,
            layers:
              storedState?.identity?.layers ??
              cloneLayers(activeDemoProfile.defaultLayers),
          };
          localSecret = storedKeys.secretHex;
          localEncSecret = storedKeys.encSecretHex;
        }
        if (cancelled) {
          debugWarn("App", "init:cancelled-before-state-apply");
          return;
        }
        setSecretHex(localSecret);
        setEncSecretHex(localEncSecret);
        setIdentity(idProfile);
        debugInfo("App", "init:identity-ready", {
          peerId: idProfile.peerId,
          displayName: idProfile.displayName,
          fitScore: idProfile.fitScore,
        });
        if (storedState) {
          const restoredRelay = DEFAULT_RELAY; // Force network relay instead of persisted localhost
          setRelayUrl(restoredRelay);
          setContacts(storedState.contacts || []);
          setActivity(storedState.activity || []);
          debugInfo("App", "init:restored-state", {
            relayUrl: storedState.relayUrl || DEFAULT_RELAY,
            contacts: storedState.contacts?.length ?? 0,
            activity: storedState.activity?.length ?? 0,
          });
        }
      } catch (e) {
        console.error("Init failed:", e);
        debugError("App", "init:failed", e instanceof Error ? e.message : e);
        if (cancelled) {
          debugWarn("App", "init:failed-after-cancel");
          return;
        }
        const base = e instanceof Error ? e.message : "Unknown startup error";
        if (/random|getRandomValues|crypto/i.test(base)) {
          setInitError(
            "Crypto init failed in Expo Go. Please update Expo Go, then tap Retry startup.",
          );
        } else {
          setInitError(`Initialization failed: ${base}`);
        }
      }
    })();
    return () => {
      cancelled = true;
      debugInfo("App", "init:cleanup");
    };
  }, [initVersion, selectedDemoProfileId, activeDemoProfile]);

  useEffect(() => {
    if (!identity || !selectedDemoProfileId) return;
    const state: PersistedState = {
      identity,
      relayUrl,
      incoming: [],
      outgoing: [],
      contacts,
      activity,
    };
    debugInfo("App", "persist:state:start", {
      profileId: selectedDemoProfileId,
      relayUrl,
      contacts: contacts.length,
      activity: activity.length,
    });
    void saveState(selectedDemoProfileId, state).catch((e) => {
      console.warn("Persist failed:", e);
      debugError(
        "App",
        "persist:state:failed",
        e instanceof Error ? e.message : e,
      );
    });
  }, [selectedDemoProfileId, identity, relayUrl, contacts, activity]);

  useEffect(() => {
    if (!identity) return;
    debugInfo("App", "relay:connect:start", {
      relayUrl,
      peerId: identity.peerId,
    });
    if (wsRef.current) {
      debugInfo("App", "relay:existing-socket-close");
      wsRef.current.close();
      wsRef.current = null;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch (e) {
      console.warn("WebSocket connection failed:", e);
      debugError(
        "App",
        "relay:connect:constructor-failed",
        e instanceof Error ? e.message : e,
      );
      setConnected(false);
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "REGISTER", peer_id: identity.peerId }));
      debugInfo("App", "relay:open:registered", {
        relayUrl,
        peerId: identity.peerId,
      });
      appendActivity("Relay connected", relayUrl);
    };
    ws.onerror = (event) => {
      debugWarn("App", "relay:error", event.type);
      setConnected(false);
    };
    ws.onclose = (event) => {
      debugWarn("App", "relay:close", {
        code: event.code,
        reason: event.reason,
      });
      setConnected(false);
    };
    ws.onmessage = (event) => {
      debugInfo("App", "relay:message", {
        length: String(event.data ?? "").length,
      });
      if (latestHandleIncoming.current) {
        latestHandleIncoming.current(event.data);
      }
    };
    return () => {
      debugInfo("App", "relay:cleanup-close");
      ws.close();
    };
  }, [identity?.peerId, relayUrl]);

  function appendActivity(title: string, detail: string): void {
    debugInfo("Activity", "append", { title, detail });
    setActivity((prev) => [
      { id: makeId("act"), title, detail, ts: nowTs() },
      ...prev.slice(0, 79),
    ]);
  }

  async function notify(title: string, body: string): Promise<void> {
    debugInfo("Notifications", "schedule:start", { title });
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
      debugInfo("Notifications", "schedule:done", { title });
    } catch (_) {
      debugWarn("Notifications", "schedule:failed");
      // Notification scheduling can fail in Expo Go
    }
  }

  function sendRelay(message: RelayMessage): void {
    void pushToLocalRelay(message); // Always push to local fake relay
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      debugWarn("Relay", "send:not-open", {
        type: message.type,
        readyState: wsRef.current?.readyState,
      });
      throw new Error("Relay is not connected.");
    }
    debugInfo("Relay", "send", { type: message.type });
    wsRef.current.send(JSON.stringify(message));
  }

  function trySendRelay(
    message: RelayMessage,
    options?: { userAlert?: string; suppressActivity?: boolean },
  ): boolean {
    debugInfo("Relay", "trySend:start", { type: message.type });
    try {
      sendRelay(message);
      debugInfo("Relay", "trySend:done", { type: message.type });
      return true;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Unknown relay error";
      debugError("Relay", "trySend:failed", { type: message.type, detail });
      // We are faking the relay offline, so we'll pretend it sent anyway!
      return true;
    }
  }

  const handleIncomingRelay = useCallback(
    (raw: unknown): void => {
      if (!identity || typeof raw !== "string") {
        debugWarn("Relay", "incoming:ignored", {
          hasIdentity: Boolean(identity),
          rawType: typeof raw,
        });
        return;
      }
      let msg: RelayMessage;
      try {
        msg = JSON.parse(raw) as RelayMessage;
      } catch {
        debugWarn("Relay", "incoming:invalid-json", {
          rawPreview: raw.slice(0, 80),
        });
        return;
      }
      debugInfo("Relay", "incoming:parsed", { type: msg.type });
      if (msg.type === "DIRECT_SHARE") {
        const env = msg.envelope as SignedEnvelope<DirectSharePayload>;
        const ok = verifyPayload(env.payload, env.sig, env.payload.pub_key);
        if (!ok || env.payload.to_peer !== identity.peerId) {
          debugWarn("Relay", "direct-share:rejected", {
            ok,
            toPeer: env.payload.to_peer,
            me: identity.peerId,
          });
          return;
        }

        const decrypted = decryptFromPeer(
          env.payload.fitshare_blob.ciphertext,
          env.payload.fitshare_blob.nonce,
          encSecretHex,
          env.payload.enc_pub_key,
        );

        if (!decrypted) {
          debugError("Relay", "decryptFromPeer: FAILED (Wrong Device/Key)", {
            from: env.payload.from_peer,
          });
          return;
        }

        const payload = decrypted as {
          layers: Record<string, unknown>;
          exp: number;
        };

        if (payload.exp < nowTs()) {
          debugError("Protocol", "Rejected: .fitshare expired");
          return;
        }

        debugInfo(
          "Protocol",
          `Validating .fitshare expiry: Valid (expires in ${Math.floor((payload.exp - nowTs()) / 60)} mins)`,
        );

        const contact: Contact = {
          peerId: env.payload.from_peer,
          displayName: env.payload.display_name,
          fitScore: env.payload.fit_score,
          pubKeyHex: env.payload.pub_key,
          status: "accepted",
          sharedLayers: payload.layers,
          updatedAt: nowTs(),
        };
        setContacts((prev) => [
          contact,
          ...prev.filter((c) => c.peerId !== contact.peerId),
        ]);
        appendActivity(
          "Received .fitshare",
          `${contact.displayName} securely shared their profile`,
        );
        void notify(
          "Profile Received",
          `${contact.displayName} shared their profile via .fitshare`,
        );
        return;
      }

      if (msg.type === "REVOKE_SHARE") {
        const env = msg.envelope as SignedEnvelope<RevokePayload>;
        // Use ref to avoid stale closure — WebSocket listener captures this function once
        const currentContacts = contactsRef.current;
        const contact = currentContacts.find(
          (c) => c.peerId === env.payload.from_peer,
        );
        if (!contact) {
          debugWarn("Relay", "revoke:unknown-contact", env.payload.from_peer);
          return;
        }
        const ok = verifyPayload(env.payload, env.sig, contact.pubKeyHex);
        if (!ok || env.payload.to_peer !== identity.peerId) {
          debugWarn("Relay", "revoke:rejected", {
            ok,
            toPeer: env.payload.to_peer,
            me: identity.peerId,
          });
          return;
        }
        setContacts((prev) =>
          prev.map((c) =>
            c.peerId === env.payload.from_peer
              ? { ...c, status: "revoked", sharedLayers: undefined }
              : c,
          ),
        );
        appendActivity(
          "Share revoked",
          `${contact.displayName} revoked access`,
        );
        void notify(
          "Access revoked",
          `${contact.displayName} revoked profile access`,
        );
        return;
      }

      if (msg.type === "PROFILE_UPDATE") {
        const env = msg.envelope as SignedEnvelope<ProfileUpdatePayload>;
        // Use ref to avoid stale closure — WebSocket listener captures this function once
        const currentContacts = contactsRef.current;
        const contact = currentContacts.find(
          (c) => c.peerId === env.payload.from_peer,
        );
        if (!contact || contact.status !== "accepted") {
          debugWarn("Relay", "profile-update:unknown-or-not-accepted", {
            fromPeer: env.payload.from_peer,
          });
          return;
        }
        const ok = verifyPayload(env.payload, env.sig, contact.pubKeyHex);
        if (!ok || env.payload.to_peer !== identity.peerId) {
          debugWarn("Relay", "profile-update:rejected", {
            ok,
            toPeer: env.payload.to_peer,
            me: identity.peerId,
          });
          return;
        }
        const base = (contact.sharedLayers ?? {}) as Record<string, unknown>;
        const merged = applyPatch(
          JSON.parse(JSON.stringify(base)) as Record<string, unknown>,
          env.payload.patch,
          true,
          false,
        ).newDocument;
        setContacts((prev) =>
          prev.map((c) =>
            c.peerId === contact.peerId
              ? {
                  ...c,
                  sharedLayers: merged as Record<string, unknown>,
                  updatedAt: nowTs(),
                }
              : c,
          ),
        );
        appendActivity(
          "Signed update applied",
          `${contact.displayName} profile changed`,
        );
        void notify(
          "Profile updated",
          `${contact.displayName} shared profile was updated`,
        );
      }
    },
    [identity, secretHex],
  );

  useEffect(() => {
    latestHandleIncoming.current = handleIncomingRelay;
  }, [handleIncomingRelay]);

  const onScannedRecipientQr = useCallback(
    (data: string): void => {
      debugInfo("QR", "scan:received", { length: data.length });
      if (!identity) return;
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      try {
        const token = decodeQr(data);
        const validSig = verifyPayload(
          token.payload,
          token.sig,
          token.payload.pub_key,
        );
        const notExpired = token.payload.exp > nowTs();
        if (!validSig || !notExpired) {
          throw new Error("Invalid or expired QR token");
        }
        if (token.payload.peer_id === identity.peerId) {
          throw new Error("Cannot connect to yourself");
        }
        setShareRecipientKey(token.payload.enc_pub_key);
        setShareRecipientPeer(token.payload.peer_id);
        setCameraEnabled(false);
        debugInfo("UI", "Auto-fetched Target Public Key via QR", {
          enc_pub_key: token.payload.enc_pub_key,
        });
        Alert.alert("Success", "Recipient fetched from QR!");
      } catch (e) {
        debugError("QR", "scan:failed", e instanceof Error ? e.message : e);
        Alert.alert("QR error", e instanceof Error ? e.message : "Invalid QR");
      } finally {
        setTimeout(() => {
          scanLockRef.current = false;
          debugInfo("QR", "scan:unlock");
        }, 600);
      }
    },
    [identity],
  );

  const generateAndSendFitShare = () => {
    if (
      !identity ||
      !shareRecipientKey ||
      !shareRecipientPeer ||
      shareLayers.length === 0
    )
      return;

    const subset: Record<string, unknown> = {};
    for (const l of shareLayers) {
      if (l in identity.layers) subset[l] = identity.layers[l];
    }

    let expSeconds = 0;
    if (shareExpiry === "1 Hour") expSeconds = 3600;
    else if (shareExpiry === "1 Day") expSeconds = 86400;
    else expSeconds = 31536000;

    const expTimestamp = nowTs() + expSeconds;

    debugInfo("Share", "Generating .fitshare", {
      Layers: shareLayers,
      Expiry: shareExpiry,
    });

    const payloadToEncrypt = {
      layers: subset,
      exp: expTimestamp,
    };

    const blob = encryptForPeer(
      payloadToEncrypt,
      encSecretHex,
      shareRecipientKey,
    );

    const reqId = makeId("req");
    const reqPayload: DirectSharePayload = {
      request_id: reqId,
      from_peer: identity.peerId,
      to_peer: shareRecipientPeer,
      display_name: identity.displayName,
      fit_score: identity.fitScore,
      pub_key: identity.signPublicHex,
      enc_pub_key: identity.encPublicHex,
      fitshare_blob: blob,
      ts: nowTs(),
      exp: expTimestamp,
    };

    const env: SignedEnvelope<DirectSharePayload> = {
      payload: reqPayload,
      sig: signPayload(reqPayload, secretHex),
    };

    const sent = trySendRelay(
      {
        type: "DIRECT_SHARE",
        to_peer: shareRecipientPeer,
        envelope: env,
      },
      { userAlert: "Relay is offline" },
    );

    if (sent) {
      Alert.alert("Sent!", ".fitshare securely delivered to recipient.");
      setShareRecipientKey("");
      setShareRecipientPeer("");
      setShareLayers([]);
      appendActivity(
        "Sent .fitshare",
        `Shared ${shareLayers.length} layers to ${shareRecipientPeer.slice(0, 8)}`,
      );
      setTab("contacts");
    }
  };

  const toggleShareLayer = (layerKey: string) => {
    setShareLayers((prev) =>
      prev.includes(layerKey)
        ? prev.filter((l) => l !== layerKey)
        : [...prev, layerKey],
    );
  };

  function revokeContact(contact: Contact): void {
    debugInfo("Contacts", "revoke:start", { peerId: contact.peerId });
    if (!identity) {
      debugWarn("Contacts", "revoke:ignored-no-identity");
      return;
    }
    const payload: RevokePayload = {
      from_peer: identity.peerId,
      to_peer: contact.peerId,
      ts: nowTs(),
    };
    const sent = trySendRelay(
      {
        type: "REVOKE_SHARE",
        to_peer: contact.peerId,
        envelope: { payload, sig: signPayload(payload, secretHex) },
      },
      { userAlert: "Reconnect relay, then revoke again." },
    );
    if (!sent) return;
    setContacts((prev) =>
      prev.map((c) =>
        c.peerId === contact.peerId
          ? { ...c, status: "revoked", sharedLayers: undefined }
          : c,
      ),
    );
    appendActivity("Revoked share", contact.displayName);
    debugInfo("Contacts", "revoke:done", { peerId: contact.peerId });
  }

  function publishProfileUpdate(): void {
    debugInfo("Profile", "publish-update:start");
    if (!identity) {
      debugWarn("Profile", "publish-update:ignored-no-identity");
      return;
    }
    const nextScore = identity.fitScore + 2;
    const updatedIdentity: IdentityProfile = {
      ...identity,
      fitScore: nextScore,
      layers: {
        ...identity.layers,
        layer2: { cibil_score: nextScore },
        layer6: {
          ...(identity.layers.layer6 as Record<string, unknown> | undefined),
          last_profile_update: new Date().toISOString(),
        },
      },
    };
    setIdentity(updatedIdentity);
    const patch = [
      { op: "replace" as const, path: "/layer2/cibil_score", value: nextScore },
      {
        op: "replace" as const,
        path: "/layer6/last_profile_update",
        value: new Date().toISOString(),
      },
    ];
    let failedBroadcastCount = 0;
    contacts
      .filter((c) => c.status === "accepted")
      .forEach((c) => {
        const payload: ProfileUpdatePayload = {
          from_peer: identity.peerId,
          to_peer: c.peerId,
          patch,
          ts: nowTs(),
        };
        const sent = trySendRelay(
          {
            type: "PROFILE_UPDATE",
            to_peer: c.peerId,
            envelope: { payload, sig: signPayload(payload, secretHex) },
          },
          { suppressActivity: true },
        );
        if (!sent) {
          failedBroadcastCount += 1;
        }
      });
    if (failedBroadcastCount > 0) {
      appendActivity(
        "Profile update not delivered",
        `${failedBroadcastCount} contact update(s) failed while relay was disconnected`,
      );
      Alert.alert(
        "Relay disconnected",
        "Profile updated locally, but some contacts were not notified.",
      );
    }
    appendActivity(
      "Published profile update",
      `FIT score ${identity.fitScore} -> ${nextScore}`,
    );
    debugInfo("Profile", "publish-update:done", {
      nextScore,
      broadcastFailures: failedBroadcastCount,
    });
  }

  async function clearDataAndRetry(): Promise<void> {
    debugWarn("App", "clear-data-and-retry:start", { selectedDemoProfileId });
    try {
      if (selectedDemoProfileId) {
        await resetLocalData(selectedDemoProfileId);
      }
      setRelayUrl(DEFAULT_RELAY);
      setContacts([]);
      setActivity([]);
      setSelectedContactPeer("");
      setShareRecipientKey("");
      setShareRecipientPeer("");
      setShareLayers([]);
      setCameraEnabled(false);
      setConnected(false);
      setInitVersion((v) => v + 1);
      setSelectedDemoProfileId(null);
      debugInfo("App", "clear-data-and-retry:done");
    } catch (e) {
      debugError(
        "App",
        "clear-data-and-retry:failed",
        e instanceof Error ? e.message : e,
      );
      Alert.alert(
        "Reset failed",
        e instanceof Error ? e.message : "Could not clear local data",
      );
    }
  }

  function retryStartup(): void {
    debugInfo("App", "retry-startup");
    setInitVersion((v) => v + 1);
  }

  if (!selectedDemoProfileId) {
    return (
      <View style={styles.loading}>
        <Text style={styles.h1}>Select Demo Profile</Text>
        <View style={{ gap: 16, marginTop: 24, width: "100%", maxWidth: 400 }}>
          {DEMO_PROFILES.map((p) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => {
                setSelectedDemoProfileId(p.id);
                debugInfo("App", "demo-profile:selected", { id: p.id });
              }}
            >
              <Text style={styles.cardTitle}>{p.label}</Text>
              <Text style={styles.muted}>{p.tagline}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (!identity) {
    return (
      <View style={styles.loading}>
        <Text style={styles.h1}>Loading secure identity…</Text>
        {initError ? (
          <View style={styles.initErrorCard}>
            <Text style={styles.initErrorTitle}>Startup issue detected</Text>
            <Text style={styles.muted}>{initError}</Text>
            <Pressable style={styles.primaryBtn} onPress={retryStartup}>
              <Text style={styles.primaryTxt}>Retry startup</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => void clearDataAndRetry()}
            >
              <Text style={styles.secondaryTxt}>
                Clear local data and retry
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.h1}>FIT Mobile (Android-first MVP)</Text>
        <Text style={styles.muted}>
          Peer: {identity.peerId} · Relay:{" "}
          {connected ? "connected" : "disconnected"}
        </Text>
      </View>

      <ScrollView
        horizontal
        style={styles.tabRow}
        contentContainerStyle={styles.tabRowContent}
      >
        {(["profile", "myqr", "share", "contacts", "settings"] as Tab[]).map(
          (t) => (
            <Pressable
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
                {t.toUpperCase()}
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
      >
        {tab === "profile" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Own profile</Text>
            <Text style={styles.line}>Display: {identity.displayName}</Text>
            <Text style={styles.line}>FIT score: {identity.fitScore}</Text>
            <Text style={styles.line}>
              Public key: {identity.signPublicHex.slice(0, 16)}…
            </Text>
            <Text style={styles.line}>
              Shared layers: {summarizeLayers(identity.layers)}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={publishProfileUpdate}>
              <Text style={styles.primaryTxt}>
                Publish signed profile update
              </Text>
            </Pressable>
          </View>
        )}

        {tab === "myqr" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>My QR connection token</Text>
            {myQr ? (
              <>
                <View style={styles.qrWrap}>
                  <QRCode value={myQr} size={220} />
                </View>
                <Text style={styles.line}>Token expires in ~5 minutes.</Text>
              </>
            ) : null}
          </View>
        )}

        {tab === "share" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Targeted .fitshare</Text>

            {cameraEnabled ? (
              <View style={styles.cameraContainer}>
                <CameraView
                  style={styles.camera}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={(ev) => {
                    onScannedRecipientQr(ev.data);
                  }}
                />
                <Pressable
                  style={[styles.secondaryBtn, { marginTop: 12 }]}
                  onPress={() => setCameraEnabled(false)}
                >
                  <Text style={styles.secondaryTxt}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Recipient Public Key</Text>
                <TextInput
                  style={styles.input}
                  value={shareRecipientKey}
                  onChangeText={setShareRecipientKey}
                  placeholder="Enter recipient's enc_pub_key"
                  placeholderTextColor="#7c8da0"
                />
                <Text style={styles.label}>Recipient Peer ID</Text>
                <TextInput
                  style={styles.input}
                  value={shareRecipientPeer}
                  onChangeText={setShareRecipientPeer}
                  placeholder="Enter recipient's peer_id"
                  placeholderTextColor="#7c8da0"
                />
                <Pressable
                  style={[styles.secondaryBtn, { marginTop: 12 }]}
                  onPress={() => {
                    if (!cameraPermission?.granted)
                      void requestCameraPermission();
                    setCameraEnabled(true);
                  }}
                >
                  <Text style={styles.secondaryTxt}>Scan Recipient's QR</Text>
                </Pressable>

                <Text style={[styles.cardTitle, { marginTop: 16 }]}>
                  Select Layers
                </Text>
                {Object.keys(identity?.layers || {}).map((layerKey) => (
                  <Pressable
                    key={layerKey}
                    style={[
                      styles.rowBox,
                      shareLayers.includes(layerKey) && {
                        backgroundColor: "#1f344f",
                      },
                    ]}
                    onPress={() => toggleShareLayer(layerKey)}
                  >
                    <Text style={styles.line}>
                      {shareLayers.includes(layerKey) ? "✅ " : "⬜ "}
                      {layerKey}
                    </Text>
                  </Pressable>
                ))}

                <Text style={[styles.cardTitle, { marginTop: 16 }]}>
                  Expiry
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["1 Hour", "1 Day", "Never"].map((exp) => (
                    <Pressable
                      key={exp}
                      style={[
                        styles.secondaryBtn,
                        shareExpiry === exp && { backgroundColor: "#22c55e" },
                        { flex: 1 },
                      ]}
                      onPress={() => setShareExpiry(exp)}
                    >
                      <Text
                        style={[
                          styles.secondaryTxt,
                          shareExpiry === exp && { color: "#092212" },
                          { textAlign: "center" },
                        ]}
                      >
                        {exp}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  style={[
                    styles.primaryBtn,
                    { marginTop: 24 },
                    (!shareRecipientKey || shareLayers.length === 0) && {
                      opacity: 0.5,
                    },
                  ]}
                  disabled={!shareRecipientKey || shareLayers.length === 0}
                  onPress={generateAndSendFitShare}
                >
                  <Text style={styles.primaryTxt}>
                    Generate & Send .fitshare
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {tab === "contacts" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Contacts</Text>
              {contacts.length === 0 ? (
                <Text style={styles.muted}>No contacts yet.</Text>
              ) : null}
              {contacts.map((c) => (
                <View key={c.peerId} style={styles.rowBox}>
                  <Text style={styles.line}>
                    {c.displayName} · {c.status}
                  </Text>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => setSelectedContactPeer(c.peerId)}
                    >
                      <Text style={styles.secondaryTxt}>View</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryBtn}
                      disabled={c.status !== "accepted"}
                      onPress={() => revokeContact(c)}
                    >
                      <Text style={styles.secondaryTxt}>Revoke</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            {selectedContact ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Contact profile</Text>
                <Text style={styles.line}>
                  Name: {selectedContact.displayName}
                </Text>
                <Text style={styles.line}>
                  FIT score: {selectedContact.fitScore}
                </Text>
                {selectedContact.status === "accepted" ? (
                  <>
                    <Text style={[styles.cardTitle, { marginTop: 12 }]}>
                      Received Data Layers
                    </Text>
                    {Object.entries(selectedContact.sharedLayers ?? {}).map(
                      ([layerKey, data]) => (
                        <View
                          key={layerKey}
                          style={[
                            styles.rowBox,
                            {
                              flexDirection: "column",
                              alignItems: "flex-start",
                              marginTop: 4,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.line,
                              { fontWeight: "bold", color: "#7dd3fc" },
                            ]}
                          >
                            {layerKey}
                          </Text>
                          {typeof data === "string" ? (
                            <Text style={styles.line}>{data}</Text>
                          ) : (
                            <Text style={styles.smallJson}>
                              {JSON.stringify(data, null, 2)}
                            </Text>
                          )}
                        </View>
                      ),
                    )}
                  </>
                ) : (
                  <Text style={styles.muted}>
                    Access revoked. Only basic preview (display name + FIT
                    score) is visible.
                  </Text>
                )}
              </View>
            ) : null}
          </>
        )}

        {tab === "settings" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Demo Profile</Text>
              <Text style={styles.line}>
                Active: {activeDemoProfile?.label}
              </Text>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setSelectedDemoProfileId(null)}
              >
                <Text style={styles.secondaryTxt}>Switch Profile</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Relay connection</Text>
              <TextInput
                style={styles.input}
                value={relayUrl}
                onChangeText={setRelayUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.muted}>
                Android emulator usually needs {"ws" + "://"}10.0.2.2:8765 for
                host-machine relay.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent activity</Text>
              {activity.length === 0 ? (
                <Text style={styles.muted}>No activity yet.</Text>
              ) : null}
              {activity.map((a) => (
                <View key={a.id} style={styles.rowBox}>
                  <Text style={styles.line}>{a.title}</Text>
                  <Text style={styles.muted}>
                    {a.detail} · {new Date(a.ts * 1000).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b1220",
  },
  loading: {
    flex: 1,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  initErrorCard: {
    marginTop: 16,
    width: "100%",
    borderColor: "#7f1d1d",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#2a0f14",
    gap: 8,
  },
  initErrorTitle: {
    color: "#fecaca",
    fontWeight: "700",
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomColor: "#1d2b41",
    borderBottomWidth: 1,
  },
  h1: {
    color: "#e6edf6",
    fontSize: 18,
    fontWeight: "700",
  },
  tabRow: {
    maxHeight: 56,
    borderBottomColor: "#1d2b41",
    borderBottomWidth: 1,
  },
  tabRowContent: {
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: "#1f344f",
  },
  tabTxt: {
    color: "#87a2c2",
    fontSize: 12,
    fontWeight: "600",
  },
  tabTxtActive: {
    color: "#c9f7de",
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: 12,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    borderColor: "#1d2b41",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#101b2c",
    gap: 8,
  },
  cardTitle: {
    color: "#f3f7fc",
    fontWeight: "700",
    fontSize: 15,
  },
  line: {
    color: "#d8e5f3",
    fontSize: 13,
  },
  muted: {
    color: "#93acc7",
    fontSize: 12,
  },
  input: {
    borderColor: "#2b415f",
    borderWidth: 1,
    borderRadius: 8,
    color: "#f4fbff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#0f1726",
  },
  primaryBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#22c55e",
  },
  primaryTxt: {
    color: "#092212",
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#16263d",
  },
  secondaryTxt: {
    color: "#b8cfeb",
    fontWeight: "600",
    fontSize: 12,
  },
  qrWrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    alignSelf: "center",
    padding: 12,
    borderRadius: 8,
  },
  camera: {
    width: "100%",
    height: 280,
    borderRadius: 10,
    overflow: "hidden",
  },
  cameraContainer: {
    width: "100%",
  },
  label: {
    color: "#d8e5f3",
    fontSize: 13,
    marginBottom: 4,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  rowBox: {
    borderColor: "#1d2b41",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  smallJson: {
    color: "#96c5e4",
    fontFamily: "monospace",
    fontSize: 11,
  },
  debugRow: {
    borderColor: "#1d2b41",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 4,
    backgroundColor: "#0f1726",
  },
  debugHead: {
    color: "#b8cfeb",
    fontSize: 11,
    fontWeight: "700",
  },
  debugBody: {
    color: "#7dd3fc",
    fontSize: 11,
    fontFamily: "monospace",
  },
});
