# FIT User Guide

A simple explanation of **Financial Identity Token (FIT)** — what the files mean, how the pieces fit together, and **every CLI command** with options and examples.

For a **hands-on demo** (two laptops, relay), see **`docs/Demo.md`**. For deeper product and crypto design detail, see **`docs/Product.md`** and **`docs/Architecture.md`**.

---

## What FIT Is (plain language)

FIT is a **single binary file**, usually named something like **`my-token.fit`**, that holds structured financial‑identity style data broken into **layers** (different “planes” of your profile). Each layer’s payload is encrypted; the token carries a cryptographic **signature** over the Merkle summary so others can detect tampering.

- **Owner** holds a **secret key bundle** (JSON file) so they can **decrypt all layers**, **sign updates**, and **create envelopes** for recipients.
- **Recipient** receives a **`*.fitshare` file** containing only **the layers you allow**, encrypted for **their** key. They cannot recover your full `.fit` or your master secret from that envelope alone.

The **Rust CLI** (`fit-cli`) is the command-line toolbox for lifecycle operations: mint a demo identity, inspect, verify, decrypt, patch, and export shares.

---

## Main Artifacts You Will See

| Artifact | What it is |
|----------|------------|
| **`*.fit`** | Full owner token — all layers committed in the blob, signed chain of **deltas** can grow over time. |
| **`*.keys.json`** | JSON key bag: signing seed (Ed25519), optional **master secret** (needed to decrypt/update owner `.fit`), X25519 static secret — **treat like a wallet backup**. |
| **`*.fitshare`** | Selective share **envelope** for one recipient (`--recipient` pubkey), subset of layers, optional expiry and live-tracking hints. |

**Rules of thumb:**

- Never share **`master_secret_hex`** or the **owner** `*.keys.json` with an investor unless you deliberately mean to hand them full owner power.
- You **may** safely transfer **`.fitshare`** through an agreed channel; it is bounded by **which layers you included**.

---

## Running the CLI

From the repository root:

```powershell
cargo run -p fit-cli -- --help
```

Every subcommand is listed under `cargo run -p fit-cli --`:

```powershell
cargo run -p fit-cli -- <COMMAND> ...
```

Shortcut after `cargo build -p fit-cli`: use the compiled binary location your `target/debug` folder produces (name `fit-cli` binary — on Windows typically `fit-cli.exe`; exact path depends on your workspace).

To see flags for one command:

```powershell
cargo run -p fit-cli -- generate --help
```

---

## Subcommands Overview

| Command | Role |
|---------|------|
| **`keygen`** | Create standalone keys (**no** `master_secret`; for recipients or experiments). Prints Ed25519 + X25519 pubkeys. |
| **`generate`** | Create genesis **`persona`** `.fit` + owner **`keys`** in one shot. |
| **`inspect`** | Read **public/header** facts from a `.fit` (no decryption). |
| **`verify`** | Check Merkle signature on a `.fit` (no decryption). |
| **`open`** | Decrypt layers with **`master_secret_hex`** keys file; prints JSON (`layer1` … `layer6`). |
| **`apply-delta`** | Append signed change (**JSON Patch**) to one layer; rewrites `.fit` in place. |
| **`share`** | Emit **`.fitshare`** for recipient X25519 pubkey and listed layers. |

---

## `keygen`

Generates random Ed25519 (signing) + X25519 (static DH) keys. **`master_secret_hex` is omitted** — use this mainly for **recipients**.

**Syntax:**

```text
cargo run -p fit-cli -- keygen [-o|--out PATH]
```

**Defaults:** `-o demo.keys.json`

**Example:**

```powershell
cargo run -p fit-cli -- keygen -o investor.keys.json
```

**Output:** writes the JSON bag and prints **Ed25519 pubkey** and **X25519 pubkey** (hex). The **X25519 pubkey** is what you paste into **`share --recipient`**.

---

## `generate`

Builds initial `.fit` bytes from an internal **`persona`** template (built into the engine — e.g. `priya`, `rajiv`, …) **and** writes an **owner key file** containing `master_secret_hex`.

**Syntax:**

```text
cargo run -p fit-cli -- generate --persona NAME [-o|--out PATH] [-k|--keys PATH]
```

