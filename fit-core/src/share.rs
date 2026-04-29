//! `.fitshare` envelope — ECDH-wrapped symmetric keys + copied encrypted layers.

use blake3::Hasher;
use bincode::Options as _;
use chrono::Utc;
use ed25519_dalek::{SigningKey, VerifyingKey};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use uuid::Uuid;
use x25519_dalek::{PublicKey as XPub, StaticSecret};
use std::collections::HashMap;

use crate::crypto::{aes_gcm_decrypt, aes_gcm_encrypt, derive_layer_key};
use crate::crypto::{
    sign_bytes as ed_sign, verify_bytes as ed_verify,
};
use crate::error::{FitCoreError, FitResult};
use crate::format::{parse_fit, EncryptedLayer};

pub const SHARE_MAGIC: [u8; 4] = [0x46, 0x49, 0x53, 0x01];

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FitShareEnvelope {
    pub magic: [u8; 4],
    pub envelope_id: [u8; 16],
    pub source_fit_id: [u8; 16],
    pub owner_pubkey: [u8; 32],
    pub recipient_pubkey: [u8; 32],
    pub permitted_layers: Vec<u8>,
    pub expires_at: i64,
    pub live_tracking: bool,
    pub created_at: i64,
    pub ephemeral_pubkey: [u8; 32],
    pub encrypted_keys_blob: Vec<u8>,
    pub layers_cipher: Vec<u8>,
}

#[derive(Serialize)]
struct EnvSignCanonical {
    magic: [u8; 4],
    envelope_id: [u8; 16],
    source_fit_id: [u8; 16],
    owner_pubkey: [u8; 32],
    recipient_pubkey: [u8; 32],
    permitted_layers: Vec<u8>,
    expires_at: i64,
    live_tracking: bool,
    created_at: i64,
    ephemeral_pubkey: [u8; 32],
    encrypted_keys_blob: Vec<u8>,
    layers_cipher: Vec<u8>,
}

fn hkdf_symm(shared_secret: &[u8]) -> FitResult<[u8; 32]> {
    let hk = Hkdf::<Sha256>::new(Some(b""), shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(b"FIT-SHARE-v1", &mut okm)
        .map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    Ok(okm)
}

fn pack_keys(keys: &[(u8, [u8; 32])]) -> Vec<u8> {
    let mut out = Vec::new();
    for (lid, key) in keys {
        out.push(*lid);
        out.extend_from_slice(key);
    }
    out
}

fn unpack_keys(data: &[u8]) -> FitResult<Vec<(u8, [u8; 32])>> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < data.len() {
        if data.len() - i < 33 {
            return Err(FitCoreError::Decode("bad keys blob".into()));
        }
        let lid = data[i];
        let mut k = [0u8; 32];
        k.copy_from_slice(&data[i + 1..i + 33]);
        out.push((lid, k));
        i += 33;
    }
    Ok(out)
}

fn canonical_bytes(env: &FitShareEnvelope) -> FitResult<Vec<u8>> {
    let canon = EnvSignCanonical {
        magic: env.magic,
        envelope_id: env.envelope_id,
        source_fit_id: env.source_fit_id,
        owner_pubkey: env.owner_pubkey,
        recipient_pubkey: env.recipient_pubkey,
        permitted_layers: env.permitted_layers.clone(),
        expires_at: env.expires_at,
        live_tracking: env.live_tracking,
        created_at: env.created_at,
        ephemeral_pubkey: env.ephemeral_pubkey,
        encrypted_keys_blob: env.encrypted_keys_blob.clone(),
        layers_cipher: env.layers_cipher.clone(),
    };
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .serialize(&canon)
        .map_err(|e| FitCoreError::Encode(e.to_string()))
}

fn envelope_digest(env: &FitShareEnvelope) -> FitResult<[u8; 32]> {
    let mut h = Hasher::new();
    h.update(&canonical_bytes(env)?);
    Ok(*h.finalize().as_bytes())
}

fn verify_envelope_sig(env: &FitShareEnvelope, sig: &[u8; 64]) -> FitResult<()> {
    let vk = VerifyingKey::from_bytes(&env.owner_pubkey)
        .map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    let digest = envelope_digest(env)?;
    ed_verify(&vk, &digest, sig)
}

/// Build share bytes: SHARE_MAGIC | u32 len | bincode(StoredShare) | EOF
#[derive(Serialize, Deserialize)]
pub struct StoredShareOuter {
    pub env: FitShareEnvelope,
    pub owner_sig: [u8; 64],
}

