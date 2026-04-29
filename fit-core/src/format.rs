use bincode::Options as _;
use serde::{Deserialize, Serialize};

use crate::crypto::{EOF_MARKER, FIT_MAGIC};
use crate::delta::FitDelta;
use crate::error::{FitCoreError, FitResult};
use crate::merkle;

fn bincode_opts() -> impl bincode::Options {
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .allow_trailing_bytes()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FitHeader {
    pub magic: [u8; 4],
    pub fit_id: [u8; 16],
    pub version: u16,
    pub created_at: i64,
    pub updated_at: i64,
    pub owner_pubkey: [u8; 32],
    pub fit_score: u16,
    pub capability_flags: u8,
    pub display_name: String,
    pub delta_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedLayer {
    pub layer_id: u8,
    pub nonce: [u8; 12],
    pub ciphertext: Vec<u8>,
    pub ciphertext_hash: [u8; 32],
}

#[derive(Debug, Clone)]
pub struct ParsedFitFile {
    pub header: FitHeader,
    pub merkle_root: [u8; 32],
    pub layers: Vec<EncryptedLayer>,
    pub deltas: Vec<FitDelta>,
    pub owner_signature: [u8; 64],
}

pub struct ParsedFitBlob {
    pub header: FitHeader,
    pub layers: Vec<EncryptedLayer>,
    pub deltas: Vec<FitDelta>,
    pub owner_signature: [u8; 64],
}

pub fn serialize_fit(blob: ParsedFitBlob) -> FitResult<Vec<u8>> {
    let ParsedFitBlob {
        header,
        layers,
        deltas,
        owner_signature,
    } = blob;
    let mut out = Vec::new();
    out.extend_from_slice(&FIT_MAGIC);
    let hdr_bytes = bincode_opts().serialize(&header).map_err(|e| FitCoreError::Encode(e.to_string()))?;
    let hl = hdr_bytes.len() as u32;
    out.extend_from_slice(&hl.to_le_bytes());
    out.extend_from_slice(&hdr_bytes);
    let merkle_root = merkle::merkle_root(
        layers
            .iter()
            .map(|l| merkle::leaf_from_ciphertext(&l.ciphertext))
            .collect(),
    );
    out.extend_from_slice(&merkle_root);
    if layers.len() > 255 {
        return Err(FitCoreError::Other("too many layers".into()));
    }
    out.push(layers.len() as u8);
    for layer in &layers {
        let lyr = bincode_opts()
            .serialize(layer)
            .map_err(|e| FitCoreError::Encode(e.to_string()))?;
        let pl = lyr.len() as u32;
        out.extend_from_slice(&pl.to_le_bytes());
        out.extend_from_slice(&lyr);
    }
    let dc = deltas.len() as u32;
    out.extend_from_slice(&dc.to_le_bytes());
    for delta in &deltas {
        let delta_bytes = bincode_opts()
            .serialize(delta)
            .map_err(|e| FitCoreError::Encode(e.to_string()))?;
        let dl = delta_bytes.len() as u32;
        out.extend_from_slice(&dl.to_le_bytes());
        out.extend_from_slice(&delta_bytes);
    }
    out.extend_from_slice(&(64_u16.to_le_bytes()));
    out.extend_from_slice(&owner_signature);
    out.extend_from_slice(&EOF_MARKER);
    Ok(out)
}

pub fn parse_fit(raw: &[u8]) -> FitResult<ParsedFitFile> {
    if raw.len() < 4 + 4 {
        return Err(FitCoreError::Decode("truncated fit".into()));
    }
    if raw[0..4] != FIT_MAGIC {
        return Err(FitCoreError::InvalidMagic);
    }
    let mut off = 4;
    let hl = u32::from_le_bytes(raw[off..off + 4].try_into().unwrap()) as usize;
    off += 4;
    let header: FitHeader = bincode_opts()
        .deserialize(&raw[off..off + hl])
        .map_err(|e| FitCoreError::Decode(e.to_string()))?;
    off += hl;
    if raw.len() < off + 32 + 1 {
        return Err(FitCoreError::Decode("truncated after header".into()));
    }
    let merkle_root: [u8; 32] = raw[off..off + 32].try_into().unwrap();
    off += 32;
    let layer_count = raw[off] as usize;
    off += 1;
    let mut layers = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        if raw.len() < off + 4 {
            return Err(FitCoreError::Decode("truncated layer len".into()));
        }
        let ll = u32::from_le_bytes(raw[off..off + 4].try_into().unwrap()) as usize;
        off += 4;
        let layer: EncryptedLayer = bincode_opts()
            .deserialize(&raw[off..off + ll])
            .map_err(|e| FitCoreError::Decode(e.to_string()))?;
        off += ll;
        layers.push(layer);
    }
    if raw.len() < off + 4 {
        return Err(FitCoreError::Decode("truncated delta_count".into()));
    }
    let delta_count = u32::from_le_bytes(raw[off..off + 4].try_into().unwrap()) as usize;
    off += 4;
    let mut deltas = Vec::with_capacity(delta_count);
    for _ in 0..delta_count {
        if raw.len() < off + 4 {
            return Err(FitCoreError::Decode("truncated delta len".into()));
        }
        let dl = u32::from_le_bytes(raw[off..off + 4].try_into().unwrap()) as usize;
        off += 4;
        let delta: FitDelta = bincode_opts()
            .deserialize(&raw[off..off + dl])
            .map_err(|e| FitCoreError::Decode(e.to_string()))?;
        off += dl;
        deltas.push(delta);
    }
    if raw.len() < off + 2 + 64 + 4 {
        return Err(FitCoreError::Decode("truncated signature eof".into()));
    }
    let sig_len = u16::from_le_bytes(raw[off..off + 2].try_into().unwrap()) as usize;
    off += 2;
    if sig_len != 64 {
        return Err(FitCoreError::Decode("bad signature length".into()));
    }
    let sig: [u8; 64] = raw[off..off + 64].try_into().unwrap();
    off += 64;
    if raw[off..off + 4] != EOF_MARKER {
        return Err(FitCoreError::InvalidEof);
    }
    off += 4;
    if off != raw.len() {
        return Err(FitCoreError::Decode("trailing junk".into()));
    }
    Ok(ParsedFitFile {
        header,
        merkle_root,
        layers,
        deltas,
        owner_signature: sig,
    })
}

pub fn rebuild_merkle_from_layers(layers: &[EncryptedLayer]) -> [u8; 32] {
    merkle::merkle_root(
        layers
            .iter()
            .map(|l| merkle::leaf_from_ciphertext(&l.ciphertext))
            .collect(),
    )
}
