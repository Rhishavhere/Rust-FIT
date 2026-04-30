# MOBILE Implementation Tracker

## Goal
Deliver an Android-first native FIT app in `mobile-ui/` with secure QR connection flow, signed request/response/revoke/update messages, and profile visibility rules:
- before acceptance: display name + FIT score
- after acceptance: shared layers data

## Security constraints
- Signing keys stay local in secure storage (`expo-secure-store`)
- QR token is signed and verified
- Relay connection events are signed and verified
- Profile updates are signed and merged using JSON patch only after signature verification
- Revoke events are signed and immediately enforce access removal

## Execution phases (one-go loop)

### Phase 1 — Bootstrap `mobile-ui`
- [x] Create Expo TypeScript app in `mobile-ui/`
- [x] Add dependencies for secure store, camera QR, notifications, patch merge, signing
- [x] Add app config plugins/permissions for camera + notifications

### Phase 2 — Secure identity + persistence
- [x] Generate local signing keypair on first launch
- [x] Persist keys in secure store
- [x] Persist app state (profile/contacts/requests/activity) in async storage

### Phase 3 — Signed QR connect protocol
- [x] Define versioned QR token schema and encoder/decoder
- [x] Sign QR payload with local key
- [x] Verify scanned token signature and expiry before request send
- [x] Implement scanner + manual payload fallback

### Phase 4 — Connection lifecycle
- [x] Implement incoming/outgoing request stores
- [x] Implement accept/reject actions
- [x] Implement contacts list and contact detail
- [x] Enforce pre-accept preview model

### Phase 5 — Share/revoke + update notifications
- [x] Accept flow creates post-accept shared-layers access
- [x] Revoke flow signs and sends revoke event
- [x] Signed profile update publish path
- [x] Signed profile update apply + local notifications

### Phase 6 — Relay extension
- [x] Add peer registration (`REGISTER`)
- [x] Add peer-routed event handling (`CONNECT_REQUEST`, `CONNECT_RESPONSE`, `REVOKE_SHARE`, `PROFILE_UPDATE`)
- [x] Keep existing FIT fan-out behavior for legacy messages

### Phase 7 — Validation loop
- [x] Typecheck `mobile-ui`
- [x] Expo doctor dependency/SDK checks
- [x] Relay syntax check
- [ ] Device-to-device run on two Android clients
- [x] Android JS bundle export artifact (`mobile-ui/dist-android/`)
- [ ] Signed APK/AAB artifact

## Current blockers / next
- Need two live Android clients (or emulator pair) to fully validate handshake + realtime routing.
- Need EAS/keystore signing setup and Android build environment to produce distributable signed APK/AAB.

## Validation evidence (latest pass)
- `cd mobile-ui && npm run typecheck` ✅
- `cd mobile-ui && npx expo-doctor` ✅ (17/17 checks passed after adding missing peer dependency `react-native-svg`)
- `cd fit-relay && python -m py_compile relay_server.py` ✅
- `cd mobile-ui && npx expo export --platform android --output-dir dist-android` ✅
