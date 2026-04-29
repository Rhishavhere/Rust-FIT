pub fn leaf_from_ciphertext(ciphertext: &[u8]) -> [u8; 32] {
    *blake3::hash(ciphertext).as_bytes()
}

/// Binary Merkle root over ciphertext leaves (Architecture §2.2).
pub fn merkle_root(mut leaves: Vec<[u8; 32]>) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    while leaves.len() > 1 {
        let mut next = Vec::new();
        let mut i = 0;
        while i < leaves.len() {
            let left = leaves[i];
            let right = if i + 1 < leaves.len() {
                leaves[i + 1]
            } else {
                leaves[i]
            };
            let mut hasher = blake3::Hasher::new();
            hasher.update(&left);
            hasher.update(&right);
            next.push(*hasher.finalize().as_bytes());
            i += 2;
        }
        leaves = next;
    }
    leaves[0]
}
