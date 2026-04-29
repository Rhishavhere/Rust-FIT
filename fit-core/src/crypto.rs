use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use ed25519_dalek::{Signature, SigningKey, VerifyingKey};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;

use crate::error::{FitCoreError, FitResult};

pub const FIT_MAGIC: [u8; 4] = [0x46, 0x49, 0x54, 0x01];
pub const EOF_MARKER: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];

pub fn generate_ed25519_keypair() -> (SigningKey, VerifyingKey) {
    let mut csprng = rand::thread_rng();
    let mut raw = [0u8; 32];
    csprng.fill_bytes(&mut raw);
    let signing = SigningKey::from_bytes(&raw);
    let verifying = signing.verifying_key();
    (signing, verifying)
}

pub fn generate_master_secret() -> [u8; 32] {
    let mut s = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut s);
    s
}

pub fn derive_layer_key(master_secret: &[u8], layer_id: u8, fit_id: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(fit_id), master_secret);
    let mut okm = [0u8; 32];
    hk.expand(&[layer_id], &mut okm).expect("valid length");
    okm
}

pub fn aes_gcm_encrypt(key: &[u8; 32], plaintext: &[u8]) -> FitResult<(Vec<u8>, [u8; 12])> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let n = Nonce::from_slice(&nonce);
    let ct = cipher
        .encrypt(n, plaintext)
        .map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    Ok((ct, nonce))
}

pub fn aes_gcm_decrypt(key: &[u8; 32], nonce: &[u8; 12], ciphertext: &[u8]) -> FitResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| FitCoreError::Crypto(e.to_string()))?;
    let n = Nonce::from_slice(nonce.as_slice());
    cipher
        .decrypt(n, ciphertext)
        .map_err(|e| FitCoreError::Crypto(e.to_string()))
}

pub fn sign_merkle_root(signing_key: &SigningKey, merkle_root: &[u8; 32]) -> [u8; 64] {
    use ed25519_dalek::Signer;
    signing_key.sign(merkle_root).to_bytes()
}

pub fn verify_merkle_signature(
    verifying_key: &VerifyingKey,
    merkle_root: &[u8; 32],
    sig_bytes: &[u8; 64],
) -> FitResult<()> {
    let sig = Signature::from_slice(sig_bytes).map_err(|_| FitCoreError::VerificationFailed)?;
    verifying_key
        .verify_strict(merkle_root, &sig)
        .map_err(|_| FitCoreError::VerificationFailed)
}

pub fn sign_bytes(signing_key: &SigningKey, message: &[u8]) -> [u8; 64] {
    use ed25519_dalek::Signer;
    signing_key.sign(message).to_bytes()
}

pub fn verify_bytes(
    verifying_key: &VerifyingKey,
    message: &[u8],
    sig_bytes: &[u8; 64],
) -> FitResult<()> {
    let sig = Signature::from_slice(sig_bytes).map_err(|_| FitCoreError::VerificationFailed)?;
    verifying_key
        .verify_strict(message, &sig)
        .map_err(|_| FitCoreError::VerificationFailed)
}
