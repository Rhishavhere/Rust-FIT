# Financial Identity Token (FIT) — Architecture Document

> **Version:** 1.0 — Hackathon Build  
> **Last Updated:** April 2026  
> **Status:** Active — Primary Reference Document

---

## 1. System Overview

FIT is composed of four distinct subsystems that work together:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FIT ECOSYSTEM                                │
│                                                                     │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │  FIT Core Engine │      │  FIT Desktop App │                    │
│  │  (Rust library)  │◄────►│  (Tauri + React) │                    │
│  │                  │      │                  │                    │
│  │  - .fit format   │      │  - Owner dashboard│                   │
│  │  - Crypto ops    │      │  - Investor view  │                   │
│  │  - Delta engine  │      │  - Agent chat UI  │                   │
│  │  - Share envelopes      │  - Connections    │                   │
│  └────────┬─────────┘      └──────────────────┘                    │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │  FIT Relay Server│      │  FIT AI Agent    │                    │
│  │  (Node/Python)   │      │  (Python + LLM)  │                    │
│  │                  │      │                  │                    │
│  │  - WebSocket hub │      │  - Owner agent   │                    │
│  │  - Delta broadcast      │  - Investor agent │                   │
│  │  - Merkle registry      │  - Tool functions │                   │
│  │  - Revocation list      │  - Claude API    │                   │
│  └──────────────────┘      └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. FIT Core Engine (Rust)

The heart of the system. A Rust library (and CLI wrapper) responsible for all cryptographic operations, binary format generation, delta management, and share envelope creation.

### 2.1 Rust Crate Dependencies

```toml
[dependencies]
# Cryptography
ed25519-dalek = "2"           # Ed25519 keypair, signing, verification
aes-gcm = "0.10"              # AES-256-GCM per-layer encryption
chacha20poly1305 = "0.10"     # Alternative AEAD cipher
blake3 = "1"                  # Fast hashing for Merkle tree
sha3 = "0.10"                 # SHA3-256 for delta hashing
x25519-dalek = "2"            # ECDH key exchange for share envelopes
hkdf = "0.12"                 # Key derivation for layer keys

# Serialization & Format
serde = { version = "1", features = ["derive"] }
serde_json = "1"              # Internal use only, not the .fit format
bincode = "2"                 # Binary serialization for .fit format
zstd = "0.13"                 # Compression before encryption

# Utilities
uuid = { version = "1", features = ["v7"] }   # UUID v7 for FIT IDs
chrono = { version = "0.4", features = ["serde"] }
hex = "0.4"
rand = "0.8"
thiserror = "1"
anyhow = "1"

# CLI wrapper
clap = { version = "4", features = ["derive"] }
```

### 2.2 The `.fit` Binary Format

The `.fit` file is a custom binary format. It is NOT JSON. Structure:

```
MAGIC BYTES:    4 bytes  [0x46 0x49 0x54 0x01]  = "FIT\x01"
HEADER LENGTH:  4 bytes  (u32 LE)
HEADER:         N bytes  (bincode serialized FitHeader, unencrypted)
MERKLE ROOT:    32 bytes (BLAKE3 hash of all layer ciphertexts)
LAYER COUNT:    1 byte   (how many layers follow)
LAYERS:         variable (each layer = length prefix + encrypted blob)
DELTA COUNT:    4 bytes  (u32 LE)
DELTA LOG:      variable (each delta = length prefix + signed delta blob)
SIG LENGTH:     2 bytes  (u16 LE)
SIGNATURE:      64 bytes (Ed25519 signature of Merkle root by owner)
EOF MARKER:     4 bytes  [0xFF 0xFF 0xFF 0xFF]
```

#### FitHeader (Rust struct, bincode serialized, unencrypted)

```rust
#[derive(Serialize, Deserialize)]
pub struct FitHeader {
    pub magic: [u8; 4],                    // [0x46, 0x49, 0x54, 0x01]
    pub fit_id: [u8; 16],                  // UUID v7 bytes
    pub version: u16,                      // FIT format version (currently 1)
    pub created_at: i64,                   // Unix timestamp
    pub updated_at: i64,                   // Unix timestamp of last delta
    pub owner_pubkey: [u8; 32],            // Ed25519 public key
    pub fit_score: u16,                    // 0–1000 computed score
    pub capability_flags: u8,             // Bitmask: which layers exist
    pub display_name: String,             // Owner's display name (public)
    pub delta_count: u32,                  // Total deltas applied
}
```

#### Layer Structure

```rust
#[derive(Serialize, Deserialize)]
pub struct EncryptedLayer {
    pub layer_id: u8,                      // 1–6
    pub nonce: [u8; 12],                   // AES-GCM nonce
    pub ciphertext: Vec<u8>,               // Encrypted + compressed layer data
    pub ciphertext_hash: [u8; 32],         // BLAKE3 hash (for Merkle tree)
}
```

