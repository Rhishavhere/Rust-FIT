use chrono::Utc;
use ed25519_dalek::{SigningKey, VerifyingKey};
use serde_json::Value;

use crate::crypto::{
    self, aes_gcm_decrypt, aes_gcm_encrypt, derive_layer_key, generate_ed25519_keypair,
    generate_master_secret, sign_merkle_root, verify_merkle_signature,
};
use crate::error::{FitCoreError, FitResult};
use crate::format::{
    self, serialize_fit, EncryptedLayer, FitHeader, ParsedFitBlob, ParsedFitFile,
};
use crate::merkle::leaf_from_ciphertext;
use crate::personas;
use crate::score::compute_fit_score;
use uuid::Uuid;

pub struct GenesisResult {
    pub bytes: Vec<u8>,
    pub master_secret: [u8; 32],
    pub signing_key: SigningKey,
    #[allow(dead_code)]
    pub verifying_key: VerifyingKey,
}

/// Build genesis .fit from persona id (plaintext JSON → encrypted layers).
pub fn genesis_from_persona(persona_id: &str) -> FitResult<GenesisResult> {
    let (display_name, layer_arr) = personas::persona_layers(persona_id)?;
    let layers_vec: Vec<Value> = layer_arr.into_iter().collect();
    let fit_score = compute_fit_score(&layers_vec);
    let (signing_key, verifying_key) = generate_ed25519_keypair();
    let master_secret = generate_master_secret();
    let fit_uuid = Uuid::now_v7();
    let fit_id: [u8; 16] = *fit_uuid.as_bytes();
    let now = Utc::now().timestamp();
    let mut layers: Vec<EncryptedLayer> = Vec::new();
    let mut cap: u8 = 0;
    for (i, val) in layers_vec.iter().enumerate() {
        let layer_id = (i + 1) as u8;
        cap |= 1u8 << (layer_id - 1);
        let key = derive_layer_key(&master_secret, layer_id, &fit_id);
        let json = serde_json::to_vec(val).map_err(|e| FitCoreError::Encode(e.to_string()))?;
        let compressed = zstd::bulk::compress(&json, 3)
            .map_err(|e| FitCoreError::Other(e.to_string()))?;
        let (ciphertext, nonce) = aes_gcm_encrypt(&key, &compressed)?;
        let hash = leaf_from_ciphertext(&ciphertext);
        layers.push(EncryptedLayer {
            layer_id,
            nonce,
            ciphertext,
            ciphertext_hash: hash,
        });
    }
    let header = FitHeader {
        magic: crypto::FIT_MAGIC,
        fit_id,
        version: 1,
        created_at: now,
        updated_at: now,
        owner_pubkey: verifying_key.to_bytes(),
        fit_score,
        capability_flags: cap,
        display_name,
        delta_count: 0,
    };
    let merkle = format::rebuild_merkle_from_layers(&layers);
    let sig = sign_merkle_root(&signing_key, &merkle);
    let blob = ParsedFitBlob {
        header,
        layers,
        deltas: vec![],
        owner_signature: sig,
    };
    let bytes = serialize_fit(blob)?;
    Ok(GenesisResult {
        bytes,
        master_secret,
        signing_key,
        verifying_key,
    })
}

pub fn verify_signature(parsed: &ParsedFitFile) -> FitResult<()> {
    let vk = VerifyingKey::from_bytes(&parsed.header.owner_pubkey)
        .map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    verify_merkle_signature(&vk, &parsed.merkle_root, &parsed.owner_signature)
}

/// Decrypt all layers to JSON values (owner key material).
pub fn materialize_fit(
    parsed: &ParsedFitFile,
    master_secret: &[u8],
) -> FitResult<Vec<(u8, Value)>> {
    let fit_id = parsed.header.fit_id;
    let mut out = Vec::new();
    for layer in &parsed.layers {
        let key = derive_layer_key(master_secret, layer.layer_id, &fit_id);
        let plain = aes_gcm_decrypt(&key, &layer.nonce, &layer.ciphertext)?;
        let decompressed = zstd::bulk::decompress(&plain, 16 * 1024 * 1024)
            .map_err(|e| FitCoreError::Other(e.to_string()))?;
        let v: Value = serde_json::from_slice(&decompressed)
            .map_err(|e| FitCoreError::Decode(format!("layer json: {e}")))?;
        out.push((layer.layer_id, v));
    }
    out.sort_by_key(|x| x.0);
    Ok(out)
}

pub fn materialize_fit_to_map(
    parsed: &ParsedFitFile,
    master_secret: &[u8],
) -> FitResult<serde_json::Map<String, Value>> {
    let rows = materialize_fit(parsed, master_secret)?;
    let mut map = serde_json::Map::new();
    for (lid, val) in rows {
        map.insert(format!("layer{}", lid), val);
    }
    Ok(map)
}