**Defaults:**

- `-o out.fit`
- `-k out.keys.json`

**Example:**

```powershell
cargo run -p fit-cli -- generate --persona priya -o demo\priya.fit -k demo\priya.keys.json
```

**Notes:**

- Keeps personas **deterministic-ish** storytelling data for demos; same persona name ⇒ same genesis content shape for that build.
- The keys file **`must stay private`**.

---

## `inspect`

Reads the `.fit` header and summaries **without decrypting**.

**Syntax:**

```text
cargo run -p fit-cli -- inspect <PATH_TO.fit>
```

**Example:**

```powershell
cargo run -p fit-cli -- inspect demo\priya.fit
```

**Printed fields:** short FIT ID, display name, FIT score, number of layers, delta count, owner pubkey (hex).

---

## `verify`

Validates tamper‑evidence: Merkle-related signature verification over the parsed token.

**Syntax:**

```text
cargo run -p fit-cli -- verify <PATH_TO.fit>
```

**Example:**

```powershell
cargo run -p fit-cli -- verify demo\priya.fit
```

**Success:** message like **`OK — Merkle signature valid`**.

---

## `open`

**Owner-only decryption path** for full `.fit` files — requires **`master_secret_hex`** in the keys JSON.

**Syntax:**

```text
cargo run -p fit-cli -- open <PATH_TO.fit> -k KEYS.json
```

**Example:**

```powershell
cargo run -p fit-cli -- open demo\priya.fit -k demo\priya.keys.json
```

**Output:** pretty-printed JSON with keys **`layer1`** … **`layer6`** matching materialized payloads.

---

## `apply-delta`

Applies **[RFC 6902 JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902)** to **one numbered layer**, records a delta with **summary**, **attester** role string, resigns bundle, writes **same file path** updated.

Supply **either** `--patch-json` **or** `--patch-file` (not both omitted).

**Syntax:**

```text
cargo run -p fit-cli -- apply-delta FIT.fit -k KEYS.json ^
  --layer N --summary TEXT ^
  (--patch-json 'JSON ARRAY' | --patch-file PATH) ^
  [--attester LABEL]
```

**Parameters:**

| Flag | Meaning |
|------|---------|
| `FIT.fit` | Path to owner `.fit` (updated **in place**). |
| `-k` `KEYS.json` | Must include `master_secret_hex` + `ed25519_signing_seed_hex`. |
| `--layer` | Layer index **`1`**–**`6`** (integer). Patch paths must match that layer’s JSON shape once decrypted. |
| `--summary` | Human-readable delta line for audit trail. |
| `--patch-json` | Inline patch array — avoid in PowerShell for non-trivial patches. |
| `--patch-file` | File whose entire contents are one JSON array of ops (recommended). |
| `--attester` | Keyword mapped to signed attestation type (`owner` default). See table below. |

**Example (`--patch-file`):**

Create `demo\patch-score.json`:

```powershell
Set-Content -Path demo\patch-score.json -Value '[{"op":"replace","path":"/cibil_score","value":762}]' -NoNewline
```

```powershell
cargo run -p fit-cli -- apply-delta demo\priya.fit -k demo\priya.keys.json --layer 2 --summary "CIBIL tweak demo" --patch-file demo\patch-score.json --attester cibil
```

**Re-verify:**

```powershell
cargo run -p fit-cli -- verify demo\priya.fit
```

### `--attester` keywords (CLI → engine)

CLI accepts these strings (aliases on one line):

| `--attester` input | Mapped role |
|--------------------|-------------|
| `owner` | Owner (default). |
| `cibil`, `cibilbureau` | CIBIL-style bureau narrative. |
| `gstn`, `gstnportal` | GSTN portal narrative. |
| `itr`, `incometaxportal` | Income tax portal narrative. |
| `mca`, `mcaportal` | MCA portal narrative. |
| `bankaa` | Bank AA narrative. |
| `zerodha` | Zerodha Kite narrative. |
| `ca` | Manual CA narrative. |
| *(anything else)* | Falls back to **Owner**. |

---

## `share`

Builds **`*.fitshare`**: ciphertext + metadata bounded to **`--recipient`** (32-byte X25519 public key hex) + comma-separated **`--layers`** (**1–6**, deduped, sorted internally).