Each layer's plaintext is:
1. Serialized as JSON (layer-specific struct)
2. Compressed with zstd
3. Encrypted with AES-256-GCM using a layer-specific key

#### Layer Key Derivation

The owner has a master secret key. Layer keys are derived using HKDF:

```rust
fn derive_layer_key(master_secret: &[u8], layer_id: u8, fit_id: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(fit_id), master_secret);
    let mut okm = [0u8; 32];
    hk.expand(&[layer_id], &mut okm).unwrap();
    okm
}
```

This means each layer has a distinct key. Sharing Layer 2 means giving the recipient Layer 2's derived key — other layer keys remain unknown to them.

#### Merkle Root Construction

```rust
fn compute_merkle_root(layers: &[EncryptedLayer]) -> [u8; 32] {
    // Leaf nodes = BLAKE3 hash of each layer's ciphertext
    let leaves: Vec<[u8; 32]> = layers.iter()
        .map(|l| blake3::hash(&l.ciphertext).into())
        .collect();
    // Build Merkle tree upward, return root
    merkle_root(leaves)
}
```

The owner signs the Merkle root with their Ed25519 private key. Any tampering with any layer changes the root, which breaks the signature — immediately detectable.

### 2.3 Delta Log

Each delta is an append-only entry:

```rust
#[derive(Serialize, Deserialize)]
pub struct FitDelta {
    pub delta_id: u32,                     // Sequential ID
    pub timestamp: i64,                    // Unix timestamp
    pub layer_affected: u8,                // Which layer (1–6)
    pub delta_type: DeltaType,             // Add / Update / Attest
    pub summary: String,                   // Human-readable: "CIBIL 730→752"
    pub patch: Vec<u8>,                    // Compressed JSON patch (RFC 6902)
    pub attester: AttesterType,            // Owner / Bureau / GSTN / etc.
    pub attester_pubkey: [u8; 32],         // Public key of attesting party
    pub signature: [u8; 64],              // Attester's Ed25519 signature over patch
}

pub enum DeltaType {
    Add,           // New data added to layer
    Update,        // Existing data updated
    Attest,        // External party attested existing data
    Revoke,        // Share revoked
}

pub enum AttesterType {
    Owner,
    CibilBureau,
    GstnPortal,
    IncomeTaxPortal,
    McaPortal,
    BankAA,        // Account Aggregator
    ZerodhaKite,
    ManualCA,
}
```

### 2.4 Share Envelope Format

When sharing, the FIT Engine generates a Share Envelope — a separate `.fit` file (extension `.fitshare`) containing only the permitted layers, re-encrypted for the recipient.

```rust
#[derive(Serialize, Deserialize)]
pub struct FitShareEnvelope {
    pub envelope_id: [u8; 16],            // UUID v7
    pub source_fit_id: [u8; 16],          // Original FIT ID
    pub owner_pubkey: [u8; 32],           // Owner's public key
    pub recipient_pubkey: [u8; 32],       // Recipient's public key
    pub permitted_layers: Vec<u8>,        // Which layers [2,3,4]
    pub expires_at: i64,                  // Unix timestamp
    pub live_tracking: bool,              // Whether recipient gets delta updates
    pub created_at: i64,
    pub ephemeral_pubkey: [u8; 32],       // For ECDH key exchange
    pub encrypted_layer_keys: Vec<u8>,   // Layer keys encrypted via ECDH
    pub layers: Vec<EncryptedLayer>,      // Re-encrypted for recipient
    pub owner_signature: [u8; 64],        // Owner signs the whole envelope
}
```

#### Share Envelope Key Exchange (ECDH)

```
1. Owner generates ephemeral X25519 keypair (ephem_pub, ephem_priv)
2. shared_secret = ECDH(ephem_priv, recipient_pubkey)
3. encryption_key = HKDF(shared_secret, "FIT-SHARE-v1")
4. Layer keys for permitted layers encrypted with encryption_key
5. ephem_pub included in envelope (recipient uses it for ECDH on their side)
6. Recipient: shared_secret = ECDH(recipient_priv, ephem_pub) → derives same encryption_key → decrypts layer keys → decrypts layers
```

No server ever sees the layer keys. This is end-to-end encrypted by construction.

### 2.5 CLI Interface

