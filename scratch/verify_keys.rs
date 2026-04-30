use ed25519_dalek::SigningKey;
use x25519_dalek::{StaticSecret, PublicKey};
use hex;

fn main() {
    let ed_seed_hex = "e8e61811148d06904ca539e8e7037ef2ec04ea46f159706054a01f114080f770";
    let x_secret_hex = "4590d23a5351b8d0c7fa8dc7324e7c5812ffb45db0f84eabf1d8053e8bac75fe";

    let ed_seed = hex::decode(ed_seed_hex).unwrap();
    let ed_seed_arr: [u8; 32] = ed_seed.try_into().unwrap();
    let signing_key = SigningKey::from_bytes(&ed_seed_arr);
    println!("Ed25519 pubkey: {}", hex::encode(signing_key.verifying_key().to_bytes()));

    let x_secret = hex::decode(x_secret_hex).unwrap();
    let x_secret_arr: [u8; 32] = x_secret.try_into().unwrap();
    let static_secret = StaticSecret::from(x_secret_arr);
    let public_key = PublicKey::from(&static_secret);
    println!("X25519 pubkey: {}", hex::encode(public_key.as_bytes()));
}
