# Clinic Management Project Audit

**Project name:** `myclinicsoft`
**Audit date:** 2026-04-04
**Framework:** Next.js (App Router) — multi-tenant SaaS

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React 19 |
| Styling | Tailwind CSS v4 |
| Language | TypeScript (strict mode) |
| Database | MongoDB + Mongoose |
| Auth | jose (JWT in HTTP-only cookies) + bcryptjs |
| Validation | Zod v4 |
| Payments | PayPal SDK |
| Media | Cloudinary |
| Email / SMS | Nodemailer + Twilio |
| Realtime | Socket.IO |
| Push notifications | web-push (VAPID) |
| Testing | Vitest + Jest |
| Deploy | Vercel |

---

## 2. Database Models

### Staff / Auth
`User`, `Role`, `Permission`, `Admin`, `Doctor`, `Nurse`, `Receptionist`, `Accountant`, `Staff`, `MedicalRepresentative`

### Clinical
`Patient`, `Appointment`, `Visit`, `Prescription`, `LabResult`, `Imaging`, `Procedure`, `Referral`, `Document`

### Operations
`Queue`, `Invoice`, `Membership`, `InventoryItem`, `Medicine`, `Service`, `Room`, `Specialization`, `Settings`

### Other
`Tenant`, `Notification`, `AuditLog`, `PushSubscription`, `PaypalOrder`, `SupportRequest`, `Product`, `MedicalRepresentativeVisit`

---

## 3. API Surface (185 routes)

| Domain | Key endpoints |
|---|---|
| Auth / Users / Tenants | login, staff, roles, permissions, onboarding |
| Patients | CRUD, QR login, portal, alerts, outstanding balance |
| Clinical | appointments, visits, queue, prescriptions, lab results, referrals, documents |
| Billing | invoices, memberships, payments, receipts |
| Reports / Analytics | dashboard, role-based, income, demographics, inventory |
| Inventory | medicines, services, rooms, specializations |
| Communications | notifications, broadcast, push |
| Medical Reps | full portal — login, visits, products, support |
| SaaS | subscription (PayPal), storage usage, audit logs, compliance, backups |
| Cron jobs | 15+ automated jobs (backup, reminders, expiry, cleanup, reports) |

---

## 4. Frontend Pages (83 pages)

| Route group | Purpose |
|---|---|
| `(app)/` | Main authenticated clinic dashboard |
| `(auth)/login` | Staff login |
| `(public)/` | Marketing, pricing, booking, onboarding |
| `(patient-portal)/` | Patient self-service portal |
| `(medical-representative-portal)/` | Medical rep portal |
| `(knowledge-base)/` | Docs / knowledge base |
| `marketing-funnel/` | Standalone marketing funnel |

---

## 5. Auth & Multi-Tenancy

- **Staff sessions:** JWT in `session` cookie (HS256, 7-day expiry) via `jose` — created in `app/lib/dal.ts`
- **Patient sessions:** Separate `patient_session` cookie with `type: 'patient'` payload
- **Authorization:** `requirePermission()` with DB-backed role/permission RBAC (`app/lib/auth-helpers.ts`, `lib/permissions.ts`)
- **Tenant isolation:** `tenantId` on all models, `addTenantFilter()` query helper (`lib/tenant-query.ts`), subdomain-based resolution (`lib/tenant.ts`)
- **Cookie sharing:** `COOKIE_DOMAIN` env var used for apex domain cookie sharing

---

## 6. Key File Map

| Topic | File |
|---|---|
| Dependencies & scripts | `package.json` |
| Model registry & relationships | `models/index.ts` |
| Session crypto (JWT) | `app/lib/dal.ts` |
| API auth helpers | `app/lib/auth-helpers.ts` |
| Tenant context / subdomain | `lib/tenant.ts` |
| Tenant query scoping | `lib/tenant-query.ts` |
| Edge security (intended middleware) | `proxy.ts` |
| App shell auth layout | `app/(app)/layout.tsx` |
| Staff login server actions | `app/actions/auth.ts` |
| Env validation | `lib/env-validation.ts` |
| Env template | `.env.example` |
| WebSocket server | `server.ts` |
| PayPal integration | `lib/paypal.ts` |

---

## 7. Issues & Concerns

### Critical

| # | Issue | File | Notes |
|---|---|---|---|
| 1 | **`middleware.ts` is missing** | `proxy.ts` | Next.js expects root `middleware.ts`. The CSRF protection, cron auth header checks, and security headers in `proxy.ts` are **not running** because the file is never wired in. Fix: rename `proxy.ts` → `middleware.ts` or re-export it from `middleware.ts`. |
| 2 | **Hardcoded fallback `SESSION_SECRET`** | `app/lib/auth-helpers.ts` lines 21–22 | Falls back to a hardcoded default if `SESSION_SECRET` is unset. If accidentally used in production all sessions are compromised. |
| 3 | **Dual JWT secrets** | `server.ts` vs `app/lib/dal.ts` | HTTP sessions use `SESSION_SECRET`; Socket.IO uses `JWT_SECRET`. Two different mechanisms — easy to misconfigure or leave one unset. |

### Moderate

| # | Issue | File | Notes |
|---|---|---|---|
| 4 | **`registerAllModels()` incomplete** | `models/index.ts` lines 229–303 | `Product`, `MedicalRepresentativeVisit`, `SupportRequest`, `PaypalOrder`, `PushSubscription` are missing from the explicit `require()` list. |
| 5 | **`.env.example` severely incomplete** | `.env.example` | Only documents 4 variables (`MONGODB_URI`, `SESSION_SECRET`, `ROOT_DOMAIN`, `COOKIE_DOMAIN`). Production needs 20+ (PayPal, Twilio, Cloudinary, VAPID, `CRON_SECRET`, `ENCRYPTION_KEY`, etc.). |
| 6 | **Signup action logs in as new user** | `app/actions/auth.ts` lines 119–129 | After an admin creates a new user, `createSession` is called for the newly created account rather than the admin. Likely unintended — admin should stay logged in as themselves. |

### Minor / Incomplete

| # | Issue |
|---|---|
| 7 | Email/SMS sending marked `TODO` in appointment reminders, visit follow-ups, and broadcast flows |
| 8 | Insurance verification API not integrated (stub/placeholder only in `lib/automations/insurance-verification.ts`) |
| 9 | Medical rep payment gateway marked `TODO` (`lib/medical-rep-payment.ts`) |
| 10 | Purchase orders / advanced inventory reordering marked `TODO` in inventory automation |
| 11 | `next.config.ts` lines 75–76 reference `middleware.ts` in comments but the file does not exist |
| 12 | `MedicalRepresentativeDashboardClient.tsx` line 67 — future visit tracking flagged in comment |

---

## 8. Recommended Priorities

1. **Rename `proxy.ts` → `middleware.ts`** (or create `middleware.ts` that re-exports it) — this is a critical security gap; CSRF and cron protection are not active.
2. **Fix the signup `createSession` bug** in `app/actions/auth.ts` — admin should not be logged out after creating a new user.
3. **Remove or strictly gate the hardcoded fallback `SESSION_SECRET`** — only allow it in `NODE_ENV=development`.
4. **Expand `.env.example`** to document every required and optional environment variable with descriptions.
5. **Complete `registerAllModels()`** in `models/index.ts` to include all model files.
6. **Finish TODO email/SMS integrations** — appointment reminders, visit follow-ups, and lab notifications should actually send.
7. **Unify JWT secrets** — consolidate Socket.IO auth to use the same `SESSION_SECRET` / `jose` pattern or clearly document why two separate secrets are needed.

---

*Generated by automated audit — 2026-04-04*