```bash
# Key management
fit keygen                              # Generate Ed25519 keypair, save to ~/.fit/keys/
fit pubkey                              # Print your public key

# FIT generation (demo: from sample data)
fit generate --persona priya            # Generate Priya's sample FIT
fit generate --from-data data.json     # Generate from structured JSON input

# Inspection (no decryption needed for header)
fit inspect priya.fit                   # Show header, FIT ID, score, layer count, delta count
fit verify priya.fit                    # Verify owner signature over Merkle root

# Full operations (require private key)
fit open priya.fit                      # Decrypt and display full FIT as JSON
fit diff priya.fit --from 2026-01-01   # Show deltas since date

# Sharing
fit share priya.fit \
  --layers 2,3 \
  --recipient <recipient_pubkey_hex> \
  --expires 30d \
  --live-tracking \
  --out priya_share.fitshare

# Receiving
fit open priya_share.fitshare           # Decrypt share envelope with own private key

# Delta operations
fit apply-delta priya.fit \
  --layer 3 \
  --patch '{"op":"replace","path":"/equity/total","value":785000}' \
  --summary "Sold 100 Reliance shares"

# Relay
fit push priya.fit                      # Push latest Merkle root to relay
fit pull <fit_id>                       # Pull latest deltas from relay
```

### 2.6 Layer Data Schemas (Plaintext before encryption)

#### Layer 1 — Identity Core

```json
{
  "pan": "ABCDE1234F",
  "pan_masked": "XXXXX1234F",
  "aadhaar_hash": "sha3_256_of_aadhaar",
  "dob": "1992-04-15",
  "full_name": "Priya Sharma",
  "address": {
    "line1": "12 Koramangala 5th Block",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560095"
  },
  "kyc_status": "verified",
  "kyc_verified_by": "Aadhaar eKYC",
  "kyc_date": "2023-08-12",
  "nationality": "Indian",
  "photo_hash": "blake3_hash_of_photo"
}
```

#### Layer 2 — Credit & Trust

```json
{
  "cibil_score": 752,
  "cibil_score_history": [
    {"month": "2025-05", "score": 730},
    {"month": "2025-06", "score": 734},
    {"month": "2025-07", "score": 739},
    {"month": "2025-08", "score": 741},
    {"month": "2025-09", "score": 745},
    {"month": "2025-10", "score": 748},
    {"month": "2025-11", "score": 750},
    {"month": "2025-12", "score": 750},
    {"month": "2026-01", "score": 751},
    {"month": "2026-02", "score": 751},
    {"month": "2026-03", "score": 752},
    {"month": "2026-04", "score": 752}
  ],
  "active_loans": [
    {
      "type": "Personal Loan",
      "lender": "HDFC Bank",
      "original_amount": 800000,
      "outstanding": 560000,
      "emi_monthly": 68000,
      "months_remaining": 14,
      "status": "active"
    }
  ],
  "closed_loans": [],
  "total_outstanding": 560000,
  "total_emi_monthly": 68000,
  "credit_cards": [
    {
      "bank": "ICICI Bank",
      "limit": 200000,
      "outstanding": 82000,
      "utilization_pct": 41
    }
  ],
  "overall_credit_utilization_pct": 61,
  "defaults": 0,
  "enquiries_last_6m": 1
}
```

#### Layer 3 — Assets

```json
{
  "real_estate": [
    {
      "type": "Apartment",
      "city": "Bengaluru",
      "area_sqft": 1100,
      "estimated_value": 6800000,
      "loan_linked": false,
      "acquisition_year": 2021
    }
  ],
  "equity_portfolio": {
    "total_value": 900000,
    "holdings": [
      {"name": "Reliance Industries", "value": 280000, "weight_pct": 31},
      {"name": "Infosys", "value": 195000, "weight_pct": 22},
      {"name": "HDFC Bank", "value": 162000, "weight_pct": 18},
      {"name": "TCS", "value": 144000, "weight_pct": 16},
      {"name": "Others", "value": 119000, "weight_pct": 13}
    ]
  },
  "mutual_funds": {
    "total_nav": 1400000,
    "funds": [
      {"name": "Mirae Asset Large Cap", "nav": 680000},
      {"name": "Parag Parikh Flexi Cap", "nav": 720000}
    ]
  },
  "fixed_deposits": [
    {"bank": "SBI", "amount": 200000, "maturity": "2026-11-30"}
  ],
  "gold": {"grams": 0, "value": 0},
  "bank_balance_range": "500000-1000000",
  "total_assets": 9300000,
  "total_liabilities": 560000,
  "net_worth": 8740000
}
```

#### Layer 4 — Business & Income

```json
{
  "itr": [
    {"fy": "2022-23", "income": 1100000, "tax_paid": 168000, "filed": true},
    {"fy": "2023-24", "income": 1550000, "tax_paid": 284000, "filed": true},
    {"fy": "2024-25", "income": 1800000, "tax_paid": 342000, "filed": true}
  ],
  "business": {
    "name": "Priya Tech Solutions Pvt Ltd",
    "cin": "U72900KA2020PTC123456",
    "type": "Private Limited",
    "incorporation_date": "2020-09-01",
    "gstin": "29ABCDE1234F1Z5",
    "gst_status": "active",
    "gst_quarterly_turnover": [
      {"quarter": "Q1 FY25", "turnover": 2800000},
      {"quarter": "Q2 FY25", "turnover": 3100000},
      {"quarter": "Q3 FY25", "turnover": 3400000},
      {"quarter": "Q4 FY25", "turnover": 3700000}
    ],
    "director_in": ["Priya Tech Solutions Pvt Ltd"],
    "mca_compliance": "clean",
    "last_annual_return": "2025-09-30"
  },
  "employment_status": "founder"
}
```

