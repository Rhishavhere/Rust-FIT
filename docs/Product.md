# Financial Identity Token (FIT) — Product Document

> **Version:** 1.0 — Hackathon Build  
> **Last Updated:** April 2026  
> **Status:** Active — Primary Reference Document

---

## 1. Vision & Problem Statement

### The Problem

Financial identity today is broken and fragmented:

- Your CIBIL score lives at one bureau
- Your demat account data lives at CDSL/NSDL
- Your ITR lives at the Income Tax portal
- Your GST filings live at GSTN
- Your business filings live at MCA21
- Your bank statements live with each bank

Every time you need to prove financial credibility — to an investor, a lender, a business partner — you manually assemble a dossier. It takes days, it's unverified, and the moment you hand it over it becomes stale. There is no unified, cryptographically verifiable, living financial identity that a person owns.

### The Solution

**FIT — Financial Identity Token** is a self-evolving, cryptographically signed, selectively shareable financial identity that belongs entirely to its owner. It is not a report. It is not a dashboard export. It is a real binary token — a `.fit` file — that encodes every dimension of a person's financial life, updates automatically as their financial reality changes, and can be shared with anyone through a secure, agent-readable envelope.

### The Core Insight

You should own your financial identity the same way you own your passport — except your financial passport should be alive, machine-readable, and shareable on your terms.

---

## 2. Target Users

### Primary Users

**Financial Identity Owners (Everyone)**
Any individual with a financial life — salaried professionals, traders, startup founders, business owners, HNIs, freelancers. Anyone who has ever needed to prove their financial standing to another party.

**Investors & VCs**
People who evaluate other people's financial profiles regularly. They need a way to receive, store, query, and track multiple financial identities without the friction of manual document collection.

**Lenders & Banks**
Institutions that need verified, real-time financial data on applicants. FIT gives them a pull-once, track-forever model.

**Business Partners**
Two founders entering a partnership, two companies doing a deal — both need to verify the other's financial standing quickly and verifiably.

### Demo Personas (Hackathon)

Four sample FIT tokens are pre-built for the demo, each representing a distinct financial archetype:

**Persona 1 — Priya Sharma (The Startup Founder)**
- Registered Pvt Ltd company, 4 years old
- Two angel rounds on her cap table (₹40L seed, ₹1.2Cr pre-Series A)
- CIBIL: 752, trending up (+22 pts this year)
- Assets: 1 flat (₹68L), MF portfolio (₹14L), equity (₹9L)
- Active personal loan: ₹8L, 14 months remaining
- ITR income FY25: ₹18L
- GST registered, quarterly filer
- FIT is complex — great for showing depth and the investor use case

**Persona 2 — Rajiv Menon (The HNI Investor)**
- No active business, pure investor
- Assets: 3 properties (₹4.2Cr combined), PMS account (₹82L), direct equity (₹1.1Cr), FDs (₹35L)
- CIBIL: 811 (excellent)
- 3 startup co-investments on his cap table
- Zero outstanding loans
- ITR income FY25: ₹48L (capital gains + rental)
- FIT is asset-heavy and clean — good as the investor who opens others' FITs

**Persona 3 — Arjun Nair (The Active Trader)**
- F&O trader, active demat account
- Monthly trading turnover: ₹18L–₹42L
- CIBIL: 694 (moderate, some credit card utilization)
- Assets: equity portfolio ₹22L, one FD ₹5L, no real estate
- 2 credit cards, combined utilization 67%
- ITR shows trading income: ₹9.4L FY25
- FIT has interesting behavioral signals — volatility, high activity

**Persona 4 — Fatima Sheikh (The SME Owner)**
- Runs a textile trading business (LLP), 4 years operational
- GST turnover FY25: ₹1.8Cr
- 2 business loans — one closed (₹12L), one active (₹25L, 22 months remaining)
- CIBIL: 718
- Personal assets: thin (₹6L savings, no property)
- MCA filings clean, no penalties
- ITR income FY25: ₹11L
- FIT tells a business creditworthiness story — best for the lending use case

---

## 3. The FIT Token — What It Is

### Not a JSON. An Actual Token.

The `.fit` file is a custom binary format built in Rust. It is compressed, layered, encrypted, and signed. It cannot be opened by any standard tool. Only a FIT-aware application can read it. This is intentional — it makes the token feel like a real cryptographic artifact, not a data export.

