# architecture.md

## 1. System Overview

The system is composed of four main layers:

```
[ Mobile App ]
       ↓
[ API Layer (Rust Backend) ]
       ↓
[ Core Engine ]
       ↓
[ Payment + Storage Layer ]
```

---

## 2. Core Components

### 2.1 Rust Backend (Core Server)

Framework:

* Axum (HTTP server)
* Tokio (async runtime)

Responsibilities:

* API handling
* event processing
* state transitions
* payment orchestration

---

### 2.2 Core Engine

#### A. Token Engine

Manages Financial Identity Tokens (FIT)

Structure:

```json
{
  "token_id": "userB",
  "state": "ACTIVE",
  "assets": ["bank_1", "mf_1"],
  "successor": "userC",
  "rules": [...],
  "event_log": [...]
}
```

---

#### B. State Machine

States:

* ACTIVE
* DORMANT
* TRANSITIONING
* INHERITED

Transitions:

```
ACTIVE --(death_verified)--> TRANSITIONING
TRANSITIONING --(validated)--> INHERITED
```

---

#### C. Resolver Engine

Core function:

```rust
fn resolve(user_id: String) -> String {
    let user = get_user(user_id);

    match user.state {
        ACTIVE => user.id,
        INHERITED => user.successor.unwrap(),
        _ => user.id
    }
}
```

---

#### D. Event Engine

Events:

* death_verified
* inactivity_triggered
* manual_override

Each event:

* appended to log
* triggers state change

---

#### E. Rule Engine

Optional advanced layer:

* programmable inheritance logic
* executed per event

Future:

* WASM-based rule execution

---

## 3. Data Flow

### 3.1 Event Processing

```
Client → API → Event Queue → State Machine → Update Token → Notify Clients
```

---

### 3.2 Payment Flow

```
A → Payment Gateway / UPI → Settlement Wallet
        ↓
    Backend receives event
        ↓
    resolve(B) → C
        ↓
    payout → C
```

---

## 4. Payment Layer

### 4.1 Settlement Wallet

Options:

* UPI account (manual)
* Payment gateway (e.g., Razorpay)

Responsibilities:

* receive funds
* hold funds briefly
* disburse funds

---

### 4.2 Payment Processing

Steps:

1. Payment initiated with metadata:

   ```
   intended_receiver = B
   ```

2. Backend receives webhook / trigger

3. Resolver computes:

   ```
   B → C
   ```

4. Payout executed to:

   ```
   C’s UPI ID
   ```

---

## 5. Mobile App

### 5.1 Features

* Token dashboard
* Ownership graph visualization
* Event triggers (demo)
* Payment interface
* Logs / activity feed

---

### 5.2 Tech Options

* React Native
* Flutter

---

### 5.3 UI Components

* Graph view (React Flow)
* Timeline replay
* Event log panel

---

## 6. API Design

### 6.1 Endpoints

#### Create Token

```
POST /token/create
```

#### Get Token

```
GET /token/{id}
```

#### Trigger Event

```
POST /event/death
```

#### Resolve Identity

```
GET /resolve/{id}
```

#### Initiate Payment

```
POST /payment/initiate
```

---

## 7. Storage Layer

### 7.1 Database

* Postgres (optional)
* or in-memory (hackathon)

---

### 7.2 Event Log (append-only)

Each entry:

```json
{
  "event": "death_verified",
  "timestamp": 123456,
  "prev_hash": "...",
  "hash": "..."
}
```

---

### 7.3 Hash Chain

* ensures tamper evidence
* blockchain-like without overhead

---

## 8. Real-Time Updates

* WebSockets / SSE
* push updates to mobile apps
* reflect ownership changes instantly

---

## 9. Security Model

* No storage of sensitive data (PINs, credentials)
* Only identity references
* signed events (optional)
* audit logs

---

## 10. Demo Setup

### Devices:

* 3 phones (A, B, C)
* 1 laptop (server)

---

### Flow:

1. A pays → system wallet
2. backend resolves
3. payout → C
4. UI updates in real time

---

## 11. Optional Enhancements

* WASM rule engine
* multi-sig event validation
* Account Aggregator integration
* DigiLocker API integration (future)

---

## 12. System Philosophy

* Event-driven architecture
* Deterministic state transitions
* Separation of identity and assets

---

## 13. Key Technical Insight

> Ownership is derived from state + rules + events, not stored statically.

---

## 14. Scalability (Future)

* microservices split:

  * identity service
  * resolver service
  * payment service
* distributed event log
* protocol standardization

---

## 15. Summary

This system is:

* not a wallet
* not a bank
* not a blockchain replacement

It is:

> **A programmable identity-driven financial resolution engine built as a middleware layer over existing infrastructure.**
