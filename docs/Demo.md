Here is your **`demo.md`** file ready to copy/save:

---

````md
# FIT Demo Setup (Two Laptops)

---

## 0. Prerequisites (both laptops)

- Rust toolchain installed  
- Node.js (for `fit-app`)  
- Python 3 + `websockets` (`fit-relay/requirements.txt`)  
- Same network (WiFi LAN) OR firewall allows TCP `8765`  
- Repo built:

```bash
cargo build -p fit-cli
````

Or run directly:

```bash
cargo run -p fit-cli -- ...
```

---

# 💻 Laptop A — Owner (Priya)

## 1. Generate the owner FIT + keys

```bash
cd C:\Users\freak\Rust-FIT
mkdir demo -Force
cargo run -p fit-cli -- generate --persona priya -o demo\priya.fit -k demo\priya.keys.json
```

⚠️ Keep `demo\priya.keys.json` **private**
(It contains `master_secret_hex` + signing + X25519 keys)

---

## 2. Sanity-check the file (optional but recommended)

```bash
cargo run -p fit-cli -- inspect demo\priya.fit
```

```bash
cargo run -p fit-cli -- verify demo\priya.fit
```

```bash
cargo run -p fit-cli -- open demo\priya.fit -k demo\priya.keys.json
```

---

## 3. Run FIT Desktop App (Owner Dashboard)

```bash
cd fit-app
npm install
npm run tauri dev
```

### In the app:

* Select `demo\priya.fit`
* Select `demo\priya.keys.json`
* Load **Owner Dashboard**

👉 Try demo delta buttons (they update the `.fit` file)

---

# 💻 Laptop B — Investor / Recipient (Rajiv)

## 4. Create recipient keys

```bash
cargo run -p fit-cli -- keygen -o demo\rajiv.keys.json
```

👉 CLI prints **X25519 public key (hex)**
Copy this to Laptop A

⚠️ Keep `demo\rajiv.keys.json` private
(It contains `x25519_static_secret_hex`)

---

# 💻 Laptop A — Create `.fitshare`

## 5. Export share envelope (example: layers 2,3)

```bash
cargo run -p fit-cli -- share demo\priya.fit -k demo\priya.keys.json --layers 2,3 --recipient "<PASTE_RAJIV_X25519_PUBKEY_HEX>" --expires-days 30 --live-tracking -o demo\priya_for_rajiv.fitshare
```

---

## 6. Transfer `.fitshare` to Laptop B

Use:

* USB
* Encrypted drive
* Signal / secure transfer

👉 File to send:

```
demo\priya_for_rajiv.fitshare
```

⚠️ Owner NEVER shares `master_secret`

---

# 💻 Laptop B — Open the share

## 7. Run Desktop App (Investor Mode)

```bash
cd fit-app
npm install
npm run tauri dev
```

### In the app:

* Open: `demo\priya_for_rajiv.fitshare`
* Select: `demo\rajiv.keys.json`
* Load **Investor View**

👉 Only permitted layers visible
👉 Others appear **locked**

⚠️ CLI does NOT support opening `.fitshare`
→ Use Tauri app

---

# 🌐 Relay Server (Live Sync)

## 8. Start relay (on one laptop, usually A)

```bash
cd C:\Users\freak\Rust-FIT
python -m venv venv
```

```bash
.\venv\Scripts\pip install -r fit-relay\requirements.txt
```

```bash
.\venv\Scripts\python fit-relay\relay_server.py
```

---

## 🔧 Allow LAN access (IMPORTANT)

By default:

```
127.0.0.1:8765  ❌ (local only)
```

### Fix:

Edit `relay_server.py`:

```python
websockets.serve(handler, "0.0.0.0", 8765)
```

---

## 🌍 Connect from Laptop B

Use:

```
ws://<LAPTOP_A_IP>:8765
```

Example:

```
ws://192.168.1.42:8765
```

---

# 🔁 Result

* Owner pushes delta
* Relay broadcasts
* Investor receives update live

---

# ✅ Done

You now have:

* `.fit` generation
* `.fitshare` secure sharing
* Cross-laptop connection
* Live updates via relay

```

---

If you want, I can also generate:
- :contentReference[oaicite:0]{index=0}
- or :contentReference[oaicite:1]{index=1}
```
