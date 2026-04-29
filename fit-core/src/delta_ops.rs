//! Apply signed deltas — RFC 6902 JSON Patch over decrypted layer payloads.

use chrono::Utc;
use ed25519_dalek::{SigningKey, VerifyingKey};
use json_patch::Patch;

use serde_json::Value;

use crate::crypto::{aes_gcm_decrypt, aes_gcm_encrypt, derive_layer_key, sign_bytes, verify_bytes};
use crate::delta::{AttesterType, DeltaType, FitDelta};
use crate::error::{FitCoreError, FitResult};
use crate::format::{
    parse_fit, rebuild_merkle_from_layers, serialize_fit, EncryptedLayer, FitHeader, ParsedFitBlob,
    ParsedFitFile,
};
use crate::merkle::leaf_from_ciphertext;

/// Apply RFC 6902 patch to decrypted `layer_id` plaintext, resign Merkle owner signature,
/// append one `FitDelta` signed by owner (demo attesters use same key).
pub fn apply_json_patch_delta(
    fit_bytes: &[u8],
    master_secret: &[u8],
    owner_signing: &SigningKey,
    layer_id: u8,
    patch: &Patch,
    summary: &str,
    attester: AttesterType,
) -> FitResult<Vec<u8>> {
    let mut parsed = parse_fit(fit_bytes)?;
    let fit_id = parsed.header.fit_id;
    let layer_idx = parsed
        .layers
        .iter()
        .position(|l| l.layer_id == layer_id)
        .ok_or_else(|| FitCoreError::Other(format!("missing layer {}", layer_id)))?;
    let key = derive_layer_key(master_secret, layer_id, &fit_id);
    let blob = parsed.layers.get_mut(layer_idx).unwrap();
    let inner = aes_gcm_decrypt(&key, &blob.nonce, &blob.ciphertext)?;
    let plain = zstd::bulk::decompress(&inner, 16 * 1024 * 1024)
        .map_err(|e| FitCoreError::Other(e.to_string()))?;
    let mut val: Value = serde_json::from_slice(&plain)
        .map_err(|e| FitCoreError::Decode(format!("layer json {e}")))?;
    json_patch::patch(&mut val, patch).map_err(|e| FitCoreError::Other(e.to_string()))?;
    let new_json =
        serde_json::to_vec(&val).map_err(|e| FitCoreError::Encode(e.to_string()))?;
    let compressed = zstd::bulk::compress(&new_json, 3)
        .map_err(|e| FitCoreError::Other(e.to_string()))?;
    let (ciphertext, nonce) = aes_gcm_encrypt(&key, &compressed)?;
    let ciphertext_hash = leaf_from_ciphertext(&ciphertext);
    *blob = EncryptedLayer {
        layer_id,
        nonce,
        ciphertext,
        ciphertext_hash,
    };
    let merkle_root = rebuild_merkle_from_layers(&parsed.layers);
    let ops_json = serde_json::to_vec(&patch.0).map_err(|e| FitCoreError::Encode(e.to_string()))?;
    let patch_z = zstd::bulk::compress(&ops_json, 3)
        .map_err(|e| FitCoreError::Other(e.to_string()))?;
    let attester_key = owner_signing;
    let delta_sig = sign_bytes(attester_key, &patch_z);
    let delta = FitDelta {
        delta_id: parsed.deltas.len() as u32 + 1,
        timestamp: Utc::now().timestamp(),
        layer_affected: layer_id,
        delta_type: DeltaType::Update,
        summary: summary.to_string(),
        patch: patch_z,
        attester,
        attester_pubkey: attester_key.verifying_key().to_bytes(),
        signature: delta_sig,
    };
    parsed.deltas.push(delta);
    let header = FitHeader {
        magic: parsed.header.magic,
        fit_id: parsed.header.fit_id,
        version: parsed.header.version,
        created_at: parsed.header.created_at,
        updated_at: Utc::now().timestamp(),
        owner_pubkey: parsed.header.owner_pubkey,
        fit_score: parsed.header.fit_score,
        capability_flags: parsed.header.capability_flags,
        display_name: parsed.header.display_name.clone(),
        delta_count: parsed.deltas.len() as u32,
    };
    let owner_sig_bytes = sign_bytes(owner_signing, &merkle_root);
    serialize_fit(ParsedFitBlob {
        header,
        layers: parsed.layers,
        deltas: parsed.deltas,
        owner_signature: owner_sig_bytes,
    })
}

pub fn verify_delta_chain(parsed: &ParsedFitFile) -> FitResult<()> {
    for d in &parsed.deltas {
        let vk = VerifyingKey::from_bytes(&d.attester_pubkey)
            .map_err(|e| FitCoreError::Crypto(e.to_string()))?;
        verify_bytes(&vk, &d.patch, &d.signature)?;
    }
    Ok(())
}