#### Layer 5 — Behavioral / Track Record

```json
{
  "investments": [
    {
      "startup": "HealthAI Pvt Ltd",
      "stage": "Seed",
      "amount": 1500000,
      "date": "2023-06-15",
      "sector": "HealthTech",
      "current_status": "active"
    },
    {
      "startup": "AgriLink Technologies",
      "stage": "Pre-Seed",
      "amount": 500000,
      "date": "2024-02-10",
      "sector": "AgriTech",
      "current_status": "active"
    }
  ],
  "total_deployed": 2000000,
  "investment_count": 2,
  "avg_ticket_size": 1000000,
  "sectors": ["HealthTech", "AgriTech"],
  "trading_volume_monthly": [
    {"month": "2025-11", "volume": 0},
    {"month": "2025-12", "volume": 0},
    {"month": "2026-01", "volume": 45000},
    {"month": "2026-02", "volume": 38000},
    {"month": "2026-03", "volume": 52000},
    {"month": "2026-04", "volume": 29000}
  ],
  "portfolio_churn_rate_pct": 12
}
```

#### Layer 6 — Reputation & Attestations

```json
{
  "fit_age_days": 384,
  "fit_share_count": 3,
  "active_shares": 1,
  "endorsements": [],
  "attestations": [
    {"type": "KYC", "attester": "Aadhaar eKYC", "date": "2023-08-12", "valid": true},
    {"type": "CIBIL", "attester": "TransUnion CIBIL", "date": "2026-04-01", "valid": true},
    {"type": "GST", "attester": "GSTN Portal", "date": "2026-04-15", "valid": true},
    {"type": "ITR", "attester": "Income Tax Portal", "date": "2026-03-31", "valid": true}
  ],
  "access_log_summary": {
    "total_accesses": 7,
    "unique_accessors": 2,
    "last_accessed": "2026-04-28T14:32:00Z"
  }
}
```

---

## 3. FIT Relay Server

A lightweight server whose sole purpose is delta broadcasting and Merkle root registry. It stores **zero plaintext financial data**.

### 3.1 What the Relay Stores

```
FIT Registry table:
  fit_id          UUID
  owner_pubkey    bytes(32)
  merkle_root     bytes(32)       ← hash only, no raw data
  updated_at      timestamp
  share_keys      JSON            ← active share key list
  revoked_keys    JSON            ← revoked share key list

Delta Queue table:
  fit_id          UUID
  delta_id        u32
  layer_affected  u8
  encrypted_blob  bytes           ← encrypted for each share recipient
  timestamp       timestamp
  delivered_to    JSON            ← which share keys have received this delta
```

The relay cannot read any delta blob — they are encrypted for specific recipients. The relay is a dumb message bus with a registry.

### 3.2 WebSocket Protocol

```
CLIENT → SERVER: SUBSCRIBE {fit_id, share_key_id, timestamp}
SERVER → CLIENT: DELTA {fit_id, delta_id, encrypted_blob}
SERVER → CLIENT: REVOKED {fit_id, share_key_id}
SERVER → CLIENT: MERKLE_UPDATED {fit_id, new_merkle_root}

OWNER → SERVER: PUSH_DELTA {fit_id, delta_id, encrypted_blobs_per_recipient}
OWNER → SERVER: PUSH_MERKLE {fit_id, new_merkle_root, owner_signature}
OWNER → SERVER: REVOKE {fit_id, share_key_id, owner_signature}
```

### 3.3 Hackathon Implementation

For the demo, a simple Python WebSocket server (using `websockets` library) running locally. No database needed — in-memory dict is sufficient. 20–30 lines of server code.

```python
# relay_server.py (simplified)
import asyncio, websockets, json

subscribers = {}  # fit_id -> [websocket connections]
delta_queues = {}  # fit_id -> [deltas]

async def handler(websocket, path):
    msg = json.loads(await websocket.recv())
    if msg["type"] == "SUBSCRIBE":
        fit_id = msg["fit_id"]
        subscribers.setdefault(fit_id, []).append(websocket)
        # Send any missed deltas
        for delta in delta_queues.get(fit_id, []):
            await websocket.send(json.dumps(delta))
    elif msg["type"] == "PUSH_DELTA":
        fit_id = msg["fit_id"]
        delta_queues.setdefault(fit_id, []).append(msg)
        for ws in subscribers.get(fit_id, []):
            await ws.send(json.dumps(msg))

asyncio.run(websockets.serve(handler, "localhost", 8765))
```

