# FITShare Implementation Plan

This document outlines how the `.fitshare` mutual encrypted exchange is implemented in the Mobile MVP, perfectly mirroring the core architectural requirement where the QR code serves as an out-of-band delivery channel for the decryption key, rather than storing the actual file.

## 1. Cryptography (`crypto.ts`)
*   Added `generateShareKey()` to generate a 32-byte symmetric key for `tweetnacl.secretbox`.
*   Added `encryptFitShare(payload, key)`: Uses `tweetnacl.secretbox` to securely encrypt the JSON layers.
*   Added `decryptFitShare(ciphertext, nonce, key)`: Authenticates and decrypts the `.fitshare` payload.

## 2. Protocol & Payloads (`protocol.ts` & `types.ts`)
*   **QR Payload:** The QR code payload now includes `share_key` (the symmetric decryption key).
*   **Connection Messages:** Replaced the plain `CONNECT_REQUEST` / `CONNECT_RESPONSE` with `MUTUAL_EXCHANGE_REQUEST` and `MUTUAL_EXCHANGE_RESPONSE`.
*   **Encrypted Blobs:** Instead of sending raw `shared_layers` over the WebSocket relay, clients now send a `fitshare_blob` which contains the `{ ciphertext, nonce }`. The Relay server never sees the plaintext data.

## 3. The Mutual Exchange Flow (`App.tsx`)
1.  **Alice's QR Code:** Alice's app maintains a `sessionShareKey`. Her QR code broadcasts this key (`K_alice`).
2.  **Bob Scans:** Bob scans Alice's QR, extracting `K_alice`. 
3.  **Bob's Request:** Bob automatically creates his own `sessionShareKey` (`K_bob`), encrypts his profile layers into `bob.fitshare`, and sends a `MUTUAL_EXCHANGE_REQUEST` to Alice via the Relay. He stores `K_alice` locally in his outgoing request record.
4.  **Alice Receives & Decrypts:** Alice sees the incoming request. When she clicks **Accept**, her app first decrypts `bob.fitshare` using `K_bob` (which was included in Bob's request).
5.  **Alice Responds:** Alice then encrypts her own layers into `alice.fitshare` using her `sessionShareKey` (`K_alice`) and sends it back to Bob in a `MUTUAL_EXCHANGE_RESPONSE`.
6.  **Bob Decrypts:** Bob receives the response and decrypts `alice.fitshare` using `K_alice` (which he saved from the QR scan). Both parties now have each other's decrypted shared layers stored securely as Contacts.

## 4. UI/UX
*   The Debug log explicitly tracks the encryption and decryption steps (e.g., `[Crypto] encryptFitShare:done`).
*   The QR code generator and scanner are fully upgraded to handle the new key-exchange flow.
*   The Contact view relies on the dynamically decrypted layers, proving the `.fitshare` mechanism works end-to-end.
