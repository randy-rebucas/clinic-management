# AI Context Profile — MyClinicSoft

Reference doc for AI coding agents working in this repo. Complements [README.md](README.md) (features/pages) and [COMPANY_PROFILE.md](COMPANY_PROFILE.md) / [AUDIT.md](AUDIT.md) (business/security history). This file focuses on architecture, conventions, and gotchas that aren't obvious from a quick skim.

## Stack

- **Framework**: Next.js 16 (App Router), React 19.2, TypeScript
- **Database**: MongoDB via Mongoose 8 (`lib/mongodb.ts` connection helper)
- **Auth**: JWT via `jose`, sessions in httpOnly cookies, 7-day expiry (`app/lib/dal.ts`)
- **Multi-tenancy**: Subdomain-based; every query scoped by `tenantId` (`lib/tenant.ts`, `lib/tenant-query.ts`)
- **Payments**: PayPal (`@paypal/paypal-server-sdk`, `lib/paypal.ts`)
- **Package manager**: pnpm (`pnpm-lock.yaml` + `pnpm-workspace.yaml` present; `package-lock.json` also exists — confirm which is authoritative before adding deps)
- **Testing**: Both Vitest (`vitest.config.ts`, `test`/`test:watch`/`test:coverage` scripts) and Jest (`jest.config.js`, `test:jest*` scripts) are configured — check which a given test file targets
- **Other integrations**: Cloudinary (file storage), Twilio-style SMS (`lib/sms.ts`), Nodemailer (email), `otplib` (2FA/TOTP), `html5-qrcode`/`qrcode`/`react-qr-code` (queue system), `recharts` (reports), FHIR export (`lib/fhir.ts`), ICD-10 lookups (`lib/icd10.ts`)

## Request-edge security layer

**`proxy.ts` at the project root** — NOT `middleware.ts`. Next.js 16 renamed the file-convention from `middleware.ts` to `proxy.ts`; if you go looking for edge-layer logic, look here first. It handles, in order:
1. Cron protection — `Authorization: Bearer <CRON_SECRET>` required on all `/api/cron/*` (the `x-vercel-cron` header is NOT trusted, it's spoofable)
2. Install route lockdown — blocks `/api/install/*` in production unless `INSTALL_SECRET` is set
3. CSRF protection — validates `Origin` header on state-changing requests that carry a session cookie
4. Security headers — CSP, HSTS, Permissions-Policy, X-Frame-Options, X-Content-Type-Options (CSP is also set statically in `next.config.ts`)

## Directory map

| Path | Purpose |
|---|---|
| `app/(app)/` | Authenticated staff-facing app (dashboard, patients, appointments, etc.) |
| `app/(auth)/` | Login/signup flows |
| `app/(patient-portal)/` | Public patient-facing portal (separate session type — see below) |
| `app/(medical-representative-portal)/` | Portal for pharma/medical reps |
| `app/(knowledge-base)/` | Public knowledge base |
| `app/(public)/` | Other public pages (booking, marketing) |
| `app/api/` | ~186 REST route handlers, one folder per resource; `app/api/cron/` has 35+ scheduled job routes; `app/api/v1/` is a newer versioned surface (currently just `health`) |
| `app/actions/` | Server actions |
| `models/` | Mongoose schemas — one file per collection (Patient, Doctor, Visit, Prescription, Invoice, Tenant, Role, Permission, AuditLog, etc.) |
| `lib/` | Shared server logic: auth helpers, encryption, tenant scoping, permissions, subscription/billing logic, drug interactions, dosage calculator, i18n, monitoring |
| `lib/middleware/` | Rate limiting (`rate-limit.ts` — in-memory, see Known Issues) |
| `lib/automations/`, `lib/hooks/`, `lib/websocket/` | Background/automation logic, shared hooks, websocket support |
| `components/` | React components |
| `scripts/` | Operational tsx scripts: install, seed, tenant onboarding/deletion, DB backup/restore/reset, admin creation |
| `docs/` | Additional documentation |
| `backups/` | (check `.gitignore` status — DB backups should not be committed) |

## Auth & permissions model

- Staff/admin auth: `verifySession()` in `app/lib/dal.ts`, then `requirePermission()` per route
- Patient portal auth: separate `verifyPatientSession()` from `dal.ts` — patient portal routes use a distinct signed JWT cookie (`patient_session`), not the staff session
- Role permission source of truth: `defaultRolePermissions` in `app/lib/auth-helpers.ts` (previously duplicated in 3 places, since consolidated)
- `hasPermission()` in `lib/permissions.ts` takes `tenantId` and delegates to `getUserPermissions()`
- Roles include: admin, owner, doctor, nurse, receptionist, accountant, staff (see `models/Role.ts`, `models/Permission.ts`)

## Conventions

- Every DB query scoped with `{ tenantId: new Types.ObjectId(tenantId) }` — never query a tenant-owned collection without this filter
- API error shape: `{ success: false, error: '...' }` with appropriate HTTP status; success shape generally `{ success: true, data: ... }`
- User-supplied search input must go through `sanitizeSearch()` / `escapeRegex()` in `lib/utils.ts` before being used in a Mongo regex (ReDoS prevention)
- Cron routes: caller must send `Authorization: Bearer <CRON_SECRET>` — enforced centrally in `proxy.ts`, not per-route
- Webhook routes (PayPal, lab results): HMAC-SHA256 signature verification with `crypto.timingSafeEqual`, never a plain string comparison
- Pagination: capped at 500 max results (patients, users, staff, medical-representatives routes)
- `.env.bak` must never be committed — it was accidentally committed once and purged from git history; it's now gitignored

## Environment variables (production-required)

| Variable | Requirement |
|---|---|
| `MONGODB_URI` | Required |
| `SESSION_SECRET` | Required, min 32 chars |
| `CRON_SECRET` | Required, min 32 chars |
| `ENCRYPTION_KEY` | Required, 64-char hex (AES-256) |
| `INSTALL_SECRET` | Set during initial deploy only, then remove |
| `LAB_WEBHOOK_SECRET` | Required if using lab integration |
| `PAYPAL_WEBHOOK_ID` | Required in production for PayPal webhook verification |

Validated in `lib/env-validation.ts`.

## Known architectural gaps (not yet fixed)

- **Rate limiting is in-memory** (`lib/middleware/rate-limit.ts`) — ineffective across multiple serverless instances; needs Redis (Vercel KV / Upstash) for correctness at scale
- **PII stored in plaintext** — no field-level encryption on patient data beyond what `lib/encryption.ts` provides for specific fields
- **Audit logging is partial** — not every admin action is logged yet (`models/AuditLog.ts`, `lib/audit.ts`)
- **ESLint has `no-explicit-any` and `no-unused-vars` turned off** — don't rely on lint to catch type-safety gaps in this repo; be extra careful with `any` creep

## Things to verify before assuming (drift risk)

- Confirm pnpm vs npm as the actual package manager in use (both lockfiles present)
- Confirm whether `app/api/v1/` is an active migration target or an abandoned start — check recent commits/issues before adding routes there
- `middleware.ts` does not exist in this repo — its logic is in `proxy.ts` (Next.js 16 convention). Any older docs/memory referencing `middleware.ts` are stale.