### 3.4 Production Architecture (Tell Judges)

In production: relay runs as a distributed service, delta blobs are stored encrypted in S3 or IPFS, Merkle roots are anchored to a public blockchain (Polygon/Ethereum) for global verifiability without centralized trust.

---

## 4. FIT Desktop App (Tauri + React)

The user-facing application. Built with Tauri — Rust backend for all FIT Engine operations, React frontend for the UI.

### 4.1 Why Tauri

- Rust backend calls the FIT Core Engine library directly (same process, no IPC overhead for crypto)
- React frontend for the rich dashboard UI
- Cross-platform native app
- File system access for reading/writing `.fit` files
- Small binary size, fast startup

### 4.2 App Screens

**1. Home / Identity Screen**
- Your own FIT dashboard (owner view)
- FIT Score hero display
- 4 stat cards: Net Worth, CIBIL Score, Active Businesses, Investments Made
- Asset allocation donut chart
- Credit score trend line (12 months)
- Income bar chart (3 years ITR)
- Delta feed / evolution timeline (right panel)
- Access log (who has your FIT)

**2. Layer Explorer**
- Sidebar with layers 1–6
- Click a layer to see its full decrypted data
- Visual indicators for attestation status (green checkmark = attested by external source)

**3. Share Manager**
- List of active shares with recipient names, permitted layers, expiry, live tracking status
- "Share FIT" button → opens share creation flow (select layers, set expiry, paste recipient pubkey)
- Revoke button per share
- Per-share access log

**4. Connections Panel**
- List of connected services (Zerodha, CIBIL, GSTN, etc.)
- Sync button per service (demo: triggers simulated API call → generates delta)
- Last synced timestamp per service
- "Add Connection" for new services

**5. Investor View (open a .fitshare file)**
- Drag and drop a `.fitshare` file
- App decrypts with user's private key
- Same dashboard layout but shows only permitted layers
- Greyed out / locked indicators for non-permitted layers
- Agent chat panel on the right side

**6. Agent Chat**
- Full-width chat interface (right panel or dedicated screen)
- Message input at bottom
- Conversation history above
- Tool call indicators when agent executes FIT operations ("Querying asset layer...", "Computing net worth...")
- Seamlessly switches between owner agent (on your own FIT) and investor agent (on a received FIT)

### 4.3 Demo Trigger Buttons (Owner Dashboard)

Five pre-built action buttons visible in the demo, each simulating a real-world financial event:

```
[Sell 100 Reliance]    [Open FD ₹2L]    [Refresh CIBIL]    [File GST Return]    [New Investment]
```

Each button:
1. Calls Rust FIT Engine to create and sign a delta
2. Updates the local FIT file
3. Pushes delta to relay via WebSocket
4. Updates the owner dashboard visually with animation
5. Within 2–3 seconds: investor dashboard (on second screen) updates automatically

### 4.4 Tauri Command Interface

```rust
// src-tauri/src/commands.rs

#[tauri::command]
async fn open_fit(path: String, private_key_hex: String) -> Result<FitData, String>

#[tauri::command]
async fn open_share_envelope(path: String, private_key_hex: String) -> Result<FitData, String>

#[tauri::command]
async fn apply_delta(fit_path: String, delta: DeltaInput, private_key_hex: String) -> Result<DeltaResult, String>

#[tauri::command]
async fn create_share(fit_path: String, share_config: ShareConfig, private_key_hex: String) -> Result<String, String>

#[tauri::command]
async fn revoke_share(fit_path: String, share_key_id: String, private_key_hex: String) -> Result<(), String>

#[tauri::command]
async fn push_to_relay(fit_id: String, delta: DeltaResult) -> Result<(), String>

#[tauri::command]
async fn generate_sample_fit(persona: String, output_path: String) -> Result<(), String>
```

---

## 5. AI Agent Layer

### 5.1 Architecture

```
User message (in app)
      │
      ▼
Agent Orchestrator (Python process, called from Tauri via sidecar)
      │
      ├── Materializes FIT data from .fit binary (calls Rust engine via FFI or subprocess)
      │   → Decrypted JSON representation of all accessible layers
      │
      ├── Builds system prompt with FIT data injected
      │
      ├── Calls Claude API (claude-sonnet-4-20250514)
      │   with: system prompt + conversation history + tool definitions
      │
      ├── If tool call returned:
      │   → Executes tool (reads layer, computes, modifies FIT, calls relay)
      │   → Feeds tool result back to Claude
      │   → Claude generates final response
      │
      └── Returns response text to frontend
```

### 5.2 System Prompts

**Owner Agent System Prompt:**

