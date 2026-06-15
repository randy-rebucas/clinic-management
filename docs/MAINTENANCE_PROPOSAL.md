# Maintenance Proposal — MyClinicSoft

**Prepared by:** Randy Rebucas  
**Date:** 2026-05-29  
**Stack:** Next.js 16, React 19, MongoDB/Mongoose 8, TypeScript — multi-tenant SaaS  
**Scope:** Ongoing post-launch maintenance, hardening, and reliability improvements  
**Currency:** Philippine Peso (₱) — exchange rate used: ₱56 per USD

---

## Cost Summary at a Glance

| Category | Monthly Recurring | One-Time / Setup |
|---|---|---|
| Hosting — Vercel | ₱1,120 – ₱2,240 | — |
| Database — MongoDB Atlas | ₱3,192 – ₱10,640 | — |
| Redis — Upstash | ₱0 – ₱1,120 | — |
| Error tracking — Sentry | ₱0 – ₱1,456 | — |
| Uptime monitoring — UptimeRobot | ₱0 – ₱392 | — |
| Cron monitoring — Healthchecks.io | ₱0 – ₱448 | — |
| Email — SendGrid / Resend | ₱0 – ₱1,120 | — |
| Payment gateway — PayPal | % per txn | — |
| **Infrastructure total** | **~₱4,312 – ₱17,416 / mo** | — |
| **Engineering — Phase 1–4** | — | **~₱268,800 – ₱564,480** |
| **Monthly retainer (30% of infra)** | **₱3,612 – ₱4,637 / mo** | — |

---

## Executive Summary

MyClinicSoft is a production-grade, multi-tenant clinic management platform with ~186 API routes, 35+ cron jobs, patient portal, billing, lab integration, and subdomain-based tenancy. A full security audit was completed on 2026-05-26, resolving 19 critical and high findings. This proposal outlines the remaining work needed to bring the system to a stable, maintainable production state.

---

## Phase 1 — Pre-Launch Blockers (Immediate)

These items must be completed before any production traffic is served.

### 1.1 Secret Rotation

All of the following were exposed in a committed `.env.bak` file. Git history has been rewritten, but anyone who cloned before the rewrite may have copies.

| Secret | Action |
|---|---|
| MongoDB URI password | Rotate in Atlas; update `MONGODB_URI` |
| PayPal Client ID + Secret | Rotate in PayPal Developer Dashboard |
| `SESSION_SECRET` | Generate new value ≥ 32 chars |
| `ENCRYPTION_KEY` | Generate new 64-char hex (AES-256) |
| `CRON_SECRET` | Generate new value ≥ 32 chars |
| `SUPER_ADMIN_PASSWORD` | Change via admin panel or seed script |

**Effort:** ~2 hours  
**Risk if skipped:** Active credential exposure; any actor with the old repo clone can authenticate or decrypt data.

### 1.2 Production Environment Validation

- Set `INSTALL_SECRET` only for the initial deploy run, then remove it.
- Confirm `LAB_WEBHOOK_SECRET` is set if lab integration is active.
- Verify `MONGODB_URI`, `SESSION_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY` are set — `instrumentation.ts` will block startup if they are missing.

**Effort:** 1 hour

### 1.3 Session Expiry End-to-End Test

Verify that expired sessions return `401` and do not grant access. The JWT TTL is 7 days; test with a manually shortened expiry in staging.

**Effort:** 2 hours

---

## Phase 2 — High Priority (Within 2 Weeks of Launch)

### 2.1 Redis-Backed Rate Limiting

**Current state:** In-memory rate limiter (`lib/middleware/rate-limit.ts`) — ineffective in serverless/multi-instance deployments. Each function instance holds its own counter, so limits are easily bypassed by natural request distribution.

**Proposed solution:** Replace with [Upstash Redis](https://upstash.com/) via `@upstash/ratelimit` — zero-ops, pay-per-use, works natively with Vercel.

**Affected endpoints:** All auth routes, `/api/tenants/onboard` (5 req/15 min), patient login.

**Effort:** 1 day  
**Dependencies:** Upstash account provisioning + env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)

### 2.2 Patient PII Field-Level Encryption

**Current state:** Patient name, DOB, address, phone, and medical notes are stored as plaintext in MongoDB.

**Proposed solution:** Apply `lib/encryption.ts` (`ENCRYPTION_KEY`) at the Mongoose model layer for the priority PII fields. Encrypt on write; decrypt on read inside the model's `transform` or virtual getters.

**Priority fields:** `name`, `dateOfBirth`, `address`, `phoneNumber`, `medicalNotes`

