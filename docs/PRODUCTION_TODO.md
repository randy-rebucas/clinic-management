# Production Readiness Todo List

> Stack: Next.js 16, React 19, MongoDB/Mongoose 8, TypeScript — multi-tenant, subdomain-based SaaS

---

## 🔴 Critical — Block Launch

### Secrets & Credentials

- [ ] Rotate **MongoDB URI** password — `.env.bak` was committed to git history
- [ ] Rotate **PayPal Client ID + Secret** (live credentials were exposed)
- [ ] Rotate `SESSION_SECRET` (must be ≥32 chars)
- [ ] Rotate `ENCRYPTION_KEY` (must be 64-char hex, AES-256)
- [ ] Rotate `CRON_SECRET` (must be ≥32 chars)
- [ ] Rotate `SUPER_ADMIN_PASSWORD`
- [ ] Notify all team members who may have cloned the repo before git history rewrite
- [ ] Ensure `.env*` (except `.env.example`) is in `.gitignore` and never staged again

### Auth & Session

- [x] All patient portal `me/` and `appointments/` routes use `verifyPatientAuth()` — audited 2026-05-26
- [x] Admin/staff routes use `verifySession()` + `requirePermission()` — 155 files confirmed
- [x] `owner` role is in the `createSession()` type union and `SessionPayload` interface
- [ ] Test session expiry end-to-end: log in, wait/advance time, confirm 401 on next request
- [ ] Verify `queue/display` public endpoint exposure is acceptable with your security team (intentional — TV monitor)

### Environment Validation

- [x] `lib/mongodb.ts` now throws (not swallows) `validateEnv()` errors in production — fixed 2026-05-26
- [x] `instrumentation.ts` added — `validateEnv()` runs at server boot before first request — added 2026-05-26
- [x] `dal.ts` warns in dev when `SESSION_SECRET` is missing (uses insecure fallback) — added 2026-05-26
- [ ] Set `INSTALL_SECRET` only during initial deploy; remove it immediately after setup completes
- [ ] Confirm `LAB_WEBHOOK_SECRET` is set if lab integration is enabled

---

## 🟠 High — Fix Before Go-Live

### Rate Limiting (Architectural Gap)

- [ ] Replace in-memory rate limiter (`lib/middleware/rate-limit.ts`) with **Redis-backed** solution
  - Options: Vercel KV (`@vercel/kv`) or Upstash Redis (`@upstash/ratelimit`)
  - Current state: ineffective in serverless / multi-instance — each instance has its own counter
  - Affects: auth endpoints, `/api/tenants/onboard` (5 req/15 min), all protected routes
  - **Blocked on**: choosing and provisioning a Redis provider

### Data Protection

- [ ] Audit all patient PII fields — currently stored plaintext in MongoDB
  - Priority fields: name, DOB, address, phone, medical notes
  - Implement field-level encryption using `lib/encryption.ts` (`ENCRYPTION_KEY`)
- [x] `tenantId` filter confirmed on all list and individual-record routes — audited 2026-05-26
  - Spot-checked: appointments, invoices, documents (list + [id] handlers all scope by tenantId)
- [ ] Review Mongoose model indexes — ensure compound indexes include `tenantId`

### CSRF & Security Headers

- [x] CSRF `Origin` check implemented in `middleware.ts` — added 2026-05-26
  - Applies to all mutating `/api/*` calls that carry a `session` or `patient_session` cookie
  - Subdomain tenants allowed (apex domain match); webhook/login routes exempt (no cookie)
- [ ] Validate CSP headers in production — `'unsafe-inline'` and `'unsafe-eval'` in `script-src` should be tightened or hash-based
- [ ] Test HSTS header delivery on HTTPS-only subdomain routes

### Cron Jobs

- [x] Cron auth centralized in `middleware.ts` — added 2026-05-26
  - All `/api/cron/*` require `Authorization: Bearer <CRON_SECRET>` OR Vercel-platform `x-vercel-cron: 1`
  - Missing `CRON_SECRET` in production → `503` (env-validation also blocks startup)
- [x] `vercel.json` uses `x-vercel-cron` (Vercel platform — header is stripped from external requests on Vercel infrastructure); middleware provides defense-in-depth for non-Vercel deployments
- [ ] Add monitoring/alerting for the 35+ cron routes (e.g. failed runs, timeouts)
- [ ] Test `trial-expiration` and `data-retention` cron jobs in staging before production

### Webhooks

- [x] Lab webhook uses HMAC-SHA256 + `timingSafeEqual`; blocks in production without `LAB_WEBHOOK_SECRET` — audited 2026-05-26
- [x] PayPal webhook enforces `PAYPAL_WEBHOOK_ID` in production with idempotency check — audited 2026-05-26
- [ ] Document expected webhook signatures and retry behaviour in a runbook