```
You are the personal FIT Agent for {owner_name}. FIT stands for Financial Identity Token — a cryptographically signed, living financial identity.

You have full access to {owner_name}'s financial data. Here is their complete FIT data:

<fit_data>
{serialized_fit_json}
</fit_data>

You help {owner_name} understand their financial identity, manage who has access to it, simulate changes, and share it with others.

Be direct, accurate, and use Indian financial context (₹, CIBIL scores, GST, ITR, etc.).
Never reveal data you haven't been given. If asked about something not in the FIT, say so.
When taking actions (sharing, revoking, simulating), always confirm with the user before executing.
```

**Investor Agent System Prompt:**

```
You are a financial analyst agent. You hold the following FIT (Financial Identity Token) data for people who have shared their financial identities with your user:

{for each held FIT:}
<fit_{fit_id}>
Owner: {display_name}
Permitted layers: {layer_list}
Data: {serialized_fit_json}
Expires: {expiry_date}
</fit_{fit_id}>

You help your user evaluate, compare, and track the financial profiles of people who have shared their FIT with them. You can only see what each person has permitted.

Be analytical, flag risks, make comparisons when asked. Use Indian financial context.
Never fabricate data. Never claim to see data from unpermitted layers.
```

### 5.3 Tool Definitions (for Claude API)

```python
tools = [
    {
        "name": "fit_read_layer",
        "description": "Read a specific layer of the FIT by layer ID (1=Identity, 2=Credit, 3=Assets, 4=Business, 5=Behavioral, 6=Reputation)",
        "input_schema": {
            "type": "object",
            "properties": {
                "layer_id": {"type": "integer", "minimum": 1, "maximum": 6},
                "fit_id": {"type": "string", "description": "FIT ID if querying a specific held FIT"}
            },
            "required": ["layer_id"]
        }
    },
    {
        "name": "fit_compute_networth",
        "description": "Compute total net worth from asset and liability data",
        "input_schema": {
            "type": "object",
            "properties": {
                "fit_id": {"type": "string"}
            }
        }
    },
    {
        "name": "fit_simulate_delta",
        "description": "Simulate a change to the FIT without committing it. Returns hypothetical new state.",
        "input_schema": {
            "type": "object",
            "properties": {
                "layer_id": {"type": "integer"},
                "change_description": {"type": "string"},
                "change_patch": {"type": "object"}
            },
            "required": ["layer_id", "change_description", "change_patch"]
        }
    },
    {
        "name": "fit_share",
        "description": "Create a share envelope to give someone access to specific FIT layers",
        "input_schema": {
            "type": "object",
            "properties": {
                "layers": {"type": "array", "items": {"type": "integer"}},
                "recipient_pubkey": {"type": "string"},
                "expiry_days": {"type": "integer"},
                "live_tracking": {"type": "boolean"}
            },
            "required": ["layers", "recipient_pubkey", "expiry_days"]
        }
    },
    {
        "name": "fit_revoke",
        "description": "Revoke a previously granted share",
        "input_schema": {
            "type": "object",
            "properties": {
                "share_id": {"type": "string"}
            },
            "required": ["share_id"]
        }
    },
    {
        "name": "fit_compare",
        "description": "Compare multiple FITs held by the investor. Returns side-by-side analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "fit_ids": {"type": "array", "items": {"type": "string"}},
                "compare_on": {"type": "array", "items": {"type": "string"}, "description": "Dimensions to compare: networth, cibil, debt, income, etc."}
            },
            "required": ["fit_ids"]
        }
    },
    {
        "name": "fit_diff",
        "description": "Show what changed in a FIT between two dates",
        "input_schema": {
            "type": "object",
            "properties": {
                "fit_id": {"type": "string"},
                "from_date": {"type": "string", "format": "date"},
                "to_date": {"type": "string", "format": "date"}
            },
            "required": ["from_date"]
        }
    },
    {
        "name": "fit_get_access_log",
        "description": "Get the access log — who has accessed this FIT, when, and which layers",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "fit_draft_memo",
        "description": "Draft a due diligence or investment memo for a person based on their FIT data",
        "input_schema": {
            "type": "object",
            "properties": {
                "fit_id": {"type": "string"},
                "memo_type": {"type": "string", "enum": ["investment", "credit", "partnership"]}
            },
            "required": ["fit_id", "memo_type"]
        }
    }
]
```

### 5.4 Agent Communication with Tauri

The agent runs as a Python sidecar process. Tauri communicates via stdin/stdout JSON protocol:

```
Tauri → Agent: {"action": "chat", "message": "...", "fit_data": {...}, "history": [...]}
Agent → Tauri: {"response": "...", "tool_calls": [...], "fit_mutations": [...]}
```

If `fit_mutations` is non-empty, Tauri calls the Rust FIT Engine to apply the changes and push deltas.

---

