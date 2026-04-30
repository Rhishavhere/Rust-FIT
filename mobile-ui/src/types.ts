export type LayersMap = Record<string, unknown>;

export type IdentityProfile = {
  peerId: string;
  displayName: string;
  fitScore: number;
  signPublicHex: string;
  encPublicHex: string;
  layers: LayersMap;
};

export type RequestStatus = "pending" | "accepted" | "rejected";

export type ConnectionRequest = {
  id: string;
  fromPeer: string;
  toPeer: string;
  displayName: string;
  fitScore: number;
  pubKeyHex: string;
  status: RequestStatus;
  direction: "incoming" | "outgoing";
  createdAt: number;
  // Metadata for mutual exchange
  remoteShareKey?: string; // Stored from the scanned QR code
  remoteFitshareBlob?: { ciphertext: string; nonce: string }; // Stored from MUTUAL_EXCHANGE_REQUEST
  localShareKey?: string; // The key we used to encrypt our own fitshare (for incoming requests, the key Bob sent us)
};

export type ContactStatus = "accepted" | "revoked";

export type Contact = {
  peerId: string;
  displayName: string;
  fitScore: number;
  pubKeyHex: string;
  status: ContactStatus;
  sharedLayers?: LayersMap;
  updatedAt: number;
};

export type ActivityRow = {
  id: string;
  title: string;
  detail: string;
  ts: number;
};

export type PersistedState = {
  identity?: IdentityProfile;
  relayUrl: string;
  incoming: ConnectionRequest[];
  outgoing: ConnectionRequest[];
  contacts: Contact[];
  activity: ActivityRow[];
};
