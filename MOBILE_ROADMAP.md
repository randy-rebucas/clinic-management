# Mobile Roadmap & Technical Plan — myclinicsoft

**Prepared:** 2026-09-21
**Basis:** Live codebase review of `C:\Users\corew\projects\clinic-management` (`AUDIT.md`, `PRODUCT.md`, `app/`, `lib/`, `models/`), not a generic template.

---

## 1. Executive Summary

myclinicsoft is a mature, feature-dense Next.js 16 clinic management platform: 185 API routes, 83 pages, 35+ Mongoose models, multi-tenant RBAC, PH DPA-oriented audit logging, and an existing patient portal with its own session type. That is a genuinely strong foundation — most greenfield mobile efforts don't get to start with a working billing/queue/clinical domain layer.

It is not, however, a mobile-ready backend yet. The API is built for browser session cookies (`jose`-signed JWT in `session` / `patient_session` cookies), there is no API versioning discipline (`app/api/v1/` exists but only contains `health` — everything else is unversioned), and push notification plumbing exists but is web-push/VAPID (browser-only, not APNs/FCM).

**Correction to AUDIT.md item #1:** `proxy.ts` is not a wiring bug — Next.js 16 replaced `middleware.ts` with `proxy.ts` as the real edge-function file convention (confirmed against the installed `next@16.2.6` package internals). CSRF and cron protection in `proxy.ts` are active as written; no rename is needed, and none was made.