The file is structured as a **signed, layered binary envelope** with the following anatomy:

```
┌──────────────────────────────────────────────┐
│              FIT TOKEN ENVELOPE              │
├──────────────────────────────────────────────┤
│  HEADER (Public — readable without key)      │
│  - FIT ID (UUID v7, globally unique)         │
│  - FIT Version + creation timestamp          │
│  - Owner public key (Ed25519)                │
│  - Capability flags (which layers exist)     │
│  - Expiry / revocation pointer               │
├──────────────────────────────────────────────┤
│  MERKLE ROOT                                 │
│  - Hash of all layers below (BLAKE3)         │
│  - Tamper-evident: any change breaks the root│
├──────────────────────────────────────────────┤
│  LAYER 1 — Identity Core (encrypted)         │
│  PAN (masked), Aadhaar hash, DOB, address,   │
│  KYC status, nationality, photo hash         │
├──────────────────────────────────────────────┤
│  LAYER 2 — Credit & Trust (encrypted)        │
│  CIBIL score + 12-month history, active      │
│  loans count, total outstanding, EMI/month,  │
│  credit utilization %, defaults record       │
├──────────────────────────────────────────────┤
│  LAYER 3 — Assets (encrypted)                │
│  Real estate (count, value, city), equity    │
│  portfolio (total + top 5 holdings), MF NAV, │
│  gold, FDs, bank balance range, net worth    │
├──────────────────────────────────────────────┤
│  LAYER 4 — Business & Income (encrypted)     │
│  ITR last 3 years, GST quarterly turnover,   │
│  company name + CIN, director status,        │
│  P&L summary, business loans                 │
├──────────────────────────────────────────────┤
│  LAYER 5 — Behavioral / Track Record         │
│  Investment count, sectors, avg ticket size, │
│  trading volume monthly, cap table entries,  │
│  portfolio churn rate                        │
├──────────────────────────────────────────────┤
│  LAYER 6 — Reputation & Attestations        │
│  FIT age, share count, endorsements,         │
│  verified attestations (CA, bank, GSTN),     │
│  access log summary                          │
├──────────────────────────────────────────────┤
│  DELTA LOG                                   │
│  Append-only signed changelog of all changes │
│  Each delta: timestamp + layer + change +    │
│  signature of the attesting party            │
├──────────────────────────────────────────────┤
│  SIGNATURE BLOCK                             │
│  Owner signature over Merkle root (Ed25519)  │
│  Issuer / attestation signatures             │
└──────────────────────────────────────────────┘
```

### Selective Disclosure

Each layer is independently encrypted with its own layer key. When sharing, the owner chooses which layers to expose. The share envelope re-encrypts only the selected layers with the recipient's public key. The recipient can only decrypt what they were given.

Example access scenarios:
- **Investor sees:** Layers 2, 3, 4, 5 (credit, assets, business, behavioral)
- **Bank/lender sees:** Layers 1, 2, 4 (identity, credit, income)
- **Business partner sees:** Layers 4, 5, 6 (business, track record, reputation)
- **Full trust share:** All layers

### The FIT Score

Every FIT has a computed **FIT Score** — a 0–1000 number analogous to CIBIL but holistic. It is computed by the FIT Engine at materialization time from all available layers:

- Credit health (CIBIL, utilization, defaults) — 30%
- Asset strength (net worth, diversification) — 25%
- Income stability (ITR trend, GST consistency) — 20%
- Behavioral signals (investment track record) — 15%
- Attestation quality (verified data sources) — 10%

The FIT Score is the headline number on the dashboard. It lives in the header (public metadata) so it can be shown even before full decryption.

---

## 4. The Self-Evolving Token — Delta System

FIT is not a snapshot. It is a living document with a signed, append-only changelog.

### How Deltas Work

Every change to financial data produces a **delta** — not a full rewrite. The delta contains:
- Timestamp
- Which layer was affected
- What changed (structured diff)
- Who signed it (owner or attesting service)

```
FIT v1.0  [genesis — owner signed]
  → Δ1: CIBIL 730 → 752  [CIBIL bureau attested, 2026-01-15]
  → Δ2: Sold 50 shares Infosys, portfolio -₹1.4L  [owner signed, 2026-02-03]
  → Δ3: New FD opened ₹2L  [owner signed, 2026-02-20]
  → Δ4: ITR FY25 filed, income ₹18L  [IT portal attested, 2026-03-31]
  → Δ5: Q4 GST return filed  [GSTN attested, 2026-04-12]
```

