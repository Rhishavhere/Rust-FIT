//! Tauri IPC — FIT crypto operations (delegates to `fit-core`).

use ed25519_dalek::SigningKey;
use fit_core::delta::AttesterType;
use fit_core::delta::FitDelta;
use fit_core::{
    apply_json_patch_delta, create_share_envelope, materialize_fit, open_share_envelope,
    parse_fit, verify_signature,
};
use serde::Serialize;

#[tauri::command]
pub fn fit_read_utf8(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(map_err)
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn hex_to_32(hex_s: &str) -> Result<[u8; 32], String> {
    let raw =
        hex::decode(hex_s.trim_start_matches("0x")).map_err(|e| format!("hex decode: {e}"))?;
    raw.try_into()
        .map_err(|_| "expected 32 bytes (64 hex chars)".to_string())
}

#[derive(Serialize)]
pub struct DeltaSummary {
    pub delta_id: u32,
    pub summary: String,
    pub timestamp: i64,
    pub layer_affected: u8,
}

#[tauri::command]
pub fn fit_delta_summaries(file_path: String) -> Result<Vec<DeltaSummary>, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let parsed = parse_fit(&raw).map_err(map_err)?;
    Ok(summarize_deltas(parsed.deltas))
}

fn summarize_deltas(deltas: Vec<FitDelta>) -> Vec<DeltaSummary> {
    deltas
        .into_iter()
        .map(|d| DeltaSummary {
            delta_id: d.delta_id,
            summary: d.summary,
            timestamp: d.timestamp,
            layer_affected: d.layer_affected,
        })
        .collect()
}

#[derive(Serialize)]
pub struct InspectResult {
    pub fit_id_short: String,
    /// Full UUID bytes as hex — WebSocket relay `fit_id` matches this string.
    pub fit_id_hex: String,
    pub display_name: String,
    pub fit_score: u16,
    pub layer_count: usize,
    pub delta_count: usize,
    pub owner_pubkey_hex: String,
}

#[tauri::command]
pub fn fit_inspect(file_path: String) -> Result<InspectResult, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    let h = &p.header;
    Ok(InspectResult {
        fit_id_short: hex::encode(&h.fit_id[..6]),
        fit_id_hex: hex::encode(h.fit_id),
        display_name: h.display_name.clone(),
        fit_score: h.fit_score,
        layer_count: p.layers.len(),
        delta_count: p.deltas.len(),
        owner_pubkey_hex: hex::encode(h.owner_pubkey),
    })
}

#[tauri::command]
pub fn fit_verify(file_path: String) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    verify_signature(&p).map_err(map_err)
}

#[derive(Serialize)]
pub struct MaterializedFit {
    pub layers: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
pub fn fit_materialize_owner(
    file_path: String,
    master_secret_hex: String,
) -> Result<MaterializedFit, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let p = parse_fit(&raw).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let rows = materialize_fit(&p, &ms).map_err(map_err)?;
    let mut map = serde_json::Map::new();
    for (id, val) in rows {
        map.insert(format!("layer{}", id), val);
    }
    Ok(MaterializedFit { layers: map })
}

#[derive(Serialize)]
pub struct MaterializedShare {
    pub layers: serde_json::Map<String, serde_json::Value>,
    pub source_fit_id_short: String,
    /// Full hex of source FIT UUID — relay `SUBSCRIBE` MUST use this (same key as owner's `fit_id_hex`).
    pub source_fit_id_hex: String,
    pub permitted_layers: Vec<u8>,
    pub expires_at: i64,
    pub live_tracking: bool,
}

#[tauri::command]
pub fn fit_open_share(
    file_path: String,
    x25519_secret_hex: String,
) -> Result<MaterializedShare, String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let sk_bytes = hex_to_32(&x25519_secret_hex)?;
    let xsk = x25519_dalek::StaticSecret::from(sk_bytes);
    let (env, layers) = open_share_envelope(&raw, &xsk).map_err(map_err)?;
    let mut map = serde_json::Map::new();
    for (id, val) in layers {
        map.insert(format!("layer{}", id), val);
    }
    Ok(MaterializedShare {
        layers: map,
        source_fit_id_short: hex::encode(&env.source_fit_id[..6]),
        source_fit_id_hex: hex::encode(env.source_fit_id),
        permitted_layers: env.permitted_layers.clone(),
        expires_at: env.expires_at,
        live_tracking: env.live_tracking,
    })
}

fn parse_attester(s: &str) -> AttesterType {
    match s.to_ascii_lowercase().as_str() {
        "owner" => AttesterType::Owner,
        "cibilbureau" | "cibil" => AttesterType::CibilBureau,
        "gstnportal" | "gstn" => AttesterType::GstnPortal,
        "incometaxportal" | "itr" => AttesterType::IncomeTaxPortal,
        "mcaportal" => AttesterType::McaPortal,
        "bankaa" => AttesterType::BankAA,
        "zerodhakite" => AttesterType::ZerodhaKite,
        "manualca" => AttesterType::ManualCA,
        _ => AttesterType::Owner,
    }
}

#[tauri::command]
pub fn fit_apply_delta_json_patch(
    file_path: String,
    master_secret_hex: String,
    ed25519_seed_hex: String,
    layer_id: u8,
    patch_json: String,
    summary: String,
    attester: String,
) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let seed = hex_to_32(&ed25519_seed_hex)?;
    let sk = SigningKey::from_bytes(&seed);
    let patch: json_patch::Patch =
        serde_json::from_str(&patch_json).map_err(|e| format!("patch json: {e}"))?;
    let att = parse_attester(&attester);
    let updated =
        apply_json_patch_delta(&raw, &ms, &sk, layer_id, &patch, &summary, att).map_err(map_err)?;
    std::fs::write(&file_path, &updated).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn fit_create_share(
    file_path: String,
    master_secret_hex: String,
    ed25519_seed_hex: String,
    recipient_x25519_pub_hex: String,
    layers_csv: String,
    expires_unix: i64,
    live_tracking: bool,
    out_path: String,
) -> Result<(), String> {
    let raw = std::fs::read(&file_path).map_err(map_err)?;
    let ms = hex_to_32(&master_secret_hex)?;
    let seed = hex_to_32(&ed25519_seed_hex)?;
    let sk = SigningKey::from_bytes(&seed);
    let mut permitted: Vec<u8> = layers_csv
        .split(',')
        .filter_map(|s| s.trim().parse::<u8>().ok())
        .filter(|&n| (1..=6).contains(&n))
        .collect();
    permitted.sort_unstable();
    permitted.dedup();
    let recipient_pk = hex_to_32(&recipient_x25519_pub_hex)?;
    let envelope = create_share_envelope(
        &raw,
        &ms,
        &sk,
        &permitted,
        &recipient_pk,
        expires_unix,
        live_tracking,
    )
    .map_err(map_err)?;
    std::fs::write(&out_path, &envelope).map_err(map_err)?;
    Ok(())
}
