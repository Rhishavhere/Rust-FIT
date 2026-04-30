# FIT Demo Walkthrough (CLI + Desktop + Two Laptops)

This guide walks through the **sample persona** (`priya`), **CLI inspection and verification**, **optional deltas**, **sharing to a recipient**, and **LAN relay** so a second laptop can subscribe to updates. Paths use **PowerShell** and backslashes (`\`); from macOS/Linux, use `/` instead and the same `cargo`/`npm` commands.

Assume **repository root**:

```powershell
cd C:\path\to\Rust-FIT
```

---

## 1. Prerequisites

```powershell
rustc --version
node --version
python --version
```

- **Rust** — `cargo`, `rustc`
- **Node.js** — for `fit-app` (desktop UI)
- **Python 3** — for `fit-relay` (optional live WebSocket fan-out)

---

## 2. Build the CLI

From the repo root:

```powershell
cargo build -p fit-cli
```

Run without a binary install via:

```powershell
cargo run -p fit-cli -- <subcommand> ...
```

---

## 3. Demo directory and genesis FIT (`priya`)

Create a folder for demo artifacts:

```powershell
mkdir demo -Force
```

Generate a **`priya`** identity token plus a **key bundle** (Ed25519 signing, master secret for decryption, X25519 for transport/sharing wiring):

```powershell
cargo run -p fit-cli -- generate --persona priya -o demo\priya.fit -k demo\priya.keys.json
```

**Keep `demo\priya.keys.json` private** — it contains `master_secret_hex`, signing seed, and X25519 secret material.

---

## 4. Inspect (metadata, no decryption)

```powershell
cargo run -p fit-cli -- inspect demo\priya.fit
```

You should see FIT ID (short), display name, score, layer count, delta count, and owner public key (hex).

---

## 5. Verify (Merkle / signature)

```powershell
cargo run -p fit-cli -- verify demo\priya.fit
```

On success the CLI prints that the signature check passed.

---

## 6. Open (owner — decrypt and print materialized layers)

Uses `master_secret_hex` from the key file:

```powershell
cargo run -p fit-cli -- open demo\priya.fit -k demo\priya.keys.json
```

Output is JSON: `layer1` … `layer6` with decrypted plane contents.

---

## 7. Apply a delta from the terminal (optional)

Prefer **`--patch-file`** so you avoid fragile inline JSON in PowerShell. Example: small CIBIL tweak on **layer 2** (matches the patterns in `fit-app\src\lib\demoPatches.ts`).

Create a patch file:

```powershell
Set-Content -Path demo\patch-cibil.json -Value '[{"op":"replace","path":"/cibil_score","value":762}]' -NoNewline
```

Apply it:

```powershell
cargo run -p fit-cli -- apply-delta demo\priya.fit -k demo\priya.keys.json --layer 2 --summary "CIBIL refresh (demo CLI)" --patch-file demo\patch-cibil.json --attester cibil
```

Re-verify:

```powershell
cargo run -p fit-cli -- verify demo\priya.fit
```

Larger demos (sell Reliance, FD, GST, angel round) use the **same** JSON Patch arrays as **Manual changes** in the desktop app (`fit-app\src\lib\demoPatches.ts`); copy one array into `demo\my-patch.json` and pass `--patch-file demo\my-patch.json` with the correct `--layer` and `--summary`.

---

## 8. Full CLI smoke script (single machine)

The repo ships an integration script:

```powershell
powershell -ExecutionPolicy Bypass -File test_all.ps1
```

---

## 9. Desktop app — owner cockpit

Install and run:

```powershell
cd fit-app
npm install
npm run tauri dev
```

In the UI:

1. Open **`demo\priya.fit`**
2. Select **`demo\priya.keys.json`**
3. Load the **Owner** dashboard — use **demo delta** buttons or the **Manual CLI** panel (same patches as §7).

**Optional — FIT Copilot (Groq):** create `fit-app\.env`, set `VITE_GROQ_API_KEY` and optionally `VITE_GROQ_MODEL`; restart **`npm run tauri dev`** so the Rust side loads `.env` at startup.

---

# Two laptops — Investor (`rajiv`) and share file

## 10. Laptop B — recipient keys

On the **investor** machine:

```powershell
cargo run -p fit-cli -- keygen -o demo\rajiv.keys.json
```

The CLI prints **X25519 pubkey** (hex). Copy that **64 character hex** to Laptop A for the `share` command.

**Keep `demo\rajiv.keys.json` private.**

---

## 11. Laptop A — export a `.fitshare` envelope

Replace `RECIPIENT_X25519_HEX` with the hex from §10. Example: share **layers 2 and 3**, 30-day expiry, live tracking enabled:

```powershell
cargo run -p fit-cli -- share demo\priya.fit -k demo\priya.keys.json --layers 2,3 --recipient RECIPIENT_X25519_HEX --expires-days 30 --live-tracking -o demo\priya_for_rajiv.fitshare
```

**Do not** share `master_secret` or the owner key file — only the `.fitshare` envelope by an agreed channel (USB, encrypted share, etc.).

---

## 12. Laptop B — open the share in the app

The **CLI does not** materialize `.fitshare` files the same way as owner `.fit` — use the **desktop app**:

```powershell
cd fit-app
npm install
npm run tauri dev
```

1. Open **`demo\priya_for_rajiv.fitshare`**
2. Select **`demo\rajiv.keys.json`**
3. Load **Investor** view — only permitted layers decrypt; others stay locked.

---

# LAN relay (owner pushes, investor receives)

The relay defaults to **all interfaces** (`0.0.0.0`) on port **8765** so other devices on the Wi-Fi/LAN can connect. Override with `FIT_RELAY_HOST` / `FIT_RELAY_PORT` if needed.

## 13. Start the relay (often on Laptop A)

From repo root:

```powershell
python -m venv venv
```

```powershell
.\venv\Scripts\pip install -r fit-relay\requirements.txt
```

```powershell
.\venv\Scripts\python fit-relay\relay_server.py
```

Leave this running. Note the log line that tells you to use **`ws://<this-host-LAN-ip>:8765`** for remote clients.

**Firewall:** allow inbound **TCP 8765** on the machine running the relay (or use the same machine for both roles with `ws://127.0.0.1:8765` only for local tests).

---

## 14. Point the investor app at the relay (Laptop B)

On **Laptop B**, set the Vite relay URL **before** starting the dev server (so it is bundled). In `fit-app\.env`:

```env
VITE_RELAY_WS=ws://192.168.x.x:8765
```

Use **`192.168.x.x`** = Laptop **A’s** LAN IPv4 address (not `127.0.0.1` on B).

Then:

```powershell
cd fit-app
npm run tauri dev
```

The investor dashboard connects to this WebSocket URL for **`SUBSCRIBE`** to the envelope’s **`fit_id`** (shown in Inspect / investor UI).

---

## 15. What you should observe

| Step | Expected |
|------|----------|
| `inspect` | FIT metadata and layer counts |
| `verify` | Signature OK |
| `open` | Full JSON planes (owner keys) |
| `apply-delta` + `verify` | File updates in place; chain grows |
| `share` | `.fitshare` written; recipient pubkey bound |
| Investor UI | Subset of layers only |
| Relay + `VITE_RELAY_WS` | Investor sees live fan-out events when owner pushes deltas (where enabled by share semantics) |

---

## 16. Quick troubleshooting

```powershell
cargo run -p fit-cli -- inspect demo\priya.fit
```

```powershell
cargo run -p fit-cli -- verify demo\priya.fit
```

- **`Missing layers` / share errors** — ensure `--layers` lists only integers **1–6**, comma-separated with no spaces (or trimmed), e.g. `2,3`.
- **Relay unreachable** — ping Laptop A; confirm `VITE_RELAY_WS` uses A’s LAN IP and port **8765**; confirm Python relay is running and firewall allows the port.
- **Investor sees no live updates** — confirm the share was created with **`--live-tracking`** and the subscriber uses the correct **`fit_id`** for `SUBSCRIBE` (must match the owner’s FIT id / envelope metadata).

---

## Reference: attester aliases for `--attester`

Examples: `owner`, `cibil`, `gstn`, `bankaa`, `ca` (see CLI `parse_attester` in `fit-cli\src\main.rs`). Use the value that matches your demo storyline when calling `apply-delta`.