The FIT at any point in time = genesis state + all applied deltas. The full history is always preserved. Any delta not signed by the correct key is rejected by the FIT Engine.

### Delta Trigger Types

**Type 1 — Manual Action (Owner in App)**
User does something in the FIT desktop app: sells an asset, adds a bank account, marks a loan closed, records an investment. These are owner-signed deltas.

**Type 2 — Connected Service Sync**
A linked service (Zerodha, bank, GSTN, CIBIL) pushes a change. In production these use the Account Aggregator framework and direct API integrations. In the demo, a "Sync" button simulates the API call and generates a delta. The delta is attested by the service, not the owner.

**Type 3 — Scheduled Attestation Pull**
Monthly CIBIL refresh, annual ITR update, quarterly GST sync. Time-based pulls that generate attested deltas automatically.

### Pre-Built Demo Triggers (5 clickable actions in the app)

| Action | Layer | Visual Change on Dashboard |
|--------|-------|---------------------------|
| Sell 100 Reliance shares | Layer 3 | Portfolio value ↓, net worth updates, donut chart rebalances |
| Open new FD ₹2L | Layer 3 | FD count +1, asset allocation shifts |
| CIBIL refresh | Layer 2 | Score animates to new value, trend line updates |
| File Q1 GST return | Layer 4 | GST compliance badge turns green, turnover updates |
| New angel investment made | Layer 5 | Investment count +1, deployed capital ↑ |

Each trigger creates a delta, signs it, pushes it to the relay, and the investor's dashboard updates live within 2–3 seconds.

---

## 5. Sharing & Access Control

### The Share Envelope

When you share your FIT:

1. Recipient sends you their **public key** + requested layers
2. You approve in the FIT app — set which layers, time limit (e.g., 30 days), and whether live tracking is enabled
3. FIT Engine generates a **Share Envelope**: re-encrypts the selected layers with the recipient's public key, packages as a `.fit` share file
4. Recipient opens the envelope with their private key, decrypts the layers, loads them into their FIT store
5. Recipient's agent can now answer questions about you

### Live Tracking

If live tracking is enabled:
- Recipient's agent is subscribed to your FIT ID on the relay server
- Every delta that touches their permitted layers is forwarded automatically
- Recipient's dashboard updates in real-time as your FIT evolves
- They see your financial identity changing, not a stale snapshot

### Access Control Properties

Every share has these configurable properties:
- **Layers permitted:** Which layers (1–6) the recipient can see
- **Expiry:** Timestamp after which access auto-revokes
- **Live tracking:** On/off — whether they get real-time delta updates
- **Read-only vs. query-only:** Can they export data or only query via agent?

### Revocation

One click in the FIT app marks a share key as revoked in the FIT Registry. On next sync, the recipient's agent receives a revocation notice. Their dashboard shows: *"Access to [Name]'s FIT has been revoked."* Cryptographically enforced — the relay will reject any further delta requests for that share key.

---

## 6. The FIT Dashboard — Unenveloping View

When a recipient opens a `.fit` share file, the dashboard populates from the token data. Inspired by the reference design (dark theme, green accents, data-rich cards).

### Dashboard Regions & Data Mapping

**Top Hero Strip**
- Owner name, profile photo (hashed), FIT ID (short form)
- FIT Score (0–1000) — the headline number
- Last updated timestamp
- Access indicator: which layers you can see, expiry countdown

**4 Stat Cards (Top Row)**
- Net Worth (computed from Layer 3)
- FIT Score (from header)
- CIBIL Score (from Layer 2)
- Active Businesses OR Active Investments (from Layer 4 or 5, depending on persona)

**Asset Allocation Donut Chart**
- Pulls from Layer 3
- Slices: Real Estate / Equity / Mutual Funds / Gold / FDs / Cash
- Center shows total net worth

**Credit Score Trend Line**
- Pulls from Layer 2 delta history
- 12-month CIBIL score plotted as area chart
- Shows direction — rising or falling

**Business / Income Card**
- Pulls from Layer 4
- ITR income bar chart (last 3 years)
- GST quarterly turnover
- Compliance status badges

**Portfolio Holdings Table**
- Pulls from Layer 3 (equity) or Layer 5 (cap table)
- Rows: stock/startup name, value, weight, change
- Mirrors the "customer list" table in the reference design

