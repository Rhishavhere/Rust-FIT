/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly TAURI_PLATFORM?: string;
  /** Optional override, e.g. `ws://192.168.1.5:8765` for LAN relay. */
  readonly VITE_RELAY_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