pub fn create_share_envelope(
    fit_bytes: &[u8],
    master_secret: &[u8],
    owner_signing: &SigningKey,
    permitted_layers: &[u8],
    recipient_x25519_pub: &[u8; 32],
    expires_at: i64,
    live_tracking: bool,
) -> FitResult<Vec<u8>> {
    let parsed = parse_fit(fit_bytes)?;
    let fit_id = parsed.header.fit_id;
    let ephem = StaticSecret::random_from_rng(OsRng);
    let ephem_pub = XPub::from(&ephem);
    let recip = XPub::from(*recipient_x25519_pub);
    let shared = ephem.diffie_hellman(&recip);
    let symm = hkdf_symm(shared.as_bytes().as_slice())?;
    let mut keys: Vec<(u8, [u8; 32])> = Vec::new();
    for &lid in permitted_layers {
        let k = derive_layer_key(master_secret, lid, &fit_id);
        keys.push((lid, k));
    }
    let packed = pack_keys(&keys);
    let (ct, nonce) = aes_gcm_encrypt(&symm, &packed)?;
    let mut keys_blob = Vec::with_capacity(12 + ct.len());
    keys_blob.extend_from_slice(&nonce);
    keys_blob.extend_from_slice(&ct);
    let mut layers_payload = Vec::new();
    for layer in &parsed.layers {
        if permitted_layers.contains(&layer.layer_id) {
            let ly = bincode::DefaultOptions::new()
                .with_fixint_encoding()
                .serialize(layer)
                .map_err(|e| FitCoreError::Encode(e.to_string()))?;
            let len = ly.len() as u32;
            layers_payload.extend_from_slice(&len.to_le_bytes());
            layers_payload.extend_from_slice(&ly);
        }
    }
    let env_id = *Uuid::now_v7().as_bytes();
    let created = Utc::now().timestamp();
    let owner_pk = owner_signing.verifying_key().to_bytes();
    let env = FitShareEnvelope {
        magic: SHARE_MAGIC,
        envelope_id: env_id,
        source_fit_id: fit_id,
        owner_pubkey: owner_pk,
        recipient_pubkey: *recipient_x25519_pub,
        permitted_layers: permitted_layers.to_vec(),
        expires_at,
        live_tracking,
        created_at: created,
        ephemeral_pubkey: ephem_pub.to_bytes(),
        encrypted_keys_blob: keys_blob,
        layers_cipher: layers_payload,
    };
    let digest = envelope_digest(&env)?;
    let sig = ed_sign(owner_signing, &digest);
    let outer = StoredShareOuter {
        env,
        owner_sig: sig,
    };
    let body = bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .serialize(&outer)
        .map_err(|e| FitCoreError::Encode(e.to_string()))?;
    let mut out = Vec::new();
    out.extend_from_slice(&SHARE_MAGIC);
    let blen = body.len() as u32;
    out.extend_from_slice(&blen.to_le_bytes());
    out.extend_from_slice(&body);
    out.extend_from_slice(crate::crypto::EOF_MARKER);
    Ok(out)
}

pub fn parse_share_envelope(raw: &[u8]) -> FitResult<(FitShareEnvelope, [u8; 64])> {
    if raw.len() < 8 {
        return Err(FitCoreError::Decode("truncated share".into()));
    }
    if raw[..4] != SHARE_MAGIC {
        return Err(FitCoreError::InvalidMagic);
    }
    let blen = u32::from_le_bytes(raw[4..8].try_into().unwrap()) as usize;
    let end_body = 8 + blen;
    if raw.len() < end_body + 4 {
        return Err(FitCoreError::Decode("truncated share body".into()));
    }
    let outer: StoredShareOuter =
        bincode::DefaultOptions::new()
            .with_fixint_encoding()
            .deserialize(&raw[8..end_body])
            .map_err(|e| FitCoreError::Decode(e.to_string()))?;
    if raw[end_body..end_body + 4] != crate::crypto::EOF_MARKER {
        return Err(FitCoreError::InvalidEof);
    }
    Ok((outer.env, outer.owner_sig))
}

/// Decrypt permitted layers JSON using recipient X25519 static secret.
pub fn open_share_envelope(
    raw: &[u8],
    recipient_static: &StaticSecret,
) -> FitResult<(FitShareEnvelope, Vec<(u8, Value)>)> {
    let (env, sig) = parse_share_envelope(raw)?;
    verify_envelope_sig(&env, &sig)?;
    let ephem_pub = XPub::from(env.ephemeral_pubkey);
    let shared = recipient_static.diffie_hellman(&ephem_pub);
    let symm = hkdf_symm(shared.as_bytes().as_slice())?;
    if env.encrypted_keys_blob.len() < 12 {
        return Err(FitCoreError::Decode("bad keys blob".into()));
    }
    let nonce: [u8; 12] = env.encrypted_keys_blob[0..12].try_into().unwrap();
    let ct = &env.encrypted_keys_blob[12..];
    let plain = aes_gcm_decrypt(&symm, &nonce, ct)?;
    let keys = unpack_keys(&plain)?;
    let mut key_map: HashMap<u8, [u8; 32]> = keys.into_iter().collect();
    let mut layers = Vec::new();
    let mut cursor = env.layers_cipher.as_slice();
    while !cursor.is_empty() {
        if cursor.len() < 4 {
            break;
        }
        let ll = u32::from_le_bytes(cursor[0..4].try_into().unwrap()) as usize;
        cursor = &cursor[4..];
        if cursor.len() < ll {
            return Err(FitCoreError::Decode("bad layer chunk".into()));
        }
        let layer: EncryptedLayer =
            bincode::DefaultOptions::new()
                .with_fixint_encoding()
                .deserialize(&cursor[..ll])
                .map_err(|e| FitCoreError::Decode(e.to_string()))?;
        cursor = &cursor[ll..];
        let k = key_map
            .remove(&layer.layer_id)
            .ok_or_else(|| FitCoreError::Other("missing layer key".into()))?;
        let inner = crate::crypto::aes_gcm_decrypt(&k, &layer.nonce, &layer.ciphertext)?;
        let decompressed = zstd::bulk::decompress(&inner, 16 * 1024 * 1024)
            .map_err(|e| FitCoreError::Other(e.to_string()))?;
        let v: Value = serde_json::from_slice(&decompressed)
            .map_err(|e| FitCoreError::Decode(e.to_string()))?;
        layers.push((layer.layer_id, v));
    }
    layers.sort_by_key(|x| x.0);
    Ok((env, layers))
}