**Delta Feed (Notifications Panel)**
- Pulls from the delta log
- Shows recent FIT changes: "CIBIL updated 740→762", "New FD added ₹2L", "ITR FY25 filed"
- This is the live updating panel — new deltas appear here in real-time

**Access Log (Activities Panel)**
- Who accessed this FIT, when, which layers
- Mirrors the "activities" panel in the reference design

**Active Access Holders (Contacts Panel)**
- Which entities currently have active access
- Shows name, layers permitted, expiry date
- Mirrors the "contacts of your managers" panel

### The Unenveloping Animation

The most important UI moment: user drags a `.fit` file into the app → "Decrypting layers..." animation → dashboard populates layer by layer with a visual reveal. Each card appears as its layer decrypts. This is the demo's cinematic moment.

---

## 7. The AI Agents

### Two Distinct Agents

**Agent 1 — Personal FIT Agent (Owner Side)**
Lives in the owner's FIT desktop app. Has full access to all layers of the owner's FIT. Acts as a personal CFO / financial identity manager.

Capabilities:
- Answer natural language questions about your own finances
- Summarize your FIT for a specific audience ("What would an investor see?")
- Simulate hypothetical changes ("If I sell my Reliance holdings, what happens to my net worth?")
- Manage access ("Who has my FIT? Revoke Rajiv's access.")
- Prepare share packages ("Share my credit and asset layers with this investor, valid 30 days")
- Alert on changes ("Tell me when my CIBIL updates")

**Agent 2 — Investor / Analyst FIT Agent (Recipient Side)**
Lives in the investor's FIT desktop app. Holds multiple FITs of different people. Can only see what each person has permitted.

Capabilities:
- Summarize any held FIT in natural language
- Flag risks in a financial profile
- Compare multiple FITs side by side ("Who has the cleanest balance sheet among these three founders?")
- Track changes over time ("What changed in Priya's FIT since last week?")
- Draft due diligence notes from FIT data
- Set watches ("Alert me if anyone's CIBIL drops below 700")
- Answer cross-FIT questions ("What's the average net worth of founders in my portfolio?")

### Agent Tool Functions

```python
# Owner Agent Tools
fit_read_layer(layer_id)              # Read a specific layer
fit_compute_networth()                # Aggregate asset layer
fit_simulate_delta(change)            # Hypothetical what-if, no commit
fit_share(layers, recipient_key, expiry, live_tracking)  # Generate share envelope
fit_revoke(share_id)                  # Revoke a share
fit_set_watch(condition)              # Set personal alert
fit_diff(date_from, date_to)          # Show what changed between dates
fit_get_access_log()                  # Who has accessed my FIT

# Investor Agent Tools (same base + cross-FIT)
fit_compare([fit_id_1, fit_id_2, ...])   # Cross-FIT comparison
fit_query_all(question)               # Query across all held FITs
fit_draft_memo(fit_id)                # Generate due diligence note
fit_watch_all(condition)              # Watch condition across all FITs
```

### Agent Architecture

```
User message
    ↓
Agent receives: message + current FIT data (JSON materialized from binary)
    ↓
System prompt: "You are a FIT analyst. Here is the decoded financial data:
{fit_data}. Answer questions. If an action is needed, call the appropriate tool."
    ↓
LLM (Claude API) generates response or tool call
    ↓
If tool call → FIT Engine executes → updates FIT → agent confirms
    ↓
Response rendered in chat UI
```

FIT data is injected into the LLM context window as structured JSON at each turn. The agent has no memory between sessions — all state lives in the FIT.

### Demo Agent Conversation Script

**Owner's screen (Priya):**
> *"Prepare a share package for a new investor. Give them credit and asset layers only. Valid 30 days."*
> Agent: *"Done. Share envelope created — Layers 2 and 3 only. Access expires May 28th. The .fit share file is ready to send."*

**Investor's screen (Rajiv receives Priya's FIT):**
> *"Summarize Priya's financial profile."*
> Agent: *"Priya has a net worth of ₹1.2Cr, predominantly real estate (58%) and equity (31%). Her CIBIL is 752 and has risen 22 points this year. One active personal loan of ₹8L with 14 months remaining. Overall a clean profile with moderate leverage."*