## 6. Full System Data Flow

### 6.1 FIT Generation (First Time)

```
1. User runs: fit generate --persona priya
2. Rust CLI generates Ed25519 keypair → saves to ~/.fit/keys/priya.key
3. Sample data loaded from persona definition (hardcoded for demo)
4. Each layer serialized → compressed (zstd) → encrypted (AES-256-GCM with derived layer key)
5. Merkle root computed over all layer ciphertexts (BLAKE3)
6. Header built with FIT Score computed from layer data
7. Owner signs Merkle root with Ed25519 private key
8. All components assembled into .fit binary format
9. File written to disk: priya.fit
```

### 6.2 Delta Update Flow (Live Sync)

```
1. User clicks "Sell 100 Reliance" in app
2. Tauri calls Rust: apply_delta(fit_path, delta_input, private_key)
3. Rust FIT Engine:
   a. Reads current Layer 3 (assets)
   b. Applies JSON patch (reduces Reliance holding)
   c. Recomputes Layer 3 ciphertext
   d. Recomputes Merkle root
   e. Re-signs with owner key
   f. Appends delta to delta log
   g. Writes updated .fit to disk
4. Tauri calls Rust: push_to_relay(fit_id, delta)
5. Rust sends PUSH_DELTA to WebSocket relay (encrypted delta blob for each active share recipient)
6. Relay broadcasts DELTA message to all subscribed clients with this fit_id
7. Investor's app receives WebSocket message
8. Investor's Tauri calls Rust: apply_received_delta(fit_path, delta_blob, layer_key)
9. Rust verifies delta signature, applies patch, recomputes Merkle root
10. Investor's dashboard re-renders with new data (React state update)
11. Delta feed notification appears: "Priya's FIT updated — Asset layer changed"
```

### 6.3 Share & Unenvelope Flow

```
SHARING SIDE:
1. User clicks "Share FIT" → selects layers [2,3], expiry 30d, live tracking ON
2. Tauri calls Rust: create_share(fit_path, share_config, private_key)
3. Rust:
   a. Generates ephemeral X25519 keypair
   b. ECDH with recipient's pubkey → shared_secret → HKDF → encryption_key
   c. Encrypts layer keys [2,3] with encryption_key
   d. Copies Layer 2 and Layer 3 encrypted blobs into envelope
   e. Builds FitShareEnvelope struct
   f. Owner signs the envelope
   g. Writes priya_share.fitshare to disk
4. User sends .fitshare file to recipient (out of band — email, Airdrop, etc.)
5. Relay notified: this share_key_id is now active for this fit_id

RECEIVING SIDE:
1. Recipient drags priya_share.fitshare into their FIT app
2. App prompts: "Decrypt with your private key"
3. Tauri calls Rust: open_share_envelope(path, recipient_private_key)
4. Rust:
   a. Parses FitShareEnvelope
   b. Verifies owner signature
   c. ECDH with ephemeral_pubkey → same shared_secret → decrypts layer keys
   d. Decrypts permitted layers with layer keys
   e. Materializes FIT data as JSON
5. App subscribes to fit_id on WebSocket relay with this share_key_id
6. Dashboard populates — unenveloping animation plays
7. Non-permitted layers show as locked/greyed in UI
```

---

## 7. Repository Structure

```
fit/
├── fit-core/                    # Rust library — the FIT Engine
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # Public API
│       ├── format.rs            # .fit binary format (read/write)
│       ├── crypto.rs            # All cryptographic operations
│       ├── delta.rs             # Delta creation, signing, application
│       ├── share.rs             # Share envelope creation and opening
│       ├── merkle.rs            # Merkle tree construction
│       ├── score.rs             # FIT Score computation
│       ├── layers/
│       │   ├── mod.rs
│       │   ├── layer1.rs        # Identity Core schema
│       │   ├── layer2.rs        # Credit & Trust schema
│       │   ├── layer3.rs        # Assets schema
│       │   ├── layer4.rs        # Business & Income schema
│       │   ├── layer5.rs        # Behavioral schema
│       │   └── layer6.rs        # Reputation schema
│       └── personas/
│           ├── mod.rs
│           ├── priya.rs         # Priya Sharma sample data
│           ├── rajiv.rs         # Rajiv Menon sample data
│           ├── arjun.rs         # Arjun Nair sample data
│           └── fatima.rs        # Fatima Sheikh sample data
│
├── fit-cli/                     # Rust CLI binary
│   ├── Cargo.toml
│   └── src/
│       └── main.rs              # CLI commands (fit generate, inspect, share, etc.)
│
├── fit-relay/                   # WebSocket relay server
│   ├── requirements.txt
│   └── relay_server.py          # 30-line WebSocket relay
│
├── fit-agent/                   # Python AI agent
│   ├── requirements.txt
│   ├── agent.py                 # Main agent orchestrator
│   ├── tools.py                 # Tool function implementations
│   ├── prompts.py               # System prompt templates
│   └── bridge.py                # Tauri sidecar stdin/stdout bridge
│
├── fit-app/                     # Tauri desktop application
│   ├── package.json
│   ├── src/                     # React frontend
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Owner FIT dashboard
│   │   │   ├── InvestorView.tsx # Received .fitshare view
│   │   │   ├── LayerExplorer.tsx
│   │   │   ├── ShareManager.tsx
│   │   │   ├── Connections.tsx
│   │   │   └── AgentChat.tsx
│   │   ├── components/
│   │   │   ├── FitScoreHero.tsx
│   │   │   ├── StatCards.tsx
│   │   │   ├── AssetDonut.tsx
│   │   │   ├── CreditTrendLine.tsx
│   │   │   ├── IncomeBarChart.tsx
│   │   │   ├── DeltaFeed.tsx
│   │   │   ├── PortfolioTable.tsx
│   │   │   ├── LayerCard.tsx
│   │   │   └── DemoTriggers.tsx  # The 5 demo action buttons
│   │   └── lib/
│   │       ├── websocket.ts     # WebSocket relay client
│   │       └── tauri.ts         # Tauri command wrappers
│   └── src-tauri/               # Rust Tauri backend
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           └── commands.rs      # Tauri command handlers
│
└── README.md
```