**Effort:** 3–5 days (includes migration script for existing records)

### 2.3 Content Security Policy Tightening

**Current state:** `script-src` contains `'unsafe-inline'` and `'unsafe-eval'`, which significantly weakens XSS protection. `report-uri /api/csp-report` is active and logging violations.

**Proposed solution:**
1. Review CSP violation reports from `/api/csp-report` to identify which inline scripts are firing.
2. Replace `'unsafe-inline'` with nonce-based CSP (Next.js 14+ supports this via middleware).
3. Remove `'unsafe-eval'` — audit any dynamic `eval()` usage in third-party scripts.

**Effort:** 2–3 days

### 2.4 Cron Job Monitoring

35+ cron jobs run on schedules ranging from hourly to monthly. There is currently no alerting for failed runs or timeouts.

**Proposed solution:**
- Integrate [Healthchecks.io](https://healthchecks.io/) (free tier covers 20 checks) — each cron pings a unique URL on success; missed pings trigger alerts.
- Alternatively, send structured failure events to Sentry (already wired via `lib/monitoring.ts`) if `SENTRY_DSN` is set.
- Priority jobs to monitor first: `trial-expiration`, `data-retention`, `appointment-reminders`, `invoice-generation`.

**Effort:** 1 day

### 2.5 Uptime Monitoring

Wire `/api/health/live` to an external uptime monitor.

**Recommended:** UptimeRobot (free, 5-minute intervals) or Better Uptime.

**Effort:** 1 hour

---

## Phase 3 — Reliability (Within 30 Days)

### 3.1 MongoDB Atlas Backups

Enable automated backups in MongoDB Atlas. Test the restore procedure in staging before relying on it.

- Enable continuous backups (point-in-time restore) in Atlas.
- Document restore steps in a runbook (`docs/RUNBOOK_RESTORE.md`).
- Schedule a quarterly restore drill.

**Effort:** 2 hours setup + runbook writing

### 3.2 Mongoose Index Audit

Ensure all compound queries that filter by `tenantId` have matching compound indexes. Missing indexes cause full collection scans that become expensive as data grows.

**Recommended approach:** Run `db.collection.explain("executionStats")` on the highest-traffic queries (appointments, patients, invoices) and add indexes where `COLLSCAN` appears.

**Effort:** 1 day

### 3.3 Bundle Analysis and Code Splitting

Run `npm run analyze` (Webpack Bundle Analyzer is already wired via `package.json`) and identify large dependencies loaded on every page.

**Effort:** Half day to analyze; 1–2 days to split, depending on findings.

### 3.4 Sentry Error Tracking

`lib/monitoring.ts` is ready — activation requires two steps:
1. Install `@sentry/nextjs`.
2. Set `SENTRY_DSN` environment variable.

**Effort:** 2 hours

---

## Phase 4 — Test Coverage (Ongoing)

Current test infrastructure (Vitest + Jest) is in place but coverage is minimal.

| Test type | Target | Effort estimate |
|---|---|---|
| Auth paths (login, session expiry, 401) | Baseline coverage | 2 days |
| Multi-tenant isolation (cross-tenant queries return 0 results) | All list endpoints | 3 days |
| End-to-end: patient registration → appointment → invoice | Happy path | 2 days |

**Note:** Multi-tenant isolation tests are the highest-value investment — a single broken `tenantId` filter leaks all records across tenants.

---

## Phase 5 — Code Quality (Post-Launch, Incremental)

These are addressed opportunistically as files are touched, not in bulk.

- **`any` types:** ESLint `no-explicit-any` is now set to `warn`. Address on each PR that touches the file.
- **Inline auth responses:** Migrate ad-hoc `{ status: 401 }` returns to `unauthorizedResponse()` / `forbiddenResponse()` from `app/lib/auth-helpers.ts` when editing the file.
- **Unused imports:** Run `npm run lint` to see the current scope; clean up incrementally.

---

## Effort Summary

| Phase | Work | Estimated Effort |
|---|---|---|
| 1 — Pre-launch | Secret rotation, env validation, session test | ~1 day |
| 2 — High priority | Redis rate limit, PII encryption, CSP, cron monitoring, uptime | ~1.5 weeks |
| 3 — Reliability | Backups, index audit, bundle analysis, Sentry | ~1 week |
| 4 — Test coverage | Auth, isolation, E2E | ~1.5 weeks |
| 5 — Code quality | Incremental, no dedicated sprint | Ongoing |

**Total focused effort (Phases 1–4):** approximately 4–5 weeks of engineering time.

---

## Known Architectural Debt (Tracked, Not In Scope Here)

- **Rate limiting is in-memory** — addressed in Phase 2.1 above.
- **PII stored plaintext** — addressed in Phase 2.2 above.
- **No audit log** on tenant config edits and data exports — extend `createAuditLog` when those routes are next modified.
- **ESLint `no-explicit-any` and `no-unused-vars`** were disabled — re-enabled as `warn` on 2026-05-26; surface and fix incrementally.

---

## Hosting & Infrastructure Costs

### Vercel (Application Hosting)

MyClinicSoft is deployed on Vercel. Subdomain-based multi-tenancy requires wildcard domain support, which is only available on paid plans.

| Plan | Monthly (₱) | Included |
|---|---|---|
| Hobby | Free | No custom domains on subdomains |
| **Pro** *(recommended)* | **₱1,120 / mo** | Wildcard domains, 1TB bandwidth, 1,000 serverless function invocations/day |
| Enterprise | Custom | SLA, advanced controls |

**Recommendation:** Vercel Pro at **₱1,120/month**. As tenant count grows, monitor function invocations and bandwidth — overages are billed at ₱22.40/GB and ₱33.60 per million invocations respectively.

---

### MongoDB Atlas (Database)

| Tier | Monthly (₱) | Specs | Suitable for |
|---|---|---|---|
| M0 Shared | Free | 512 MB, shared | Development only |
| M10 | ₱3,192 | 2 GB RAM, 10 GB storage | Early production, <10 tenants |
| **M20** *(recommended)* | **₱10,640** | 4 GB RAM, 20 GB storage | 10–50 tenants, production |
| M30 | ₱21,280 | 8 GB RAM, 40 GB storage | 50+ tenants, high query load |

**Recommendation:** Start on **M20 at ₱10,640/month**. Enable Atlas automated backups (included on M10+) with point-in-time restore. Upgrade to M30 when query latency exceeds 100 ms on the performance advisor.

> **Note:** M0 (free tier) does not support automated backups or performance advisor — do not use it in production.

---

### Upstash Redis (Rate Limiting — Phase 2.1)

Replacing the in-memory rate limiter requires a Redis provider that works serverlessly. Upstash is the standard choice for Vercel deployments.

| Plan | Monthly (₱) | Included |
|---|---|---|
| Free | ₱0 | 10,000 commands/day, 256 MB |
| **Pay-as-you-go** *(recommended)* | **~₱56 – ₱1,120** | ₱11.20 per 100K commands, scales automatically |
| Pro | ₱2,240 | 1M commands/day, 1 GB |

**Recommendation:** Start on **pay-as-you-go** — at typical clinic traffic this will cost **under ₱280/month**. No upfront commitment.

---

### Sentry (Error Tracking & Performance Monitoring — Phase 3.4)

`lib/monitoring.ts` is already wired — activation only requires setting `SENTRY_DSN`.

| Plan | Monthly (₱) | Included |
|---|---|---|
| **Developer (Free)** | **₱0** | 5,000 errors/mo, 1 user |
| Team | ₱1,456 / mo | 50,000 errors/mo, unlimited users, issue alerts |
| Business | ₱4,480 / mo | Quotas + performance monitoring |

**Recommendation:** Start on **free tier**. Upgrade to Team (₱1,456/month) once you have more than one developer or need higher error volume.

---

### UptimeRobot (Uptime Monitoring)

Monitors `/api/health/live` and alerts on downtime.

| Plan | Monthly (₱) | Included |
|---|---|---|
| **Free** | **₱0** | 50 monitors, 5-minute intervals |
| Pro | ₱392 / mo | 50 monitors, 1-minute intervals, SMS alerts |

**Recommendation:** **Free tier** is sufficient for launch. Upgrade to Pro (₱392/month) if 1-minute check frequency or SMS alerting is needed.

---

### Healthchecks.io (Cron Job Monitoring — Phase 2.4)

Each cron job pings a unique URL on success; missed pings trigger email/Slack alerts.

| Plan | Monthly (₱) | Checks |
|---|---|---|
| **Hobbyist (Free)** | **₱0** | 20 checks |
| Freelancer | ₱448 / mo | 100 checks |

**Recommendation:** **Free tier covers 20 of the 35 cron jobs.** Monitor the highest-risk jobs first (`trial-expiration`, `data-retention`, `appointment-reminders`, `invoice-generation`). Upgrade to Freelancer (₱448/month) to cover all 35.

---

### Email Delivery

The platform sends appointment reminders, invoices, and notifications. If not already configured:

| Provider | Free tier | Paid (₱) |
|---|---|---|
| **Resend** *(recommended)* | 3,000 emails/mo | ₱1,120/mo for 50,000 |
| SendGrid | 100 emails/day | ₱1,117/mo for 50,000 |
| AWS SES | 62,000 emails/mo (if on EC2) | ₱5.60 per 1,000 |

**Recommendation:** **Resend** — developer-friendly, Next.js-native SDK, generous free tier.

---

### PayPal (Payment Gateway)

Already integrated. No monthly fee — PayPal charges per transaction.

| Transaction type | Fee |
|---|---|
| Standard card payment | 3.49% + ₱27.44 |
| PayPal wallet payment | 3.49% + ₱27.44 |
| PayPal Checkout (standard) | 3.49% + ₱27.44 |

> These are standard PayPal Checkout rates as of 2026. Negotiate lower rates with PayPal directly once monthly volume exceeds ₱280,000.

---

## Engineering Costs

### One-Time: Phases 1–4 Implementation

Based on the effort estimates in each phase above at a blended rate of **₱2,240–₱3,360/hour**.

| Phase | Effort | Low estimate (₱) | High estimate (₱) |
|---|---|---|---|
| 1 — Pre-launch blockers | 1 day (8 hrs) | ₱17,920 | ₱26,880 |
| 2 — High priority (rate limit, PII encryption, CSP, monitoring) | 1.5 weeks (60 hrs) | ₱134,400 | ₱201,600 |
| 3 — Reliability (backups, indexes, bundle, Sentry) | 1 week (40 hrs) | ₱89,600 | ₱134,400 |
| 4 — Test coverage (auth, isolation, E2E) | 1.5 weeks (60 hrs) | ₱134,400 | ₱201,600 |
| **Total** | **~4.5 weeks** | **₱376,320** | **₱564,480** |

> Phase 1 (secret rotation) is an operational task and may be performed by the client directly, reducing the engineering cost by ₱17,920–₱26,880.

---

### Monthly Retainer (Post-Launch)

After Phases 1–4 are complete, ongoing maintenance covers: dependency updates, security patches, performance tuning, bug fixes, and incremental code quality improvements (Phase 5).

The retainer is priced at **30% of the monthly infrastructure cost**, scaled by coverage scope.

| Retainer scope | Infrastructure base (₱) | Retainer @ 30% (₱) | Suitable for |
|---|---|---|---|
| **Required services only** *(recommended)* | ₱12,040 | **₱3,612 / mo** | Core uptime, patches, security |
| All services (optional integrations included) | ₱14,336 – ₱15,456 | **₱4,301 – ₱4,637 / mo** | Full-stack monitoring + hardening |

**Recommendation:** Start with the **required-services retainer at ₱3,612/month**. Move to the full-services retainer once optional integrations (Sentry, Healthchecks.io, etc.) are activated.

---

## Total Monthly Operating Cost (Steady State)

Once all phases are complete and the retainer is active:

| Item | Monthly (₱) | Required |
|---|---|---|
| Vercel Pro | ₱1,120 | Yes |
| MongoDB Atlas M20 | ₱10,640 | Yes |
| Upstash Redis (pay-as-you-go) | ~₱280 | Yes |
| Sentry Team | ₱0 – ₱1,456 | Optional |
| UptimeRobot Pro | ₱0 – ₱392 | Optional |
| Healthchecks.io Freelancer | ₱0 – ₱448 | Optional |
| Resend (email) | ₱0 – ₱1,120 | Optional |
| PayPal | Per-transaction | Optional |
| **Infrastructure subtotal (required only)** | **~₱12,040 / mo** | |
| **Infrastructure subtotal (all services)** | **~₱14,336 – ₱15,456 / mo** | |
| Engineering retainer (30% of infrastructure) | ₱3,612 – ₱4,637 | |
| **Total monthly (required + retainer)** | **~₱15,652 / mo** | |
| **Total monthly (all services + retainer)** | **~₱18,637 – ₱20,093 / mo** | |
|---|---|---|
| MongoDB Atlas M20 | 3,192 | M10 Tier |
| Adjustment (-) | 7,448 | MongoDB for M20 Tier |
| Adjustment (+) | 2,499 | POS Business Subs |
| **Total Adjustment** | **~₱10,703 / mo** | |
|---|---|---|


---

## Out of Scope

- New feature development.
- UI/UX redesign.
- Switching databases or deployment platforms.
- Payment processor migration.

---

_Last updated: 2026-05-29_