> *"Any red flags?"*
> Agent: *"Credit utilization is at 61% — slightly elevated. The active loan reduces free cash flow by approximately ₹68K/month. No defaults on record. Risk is low to moderate."*

**Priya sells shares (live delta):**
**Rajiv's dashboard updates automatically.**
> *"What just changed in Priya's FIT?"*
> Agent: *"Her equity portfolio dropped ₹1.4L — she appears to have liquidated part of her Reliance position. Net worth updated to ₹1.06Cr. The change was timestamped 3 minutes ago."*

---

## 8. API & Data Connections (Demo vs. Production)

### Demo Approach
All data is sample/hardcoded. Buttons simulate API calls with realistic delays and responses. The connection UI is shown to demonstrate what a production system would do.

### Production Integrations (Story for Judges)

| Service | What it provides | API / Framework |
|---------|-----------------|-----------------|
| Account Aggregator (AA) | Bank statements, loan data | RBI-mandated AA framework |
| CIBIL / Experian | Credit score + history | Direct bureau API |
| GSTN | GST filings, turnover | GSTN sandbox API |
| MCA21 | Company filings, director status | MCA API |
| Income Tax Portal | ITR data | IT dept API |
| Zerodha Kite | Equity portfolio, trading | Kite Connect API |
| CDSL / NSDL | Demat holdings | Depository APIs |

India's Account Aggregator framework is the key enabler — it is RBI-mandated, live, and allows individuals to share financial data from consented institutions. FIT is the identity layer built on top of AA.

---

## 9. Demo Flow (End-to-End Walkthrough)

This is the exact sequence to show judges. Estimated time: 4–5 minutes.

**Scene 1 — Generate a FIT (30 seconds)**
Open terminal. Run: `fit generate --persona priya`. The Rust CLI outputs a `.fit` binary file. Show the file size, show it's not human-readable. Run `fit inspect priya.fit` to show the header metadata without decrypting. Run `fit verify priya.fit` to show signature verification. Judges see a real binary tool working.

**Scene 2 — Open Owner Dashboard (45 seconds)**
Open the FIT desktop app. Load `priya.fit` with Priya's private key. Dashboard populates — FIT Score 781, Net Worth ₹1.2Cr, CIBIL 752, asset donut, credit trend line, income bars. Show the delta feed on the right — her history of changes.

**Scene 3 — Share to Investor (30 seconds)**
Click "Share FIT". Select layers 2, 3. Set 30-day expiry. Enable live tracking. App generates a `priya_share.fit` file. Open Rajiv's app on second screen. Load `priya_share.fit`. His dashboard shows only credit and asset data — business and behavioral layers are absent, greyed out.

**Scene 4 — Investor Agent Conversation (60 seconds)**
Rajiv asks his agent about Priya. Agent summarizes. Rajiv asks for red flags. Agent flags the credit utilization. Rajiv asks it to compare Priya with another founder's FIT. Agent ranks them.

**Scene 5 — Live Delta Update (60 seconds)**
On Priya's screen: click "Sell 100 Reliance shares". App shows delta being created, signed, pushed. On Rajiv's screen: 2–3 seconds later, the portfolio value changes. Net worth updates. The delta feed shows the new entry. Rajiv asks his agent what changed. Agent explains precisely.

**Scene 6 — Revocation (30 seconds)**
On Priya's screen: "Manage Access" → revoke Rajiv's share. Confirm. On Rajiv's screen: dashboard shows "Access to Priya Sharma's FIT has been revoked." His agent confirms it can no longer query her data.

---

## 10. Key Differentiators (Pitch Points)

1. **It's a real binary format** — not a JSON, not a PDF, not a portal export. A cryptographically signed `.fit` file built in Rust.
2. **You own it** — lives on your device. The relay server holds zero plaintext data.
3. **Selective disclosure** — share only what you choose, down to the layer.
4. **It's alive** — not a snapshot. Signed deltas, full history, real-time sync.
5. **Agent-native** — the LLM agent that reasons about financial identity is the interface.
6. **India-native** — Account Aggregator, GSTN, CIBIL, MCA21. The infrastructure exists.
7. **Revocable, time-limited** — you can take back access. Not possible with any document today.
8. **Cross-FIT intelligence** — investor's agent can reason across multiple people's FITs. No tool does this.

**Pitch line:** *"Your financial identity, finally owned by you — cryptographically verifiable, agent-readable, and alive."*
