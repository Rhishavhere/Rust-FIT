import binascii
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519

# Seeds from rajiv.keys.json
ed_seed_hex = "e8e61811148d06904ca539e8e7037ef2ec04ea46f159706054a01f114080f770"
x_secret_hex = "4590d23a5351b8d0c7fa8dc7324e7c5812ffb45db0f84eabf1d8053e8bac75fe"

ed_seed = binascii.unhexlify(ed_seed_hex)
x_secret = binascii.unhexlify(x_secret_hex)

# Derive Ed25519 public key
ed_priv = ed25519.Ed25519PrivateKey.from_private_bytes(ed_seed)
ed_pub = ed_priv.public_key().public_bytes_raw()
print(f"Derived Ed25519 pubkey: {binascii.hexlify(ed_pub).decode()}")

# Derive X25519 public key
x_priv = x25519.X25519PrivateKey.from_private_bytes(x_secret)
x_pub = x_priv.public_key().public_bytes_raw()
print(f"Derived X25519 pubkey: {binascii.hexlify(x_pub).decode()}")
