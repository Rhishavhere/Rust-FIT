import { invoke } from "@tauri-apps/api/core";
import type {
  DeltaRow,
  InspectInfo,
  LayersMap,
  ShareMeta,
} from "./fitTypes";

export async function readUtf8(path: string): Promise<string> {
  return invoke<string>("fit_read_utf8", { path });
}

export async function fitInspect(path: string): Promise<InspectInfo> {
  return invoke<InspectInfo>("fit_inspect", { filePath: path });
}

export async function fitMaterializeOwner(
  filePath: string,
  masterSecretHex: string
): Promise<{ layers: LayersMap }> {
  return invoke<{ layers: LayersMap }>("fit_materialize_owner", {
    filePath,
    masterSecretHex,
  });
}

export async function fitDeltaSummaries(
  filePath: string
): Promise<DeltaRow[]> {
  return invoke<DeltaRow[]>("fit_delta_summaries", { filePath });
}

export async function fitVerify(filePath: string): Promise<void> {
  await invoke<void>("fit_verify", { filePath });
}

export async function fitApplyDelta(params: {
  filePath: string;
  masterSecretHex: string;
  ed25519SeedHex: string;
  layerId: number;
  patchJson: string;
  summary: string;
  attester: string;
}): Promise<void> {
  await invoke("fit_apply_delta_json_patch", {
    filePath: params.filePath,
    masterSecretHex: params.masterSecretHex,
    ed25519SeedHex: params.ed25519SeedHex,
    layerId: params.layerId,
    patchJson: params.patchJson,
    summary: params.summary,
    attester: params.attester,
  });
}

export async function fitCreateShare(params: {
  filePath: string;
  masterSecretHex: string;
  ed25519SeedHex: string;
  recipientX25519PubHex: string;
  layersCsv: string;
  expiresUnix: number;
  liveTracking: boolean;
  outPath: string;
}): Promise<void> {
  await invoke("fit_create_share", {
    filePath: params.filePath,
    masterSecretHex: params.masterSecretHex,
    ed25519SeedHex: params.ed25519SeedHex,
    recipientX25519PubHex: params.recipientX25519PubHex,
    layersCsv: params.layersCsv,
    expiresUnix: params.expiresUnix,
    liveTracking: params.liveTracking,
    outPath: params.outPath,
  });
}

export async function fitOpenShare(
  filePath: string,
  x25519SecretHex: string
): Promise<{ layers: LayersMap } & ShareMeta> {
  return invoke<{ layers: LayersMap } & ShareMeta>("fit_open_share", {
    filePath,
    x25519SecretHex,
  });
}