---

## 8. Build Order for Hackathon

Build in this exact sequence to always have something demoable:

**Phase 1 — Core (Do First)**
1. `fit-core`: Layer structs + persona sample data hardcoded
2. `fit-core`: Binary format writer (genesis FIT generation)
3. `fit-core`: Crypto (key generation, layer encryption, signing)
4. `fit-cli`: `fit generate --persona X` command
5. `fit-cli`: `fit inspect` and `fit verify` commands

At end of Phase 1: you can generate and inspect real `.fit` files from terminal. Impressive on its own.

**Phase 2 — Dashboard**
6. `fit-app`: Basic Tauri setup + React scaffold
7. `fit-app`: Open FIT file → materialize JSON → display in dashboard
8. `fit-app`: All dashboard components (donut, trend line, stat cards, tables)
9. `fit-app`: Delta feed panel with static deltas from delta log

At end of Phase 2: you can open a `.fit` file and see a rich dashboard.

**Phase 3 — Live Sync**
10. `fit-relay`: WebSocket relay server (30 lines)
11. `fit-core`: Delta creation and application
12. `fit-app`: Demo trigger buttons → create delta → push to relay
13. `fit-app`: WebSocket client → receive delta → re-render dashboard

At end of Phase 3: live sync across two windows works. This is the mic drop moment.

**Phase 4 — Sharing**
14. `fit-core`: Share envelope creation and opening
15. `fit-app`: Share Manager screen + share creation flow
16. `fit-app`: Investor view (open .fitshare, greyed layers, unenveloping animation)

**Phase 5 — Agent (Wire Last)**
17. `fit-agent`: Agent orchestrator + Claude API integration
18. `fit-agent`: All tool function implementations
19. `fit-app`: Agent chat UI panel
20. `fit-app`: Tauri sidecar bridge to Python agent

---

## 9. Technology Stack Summary

| Component | Technology | Reason |
|-----------|-----------|--------|
| FIT Engine | Rust | Cryptographic correctness, binary format, real CLI tool |
| Crypto | ed25519-dalek, aes-gcm, blake3, x25519-dalek | Industry standard, audited |
| Serialization | bincode (binary), serde_json (internal) | Non-JSON binary format |
| Compression | zstd | Best ratio for structured data |
| Desktop App | Tauri (Rust + React) | Native feel, Rust backend, React UI |
| UI Charts | Recharts or Tremor | Clean financial chart components |
| Relay Server | Python + websockets | 30 lines, zero complexity |
| AI Agent | Python + Anthropic Claude API | Natural language over FIT data |
| Agent Framework | Direct Claude API with tools | Clean, no LangChain overhead |
| Styling | Tailwind CSS | Dark theme, green accents matching reference design |

---

## 10. Security Model Summary

| Threat | Mitigation |
|--------|-----------|
| Relay server compromised | Relay stores only encrypted blobs and Merkle roots — zero plaintext |
| .fit file stolen | AES-256-GCM encryption per layer — useless without layer keys |
| Share file intercepted | ECDH share envelopes — only recipient's private key can decrypt |
| Data tampered | Ed25519 signature over Merkle root — any tampering breaks verification |
| Delta forged | Each delta signed by attesting party — unsigned deltas rejected |
| Access not revoked | Revocation pushed to relay — enforced at WebSocket subscription level |
| Replay attack | UUID v7 (time-ordered) + timestamp in every delta — ordering enforced |
