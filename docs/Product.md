# product.md

## 1. Problem Context

India has strong digital infrastructure layers:

* Identity → Aadhaar
* Tax identity → PAN
* Payments → UPI

However, **financial ownership and inheritance remain fragmented**.

When a person dies:

* Assets are scattered across banks, insurance, mutual funds, wallets
* Nominee data is inconsistent or outdated
* Families must manually navigate multiple institutions
* Processes are slow, opaque, and error-prone
* Large amounts of assets remain unclaimed

### Core Gap

There is **no unified system that determines “who owns what” dynamically across financial systems**.

---

## 2. Vision

> Build a **Financial Identity Protocol (FIP)** that computes ownership of financial assets in real time based on identity state and rules.

This is not:

* a bank
* a wallet
* a replacement for UPI

This is:

> A **programmable ownership resolution layer** sitting above existing financial systems.

---

## 3. Core Concept

Each individual has a:

### Financial Identity Token (FIT)

This token represents:

* ownership rights
* asset references
* nominee relationships
* inheritance rules

It does NOT store:

* money
* raw financial data

Instead, it acts as:

> A **deterministic map of financial authority**

---

## 4. Key Innovation

### Dynamic Ownership Resolution

Instead of static ownership:

```
Asset → User A
```

We introduce:

```
Asset → Identity(A) → Resolver → Current Owner
```

Ownership is **computed, not stored**.

---

## 5. Core Features

### 5.1 Identity Token Dashboard

* Token ID
* Linked identities (UPI ID, documents)
* Asset references (bank, insurance, etc.)
* Nominee graph

---

### 5.2 Ownership Graph

* Visual representation of:

  * successors
  * inheritance paths
* Example:

  * B → C (on death)

---

### 5.3 Event Engine

Supports life events:

* death
* inactivity
* manual triggers (demo)

Each event:

* triggers state transition
* updates ownership resolution

---

### 5.4 Rule Engine (Programmable Inheritance)

Users define rules like:

* “On death → transfer to C”
* “Split assets 70/30”
* “Lock until age 18”

---

### 5.5 Document Verification Layer

* Attach documents (e.g., death certificate)
* Simulated verification (DigiLocker-style)
* Event triggered after validation

---

### 5.6 Payment Resolution Layer

Instead of:

```
A → B
```

System does:

```
A → Settlement Layer → Resolver → Final Owner
```

This enables:

* dynamic routing of funds
* identity-based payments

---

## 6. Demo Narrative

### Scenario:

Users: A, B, C

* B has nominee C
* A sends money to B

---

### Before Event:

* B is ACTIVE
* A → B → B receives

---

### After Event (Death of B):

* Ownership transitions to C
* A sends to B again
* System resolves → C
* C receives funds

---

## 7. Product Philosophy

### 7.1 Not Replacing Infrastructure

* Works on top of existing systems
* Inspired by UPI’s standardization approach

---

### 7.2 Separation of Concerns

* Banks handle money
* FIP handles ownership logic

---

### 7.3 Privacy First

* No sensitive data stored in token
* Only references + rules

---

## 8. Future Vision

* Integration with Account Aggregators
* Integration with DigiLocker APIs
* Institutional adoption by banks
* Standard protocol for ownership resolution

---

## 9. One-Line Pitch

> “A programmable financial identity layer that determines who owns what—at any point in time.”

---

## 10. Why This Matters

* Reduces unclaimed assets
* Simplifies inheritance
* Enables automation in financial transitions
* Introduces a new primitive in fintech:

> **Ownership as a computable state**