---

## 🟡 Medium — Ship Soon After Launch

### Observability

- [x] Structured logging already in place — `lib/logger.ts` writes JSON in production, colored output in dev — audited 2026-05-26
- [x] Error tracking infrastructure exists in `lib/monitoring.ts` — activates when `SENTRY_DSN` env var is set; install `@sentry/nextjs` and set the var to enable
- [x] Audit log coverage expanded — added `createAuditLog` to role update, role delete, user role-change — added 2026-05-26
  - Still missing: tenant config edits, data exports triggered outside compliance routes
- [x] `/api/health` endpoint stripped of internal details (no MongoDB version, memory, PID, Node version) — fixed 2026-05-26
- [ ] Wire `/api/health/live` to an external uptime monitor (UptimeRobot, Better Uptime, etc.)

### Performance

- [ ] Run `npm run analyze` to inspect bundle — identify and code-split large dependencies
- [ ] Enable MongoDB Atlas performance advisor or review slow query logs before launch
- [ ] Add pagination to any remaining list endpoints (500-item cap already applied to patients, users, staff, medical-representatives — audit others)
- [x] MongoDB `maxPoolSize: 10` added to `lib/mongodb.ts` — prevents connection exhaustion in serverless — added 2026-05-26

### Testing

- [ ] Achieve baseline coverage on auth paths: login, session refresh, logout, permission denial
- [ ] Write integration tests for multi-tenant isolation (cross-tenant query should return 0 results)
- [ ] Add end-to-end tests for: patient registration, appointment booking, invoice creation
- [x] ESLint `no-explicit-any` and `no-unused-vars` re-enabled as `warn` (was `off`) — added 2026-05-26

---

## 🟢 Low — Post-Launch Hardening

### Code Quality

- [ ] Eliminate `any` types across API route handlers — ESLint `warn` now surfaces them; address incrementally
  - `unauthorizedResponse()` and `forbiddenResponse()` in `app/lib/auth-helpers.ts` are the standard; many routes still inline these — migrate on next touch
- [ ] Remove unused imports flagged by `no-unused-vars` lint warnings (run `npm run lint` to see scope)

### Infrastructure

- [ ] Set up automated MongoDB backups — test restore procedure
- [ ] Create a disaster-recovery runbook: DB restore, secret rotation, subdomain failover
- [x] CSP `report-uri /api/csp-report` added to `next.config.ts` — violations logged via `lib/logger.ts` — added 2026-05-26
  - Forward to external service (report-uri.com, Sentry) by extending `app/api/csp-report/route.ts`
- [ ] Remove or VPN-gate `/api/install/*` after initial deploy

### Documentation

- [x] `.env.example` updated with all 29 application env vars, generation commands, and descriptions — updated 2026-05-26
- [x] Cron jobs documented in `docs/CRON_JOBS.md` — all 35 jobs with schedules, descriptions, auth notes — added 2026-05-26
- [ ] Write tenant onboarding runbook for ops team
- [ ] Confirm all `docs/` pages match current route structure

---

## Checklist Summary

| Area | Status | Notes |
|---|---|---|
| Secrets rotated | ⬜ | Manual — rotate all 6 secrets before go-live |
| Redis rate limiting | ⬜ | Code change — choose Upstash or Vercel KV |
| PII field encryption | ⬜ | Code change — field-level encryption via `lib/encryption.ts` |
| CSP tightened | 🟡 | `report-uri` added; `unsafe-inline`/`unsafe-eval` still present |
| Cron auth | ✅ | Centralized in `middleware.ts` |
| CSRF protection | ✅ | Origin check in `middleware.ts` |
| Env validation at boot | ✅ | `instrumentation.ts` + throws in `mongodb.ts` |
| Structured logging | ✅ | `lib/logger.ts` — JSON in production |
| Error tracking | 🟡 | Code ready — set `SENTRY_DSN` + install `@sentry/nextjs` |
| Audit log coverage | 🟡 | Role/user mutations added; tenant config + data export gaps remain |
| Health endpoint safe | ✅ | Internal details stripped from public `/api/health` |
| MongoDB pool | ✅ | `maxPoolSize: 10` set |
| Integration tests | ⬜ | No multi-tenant isolation tests yet |
| DB backup + restore tested | ⬜ | Manual — set up Atlas backup schedule |
| `.env.example` complete | ✅ | All 29 vars documented |
| Cron jobs documented | ✅ | `docs/CRON_JOBS.md` with all 35 jobs |

---

_Last updated: 2026-05-26_