**Syntax:**

```text
cargo run -p fit-cli -- share FIT.fit -k KEYS.json ^
  --layers CSV --recipient HEX64 ^
  [--live-tracking [true|false]] ^
  [--expires-at EPOCH_OR_RFC3339] ^
  [--expires-days N] ^
  [-o|--out SHARE.fitshare]
```

**Important flags:**

| Flag | Meaning |
|------|---------|
| `--recipient` | **64 hex chars** recipient **X25519 public** key (often from `keygen`). |
| `--layers` | e.g. `2,3` — only those layers decryptable inside envelope for that recipient. |
| `--live-tracking` | Optional flag or `true`/`false`; enables relay-oriented semantics for the envelope (detail in **`docs/Architecture.md`**). Omitting the flag typically defaults to **on**; disable explicitly with **`--live-tracking false`**. |
| `--expires-days` | **Default `30`** days from now converted to UNIX expiry if `--expires-at` not given. |
| `--expires-at` | Override: integer **UNIX seconds** **or** **RFC3339** datetime string. |
| `-o` | Output path (default **`share.fitshare`**). |

Disable live-tracking example:

```powershell
cargo run -p fit-cli -- share demo\priya.fit -k demo\priya.keys.json --layers 2,3 --recipient HEX64_HERE --expires-days 30 --live-tracking false -o demo\invite.fitshare
```

**Example:**

```powershell
cargo run -p fit-cli -- share demo\priya.fit -k demo\priya.keys.json --layers 2,3 --recipient RECEIVER_X25519_PUB_HEX64 --expires-days 30 --live-tracking -o demo\priya_share.fitshare
```

---

## Key JSON Shape (`*.keys.json`)

Fields the CLI cares about:

- **`ed25519_signing_seed_hex`** — 32-byte seed hex (signing deltas / shares).
- **`master_secret_hex`** — optional; **present** after `generate`; **absent** after plain `keygen`. Required for **`open`** and **`apply-delta`** and **`share`** **on owner tokens**.
- **`x25519_static_secret_hex`** — recipient-side static secret counterpart to published pubkey.

Treat the file **like cryptographic material**: restrict permissions and never paste into chats.

---

## Desktop App (`fit-app`) in One Paragraph

The **Tauri** app complements the CLI: browse dashboards, investor mode for `.fitshare`, optional WebSocket **relay URL** (`VITE_RELAY_WS` in **`fit-app/.env`**), Copilot (**Groq** keys in same `.env`). **Opening `.fitshare`** is exercised there; **`inspect`/`verify`** mirroring CLI exist via the UI/backend. **`docs/Demo.md`** walks LAN relay + investor setup.

---

## Quick Reference Cheat Sheet

```powershell
cargo run -p fit-cli -- keygen -o recv.keys.json
```

```powershell
cargo run -p fit-cli -- generate --persona priya -o token.fit -k owner.keys.json
```

```powershell
cargo run -p fit-cli -- inspect token.fit
```

```powershell
cargo run -p fit-cli -- verify token.fit
```

```powershell
cargo run -p fit-cli -- open token.fit -k owner.keys.json
```

```powershell
cargo run -p fit-cli -- apply-delta token.fit -k owner.keys.json --layer 3 --summary "Demo" --patch-file patch.json --attester owner
```

```powershell
cargo run -p fit-cli -- share token.fit -k owner.keys.json --layers 2,3 --recipient PUB_HEX --expires-days 30 -o invite.fitshare
```

---

## When Something Fails

- **`missing master_secret`** on `open`/`apply-delta`/`share` ⇒ you used **`keygen`** keys instead of **`generate`** owner keys — regenerate or swap file.
- **`--layers parsed empty`** ⇒ typo in CSV; layers must decode to integers **1–6**.
- **`expected 32 bytes`** on recipient ⇒ **wrong `--recipient`** string length or invalid hex — must be exactly **66 chars with `0x`** or **64 hex** without spacer issues (CLI strips leading **`0x`** if present internally).
- **`patch JSON`** parse errors ⇒ file must contain a **single JSON array** of patch operations.

Automated sanity path: **`test_all.ps1`** at repo root (PowerShell integration script exercising most commands).