**New finding (not in AUDIT.md), now fixed:** the Socket.IO auth path in `server.ts` verified a `JWT_SECRET`-signed token that `lib/hooks/useWebSocket.ts` read from `localStorage`/`sessionStorage` — but nothing in `app/` or `lib/` ever issued or wrote that token, so real-time features (queue, appointments, visits) were silently non-functional. Fixed by:
- New `GET /api/auth/socket-token` — mints a 15-minute `jose`/`SESSION_SECRET`-signed token from the caller's existing HTTP-only session cookie (`app/api/auth/socket-token/route.ts`).
- `server.ts` now verifies that token with `jose`/`SESSION_SECRET` instead of `jsonwebtoken`/`JWT_SECRET` — the dual-secret split (AUDIT.md item #3) is gone; `jsonwebtoken` and `JWT_SECRET` are no longer referenced anywhere in the codebase.
- `lib/hooks/useWebSocket.ts` now fetches the token from that endpoint on connect instead of reading nonexistent storage keys.

Recommendation: build a **dedicated patient-facing React Native (Expo) app** first, talking to a new versioned, token-based mobile API layer added alongside (not replacing) the existing cookie-based web app. Treat mobile auth, offline sync, and push as new subsystems to design deliberately — don't try to stretch the existing cookie session model onto a mobile client.

---

## 2. Recommended Mobile Product Strategy

- **Keep the existing Next.js web app exactly as-is** for staff/admin/ops (doctors, nurses, receptionists, accountants, inventory, medical reps). This surface area is too dense and desktop-oriented (183 non-portal routes) to be worth re-platforming to mobile now.
- **Phase 1 — Patient mobile app.** Patients are the role with the clearest mobile-native use case: check appointments, view queue position, see lab results/prescriptions, receive push reminders, pay invoices. The web `(patient-portal)/` route group and its API routes are the existing analog — reuse the domain logic, not the web session/UI layer.
- **Phase 2 (optional, later) — Staff/doctor quick-access app.** Narrow scope: queue status, today's schedule, patient lookup, e-prescribing on the go. Do not attempt to port the full admin surface (billing, inventory, reports, tenant settings) to mobile — that stays web-only by design.
- Medical representative portal: no mobile case is evident from the codebase (`MedicalRepresentativeDashboardClient.tsx` is desktop CRM-shaped); out of scope unless product tells us otherwise.

---

**Major correction after deeper investigation (supersedes §3's original mobile-auth plan):** the patient-facing mobile API layer described below as a "Phase 1 to build" is largely **already implemented**. `POST /api/patients/auth/token` issues long-lived (30-day) Bearer tokens via password or OTP, and `verifyPatientAuth()` (`app/lib/patient-auth.ts`) already accepts `Authorization: Bearer <token>` on every `/api/patients/me/*` route — appointments, documents, invoices, lab-results, notifications, prescriptions, visits, vitals. That covers most of §4's MVP feature list at the API layer already. No `/api/v1/mobile/*` reimplementation is needed; a mobile client can point at `/api/patients/*` today.

What was genuinely missing, now built:
- **`models/MobileDevice.ts`** — device/push-token registry per patient (distinct from the existing `PushSubscription` model, which is browser web-push/VAPID only, not FCM/APNs-shaped).
- **`POST /api/patients/me/devices`** — register/update a device (deviceId, platform, Expo push token, app version).
- **`DELETE /api/patients/me/devices?deviceId=...`** — revoke a single device ("log out this device" / uninstall cleanup).
- Registered `MobileDevice` and the other previously-unregistered models (`Product`, `MedicalRepresentativeVisit`, `SupportRequest`, `PaypalOrder`, `PushSubscription`) in `models/index.ts`, closing AUDIT.md item #4.

**Push delivery — now built.** `lib/push-notifications.ts` only sent web-push (VAPID) to staff `User` records; there was no Expo/FCM/APNs send path for patients. Added:
- `expo-server-sdk` dependency (installed via `pnpm`, matching the project's actual package manager — `pnpm-lock.yaml` is authoritative, not `package-lock.json`).
- `sendPushToPatientDevices(patientId, payload)` in `lib/push-notifications.ts` — sends via Expo's push service to a patient's registered `MobileDevice` records, clears tokens Expo reports as `DeviceNotRegistered`.

**Bug found and fixed while wiring this in:** `lib/automations/queue-notifications.ts` was calling `sendPushToUser(queueEntry.patient.toString(), ...)` — passing a **Patient** `_id` into a function that queries `PushSubscription.userId`, which references the **User** (staff) collection. Patients never have rows there, so patient queue-position push notifications have been silently failing (same class of bug as the earlier dead Socket.IO auth path — a payload built for one identity type being passed to a lookup keyed on another). Switched that call site to `sendPushToPatientDevices()`.

**Appointment reminders and lab-result-ready — now wired too.** `sendPushToPatientDevices()` now returns `{ sent: boolean }` (it previously returned `void`, which would have silently corrupted the SMS/email/push "was anything actually sent" bookkeeping these automations rely on). Added a `sendPush` option and push branch to:
- `lib/automations/lab-notifications.ts` (`sendLabResultNotification`) — "Lab Results Available" push alongside existing SMS/email.
- `lib/automations/appointment-confirmation.ts` (`sendConfirmationRequest`) — "Confirm Your Appointment" push alongside existing SMS/email.

Both follow the codebase's existing per-channel `send*` boolean option pattern rather than introducing a new abstraction.

Not touched, deliberately: ~10 other automations under `lib/automations/` (`health-reminders`, `payment-reminders`, `prescription-refills`, `membership-expiry`, `visit-followup`, etc.) follow the same SMS/email pattern without push. Left as a follow-up rather than a blanket sweep — each should get a product decision on whether it's push-worthy before wiring, rather than push notifications being added mechanically everywhere SMS exists today.

**Separate, unrelated bug noticed but left alone:** `appointment-confirmation.ts`'s `processConfirmationResponse` calls `createNotification({ userId: patient._id, ... })`, writing a `Notification` row with `user` set to a Patient `_id` even though that field is `ref: 'User'`. Harmless today only because `/api/patients/me/notifications` derives its feed from clinical records directly rather than querying the `Notification` collection — but it's the same "wrong identity type passed across a collection boundary" bug class as the two fixed above. Out of scope for this pass; worth a dedicated look.

---

## 9. Patient App Shell — Built

A working Expo/React Native app now exists at `C:\Users\corew\projects\clinic-management-mobile` (sibling repo, chosen over a subfolder to keep the RN/Expo toolchain out of the Next.js repo). `expo-doctor` reports 21/21 checks passing; `tsc --noEmit` is clean.

**Stack:** Expo SDK 57, `expo-router` (file-based routing), TypeScript strict mode, `expo-secure-store` for the auth token, `expo-notifications` + `expo-device` for push registration.

**What it does:**
- `login.tsx` — email/password sign-in against the existing `/api/patients/auth/token` endpoint (OTP method also supported in `lib/auth.tsx`, not yet exposed in the UI).
- `(app)/` tab group, gated by an auth redirect in its `_layout.tsx`: **Home** (shortcuts), **Appointments** (list), **Queue** (live position card, 15s foreground poll — see note below), **Results** (lab results list), **Profile** (logout).
- `lib/api.ts` — thin fetch wrapper attaching `Authorization: Bearer` from `SecureStore`.
- `lib/push.ts` — requests notification permission, obtains an Expo push token, and registers it via `POST /api/patients/me/devices` on login; unregisters on logout.

**Two more backend gaps found and closed while building this:** there was no `/api/patients/me/appointments` or `/api/patients/me/queue` endpoint — every other patient resource (lab results, prescriptions, invoices, visits, vitals, documents) had one, but not these two, which the roadmap's own MVP list depends on. Added both, following the existing pagination/tenant-scoping pattern; `/me/queue` reuses the same position-calculation logic as `lib/automations/queue-notifications.ts`.

**Why polling, not the web app's Socket.IO channel:** keeping a persistent socket alive correctly across iOS/Android background/foreground/kill states is a materially harder problem than a 15-second foreground poll, and the payoff is small until push-triggered refresh is added. Documented as a deliberate choice in `app/(app)/queue.tsx`, not an oversight.

**Not done / explicit non-goals for this pass:**
- No refresh-token rotation — the app stores the same 30-day Bearer token the backend already issues; re-login on expiry.
- Prescriptions, invoices, documents, and profile-editing screens aren't built yet — Appointments/Queue/Results were prioritized as the roadmap's highest-value MVP items.
- No offline caching (§ "risks" still recommends read-only caching as a separate phase, not attempted here).
- No EAS build/submit configuration — this only runs via `expo start` (Expo Go / dev client) so far, not a store-ready build.
- OTP login has backend + client support in `lib/auth.tsx` but no UI toggle in `login.tsx` yet.

## 3. Recommended Technical Architecture (original plan — see correction above for current reality)

```
┌─────────────────────┐        ┌──────────────────────┐
│  Existing Web App    │        │  Patient Mobile App   │
│  (Next.js, cookies)  │        │  (Expo / React Native)│
└──────────┬───────────┘        └───────────┬───────────┘
           │ session cookie                  │ Bearer JWT (access+refresh)
           ▼                                  ▼
┌──────────────────────────────────────────────────────────┐
│   app/api/**            (existing, cookie-authed)          │
│   app/api/v1/mobile/**  (NEW — token-authed, versioned)     │
│      - thin adapters over existing lib/ domain logic        │
│      - NOT a parallel reimplementation of business rules    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
           lib/ (permissions, tenant-query, audit, …) + MongoDB
```

Key architecture decisions:
- **Don't fork business logic.** The mobile API layer should call the same `lib/` functions (`tenant-query.ts`, `permissions.ts`, `audit.ts`, domain services) that the web API routes use today. New route handlers under `app/api/v1/mobile/*`, same underlying logic, different auth/response shape.
- **API versioning starts now, for real.** `app/api/v1/` already exists but is effectively unused (only `health`). Standardize: all new mobile-consumed endpoints live under `/api/v1/mobile/...`; freeze `/api/v1/*` contract semantics once mobile ships (breaking changes require `/api/v2`).
- **Separate mobile auth service, not cookie reuse.** Mobile can't rely on HTTP-only cookies the way the web app and patient portal do. Build a token-issuing endpoint (`POST /api/v1/mobile/auth/login`) that returns a short-lived access JWT + refresh token pair, reusing the same `jose`/`SESSION_SECRET` signing primitives already in `app/lib/dal.ts` but with a distinct `type: 'patient-mobile'` payload discriminator (mirroring the existing `type: 'patient'` pattern used for the web patient portal).

---

## 4. MVP Feature List — Patient App (Phase 1)

Mapped directly to what already exists in the domain layer (`models/Patient.ts`, `Appointment.ts`, `Prescription.ts`, `LabResult.ts`, `Invoice.ts`, `Queue.ts`, `Notification.ts`):

1. Login (mobile token auth) + biometric unlock (device-local, not a backend concern)
2. Upcoming appointments — view, cancel, request reschedule
3. Live queue position (reuse existing QR/queue model — likely via Socket.IO or polling; see §7 offline note)
4. Lab results — read-only, PDF/document view via existing Cloudinary-backed `Document` model
5. Prescriptions — view active/past e-prescriptions
6. Invoices — view + pay (reuse existing PayPal integration, `lib/paypal.ts`)
7. Push notifications — appointment reminders, result-ready alerts, queue-turn alerts
8. Profile — basic demographic edit, consent/PH DPA acknowledgments

Deliberately excluded from MVP: booking new appointments (needs conflict/room logic more safely tested via web first), insurance flows (`lib/automations/insurance-verification.ts` is a stub per the audit — nothing to build mobile UI against yet).

---

## 5. Phase-by-Phase Roadmap

| Phase | Scope | Rough sequencing |
|---|---|---|
| 0. Pre-mobile hardening | ~~Fix `proxy.ts`→`middleware.ts` wiring~~ (not a bug — see correction above); **done:** hardened hardcoded `SESSION_SECRET` fallback to hard-fail in production in `app/lib/dal.ts` and `app/lib/auth-helpers.ts`; **done:** fixed dead Socket.IO auth (was verifying a token nothing ever issued) and unified it onto `SESSION_SECRET`, removing `jsonwebtoken`/`JWT_SECRET` entirely | done |
| 1. Mobile API foundation | `/api/v1/mobile/*` route scaffold, mobile auth (access+refresh tokens), device/session registry, rate limiting on auth endpoints | 3–4 weeks |
| 2. Expo app shell + auth | RN/Expo project, login/biometric, secure token storage (`expo-secure-store`), navigation shell | 2–3 weeks (parallel with Phase 1 backend) |
| 3. Core patient features | Appointments, queue view, lab results, prescriptions (read paths first) | 4–6 weeks |
| 4. Push notifications | APNs/FCM via Expo push service, backend fan-out extending existing `lib/push-notifications.ts` (currently web-push/VAPID only) | 2–3 weeks, overlaps Phase 3 |
| 5. Payments + documents | PayPal in-app flow, secure document viewing (signed Cloudinary URLs, short TTL) | 2–3 weeks |
| 6. Offline-first pass | Cache last-known appointments/queue/results for offline viewing; sync-on-reconnect | 3–4 weeks |
| 7. Beta + store submission | TestFlight/Play internal testing, App Store/Play Store review prep | 2–4 weeks (store review is often the long pole) |
| 8. (Optional) Staff quick-access app | Narrow-scope RN app for queue/schedule/lookup | Separate track, post-Phase-7 |

Total to patient-app GA, excluding Phase 8: roughly 4–5 months with one focused mobile team plus backend support, assuming Phase 0 lands first.

---

## 6. Required Backend Changes Before Mobile Launch

1. ~~Fix `middleware.ts` wiring~~ — not applicable; `proxy.ts` is the correct Next.js 16 convention and is active. (See correction in §1.)
2. **Kill the hardcoded `SESSION_SECRET` fallback** in `app/lib/auth-helpers.ts` and gate the dev-only default in `app/lib/dal.ts` strictly behind `NODE_ENV !== 'production'` with a hard throw otherwise. **✅ Done** — both files now resolve to an empty/invalid key in production when `SESSION_SECRET` is unset, and `verifyToken()`/`validateSecret()` throw instead of silently accepting the known dev default.
3. **Build token-based auth** — access/refresh JWT pair issuance + rotation + revocation (device logout, "log out all devices"). Nothing like this exists yet; today's model is purely cookie sessions.
4. **Device/session registry** — new lightweight model (e.g. `MobileDevice`) tracking device id, push token, last-seen, app version, for targeted push and remote session revocation.
5. **Replace/extend `lib/push-notifications.ts`** — current implementation is web-push/VAPID (browser only). Add FCM/APNs delivery (Expo push service is the pragmatic route — it abstracts both).
6. **Finish TODO email/SMS integrations** flagged in the audit (appointment reminders, visit follow-ups) — mobile push will amplify the visibility of these gaps once patients expect real-time reminders.
7. **Complete `registerAllModels()`** in `models/index.ts` (audit item #4) — missing model registrations are a landmine for any new mobile-facing queries touching `PushSubscription`, `Product`, etc.
8. **Document and version `/api/v1/mobile/*` contracts explicitly** — no versioning discipline exists today beyond an empty `v1/health` stub.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Mobile auth built as a bolt-on that diverges from web/patient-portal session logic, creating two sources of truth | Reuse `app/lib/dal.ts` signing primitives; keep one canonical JWT payload schema with a `type` discriminator per surface (`patient`, `patient-mobile`, staff role) |
| `proxy.ts` CSRF/security gap ships to production before mobile launch, and mobile's new public auth endpoints compound the exposure | Treat Phase 0 as a hard gate, not a nice-to-have, before any mobile endpoint goes live |
| Offline sync conflicts (e.g., patient cancels appointment offline while staff reschedules it server-side) | Keep MVP offline scope to **read-only caching** (view last-known data), not offline writes; defer conflict resolution to a later phase |
| Push notification architecture rebuilt twice (once for web push, once for mobile) diverging over time | Introduce a single notification-dispatch abstraction in `lib/notifications.ts` with pluggable channels (web-push, APNs/FCM via Expo, SMS, email) rather than parallel systems |
| PH DPA compliance gap on mobile (device loss, local caching of PHI) | Secure local storage only (`expo-secure-store`), no PHI in plain AsyncStorage, short-lived signed document URLs, remote wipe via device/session registry revocation |
| Store review delays (Apple in particular scrutinizes health apps) | Budget Phase 7 generously; prepare privacy nutrition labels and PH DPA/data-handling disclosures early, not at submission time |
| Scope creep — admin/billing/inventory features pulled into "mobile" because they exist in the web app | Explicit non-goals in §4; staff app (Phase 8) is a separate, narrower product decision, not a port |

---

## 8. Recommended Next Actions, In Order

1. Land Phase 0 fixes (`middleware.ts` wiring, `SESSION_SECRET` hardening) — independent of mobile, already flagged as critical in the existing audit.
2. Decide and document the mobile JWT payload schema (`type: 'patient-mobile'`) and token lifetime/refresh policy.
3. Scaffold `app/api/v1/mobile/auth/*` (login, refresh, logout, device registration) reusing existing `lib/` domain logic.
4. Stand up the Expo app shell with login + secure token storage against that new auth API (nothing else yet — prove the auth loop end-to-end first).
5. Build out read-path features (appointments, queue, results, prescriptions) before any write paths.
6. Wire push via Expo's push service, extending `lib/notifications.ts` with a channel abstraction rather than a parallel system.
7. Add PayPal payment flow and secure document viewing.
8. Offline read-cache pass, then beta + store submission prep.

---

*Grounded in this project's actual state as of 2026-09-21: strong operational/clinical depth, PH DPA-oriented compliance posture, but a cookie-session, unversioned API surface not yet designed for a native mobile client.*
