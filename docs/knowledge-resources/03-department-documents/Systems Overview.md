# Systems Overview

## Summary

The Systems Overview describes every system that runs MyClinicSoft and its two mobile apps, for the engineering team at DevCom Digital. MyClinicSoft is one Next.js web application hosted on Vercel, with a MongoDB Atlas database, and a set of outside services for email (Resend), SMS and phone codes (Twilio, not yet live), files (Cloudinary), payments (PayMongo and clinic-owned providers), AI visit notes (Anthropic), video (Jitsi), push notifications (Expo and web push) and error monitoring (Sentry, optional). The eMCR patient app and the MyClinicSoft Rep app are Expo apps that talk only to the web application's API. The document also covers how data moves between these systems, the environments, monitoring, and known limitations. It contains no secret hostnames, keys or connection strings; environment variable names are given only where they identify a system.

## MyClinicSoft web platform

The MyClinicSoft web platform is the single application behind the staff console, the public website, the platform console and every API.

| Item | Detail |
|---|---|
| Purpose | Staff console for clinics (patients, appointments, queue, visits, prescriptions, lab results, billing, inventory, reports, audit logs); public site and online booking; platform console (`/platform`) for platform admins; in-app support requests; APIs for the mobile apps and the public API |
| Owner | [TO CONFIRM: owner role] |
| Data held | None of its own; all records live in MongoDB Atlas. Each clinic (tenant) is reached on its own subdomain of the root domain (`ROOT_DOMAIN`) |
| Talks to | Every system in this document |
| Built with | Next.js 16 (App Router), TypeScript, Mongoose, Tailwind CSS; pnpm 10.33.0; Node.js 20.9 or higher (`package.json`, `README.md`) |
| Documentation | `README.md`; `docs/`; `PUBLIC_API.md`; `MOBILE_API.md` |

Platform admins are listed by email in `PLATFORM_ADMIN_EMAILS` and sign in with an emailed single-use link (`.env.example`).

## Vercel (hosting and scheduled jobs)

Vercel hosts the MyClinicSoft web platform and runs its scheduled jobs.

| Item | Detail |
|---|---|
| Purpose | Production hosting; 41 scheduled jobs (`vercel.json`) such as reminders, reports, trial expiry, data retention, webhook deliveries and platform invoices |
| Owner | [TO CONFIRM: owner role and Vercel account holder] |
| Data held | Environment variables (production secrets); deployment and function logs [TO CONFIRM: log retention] |
| Talks to | Calls `/api/cron/*` on the app with `Authorization: Bearer $CRON_SECRET`; `proxy.ts` refuses cron calls without it |
| Rules | Vercel Pro or higher is required, because several jobs run every 5 to 30 minutes. Job schedules are in UTC, chosen for clinic hours in Asia/Manila (`README.md`) |
| Documentation | `README.md` ("Deployment"); `vercel.json` |

## Vercel Blob (audit-log archive)

Vercel Blob is a private file store that holds archived audit logs.

| Item | Detail |
|---|---|
| Purpose | Each clinic's audit-log entries older than about 90 days move here as one file per clinic per month (gzipped JSON lines), kept for 5 years [TO CONFIRM: log retention wording (contradiction 32)] |
| Owner | [TO CONFIRM: owner role] |
| Data held | Audit-log entries (who did what, to which record) |
| Talks to | The weekly `data-retention` job writes files; Admin → Audit log → Archived months downloads them |
| Setup | Connected to the project with `BLOB_STORE_ID`; until a store is connected, nothing moves [TO CONFIRM: whether the store is connected in production] |
| Documentation | `docs/BACKUP_RESTORE.md`, section "Audit log archive"; `lib/audit-archive.ts` |

## MongoDB Atlas (database)

MongoDB Atlas holds all MyClinicSoft data.

| Item | Detail |
|---|---|
| Purpose | Production database |
| Owner | [TO CONFIRM: owner role and Atlas project owner] |
| Data held | Every clinic's records, including patient health data, staff accounts, eMCR and rep accounts, billing, subscriptions, platform invoices, in-app clinic backups (at most 3 per clinic, 12 MB each), SMS logs and audit logs |
| Talks to | The web platform only (`MONGODB_URI`) |
| Rules | Production does not build indexes automatically; indexes are created with `pnpm prod db:indexes` (see "Running a Production Data Migration"; timing is contradiction 61) |
| Backups | See "Restoring the Database After an Incident" and "Running the Backup Restore Drill". Production may be on a free tier without Cloud Backup [TO CONFIRM: contradiction 30]. Encryption at rest is unconfirmed [TO CONFIRM: contradiction 29] |
| Documentation | `docs/BACKUP_RESTORE.md`; `docs/LOCAL_DEV_DATABASE.md` |

## Resend (transactional email)

Resend sends every email from MyClinicSoft.

| Item | Detail |
|---|---|
| Purpose | Sign-in links, invites, reminders, receipts, sales invoices to clinics |
| Owner | [TO CONFIRM: owner role] |
| Data held | Email addresses and message content in transit [TO CONFIRM: Resend retention] |
| Talks to | Called by the web platform (`lib/email.ts`) with `RESEND_API_KEY`; sender `EMAIL_FROM` must be on a domain verified in Resend |
| Rules | Without both settings no email is sent. Sends retry up to 3 times when Resend's per-second limit is hit |
| Documentation | `lib/email.ts`; `README.md` |

The privacy page names this sub-processor only as "Email delivery provider" (contradiction 33).

## Twilio (SMS and phone codes)

Twilio sends text messages and, through Twilio Verify, phone sign-in codes.

| Item | Detail |
|---|---|
| Purpose | Appointment reminders and other clinic texts; 6-digit phone codes for sign-in and public booking |
| Owner | [TO CONFIRM: owner role] |
| Data held | Phone numbers and message content in transit. MyClinicSoft keeps its own delivery log for 60 days, with no message bodies |
| Talks to | Called by `lib/sms.ts` and `lib/otp.ts`; delivery callbacks and STOP/START replies come to `/api/webhooks/twilio` |
| Status | Built, not yet live; go-live steps are in "Going Live with SMS and Phone Codes" |
| Documentation | `docs/SMS_TWILIO.md` |

## Cloudinary (file storage)

Cloudinary stores uploaded files and documents.

| Item | Detail |
|---|---|
| Purpose | Patient, visit and lab-result attachments, clinic documents, clinic logos |
| Owner | [TO CONFIRM: owner role] |
| Data held | Uploaded files, which can include patient health information. Files are stored as authenticated (non-public) assets, reachable only through signed links or the app's stream route; clinic logos stay public |
| Talks to | The web platform (`lib/cloudinary.ts`). The account is shared with other apps; MyClinicSoft files sit under one root folder (`CLOUDINARY_ROOT_FOLDER`, default "myclinicsoft") |
| Status | Older files stored inside database records are moved with `storage:migrate-attachments` [TO CONFIRM: whether Cloudinary is configured in production and the migration has run] |
| Documentation | `.env.example`; `scripts/migrate-attachments-to-cloudinary.ts`; `scripts/migrate-cloudinary-private.ts` |

## Upstash Redis (rate limits) and Cloudflare Turnstile (bot check)

Upstash Redis and Cloudflare Turnstile protect the public parts of MyClinicSoft from abuse.

| Item | Upstash Redis | Cloudflare Turnstile |
|---|---|---|
| Purpose | Shared rate limits and session cache across serverless instances | Bot check on public booking and patient self-registration |
| Owner | [TO CONFIRM: owner role] | [TO CONFIRM: owner role] |
| Data held | Counters and cached sessions | None stored by MyClinicSoft |
| If not set | Limits are kept per instance, not shared | Off; with only the secret key set, every public booking is refused |
| Status | [TO CONFIRM: on in production] | Pending keys [TO CONFIRM] |
| Documentation | `.env.example`; `docs/PUBLIC_SITE_FOLLOWUPS.md` | same |

Neither is listed on the privacy page's sub-processor list (contradiction 33).

## PayMongo and clinic payment providers

PayMongo charges clinics for their MyClinicSoft subscriptions; clinics can also connect their own payment accounts for patient bills.

| Item | Detail |
|---|---|
| Purpose | Platform PayMongo account: clinic plan subscriptions in pesos (GCash, Maya, cards, QR Ph) and the medical representative activation fee. Clinic accounts: patient bill payments through PayMongo, Xendit or Maya Business, or manual QR and bank transfer records (`lib/payments/providers.ts`) |
| Owner | [TO CONFIRM: owner role and PayMongo account holder] |
| Data held | Payment records; card details stay with the provider [TO CONFIRM] |
| Talks to | Checkout from the web platform; PayMongo calls `/api/paymongo/webhook` on `checkout_session.payment.paid`; a paid subscription triggers a BIR sales invoice (see "Invoicing and Expenses Procedure") |
| Settings | Platform keys are set in Platform → Configuration and stored encrypted; `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` are only a fallback |
| Documentation | `.env.example`; `MOBILE_API.md` (patient payments) |

## Anthropic, Jitsi and NLM RxNav (clinical add-ons)

Anthropic, Jitsi and NLM RxNav provide optional clinical features.

| Item | Anthropic | Jitsi | NLM RxNav |
|---|---|---|---|
| Purpose | AI scribe: drafts visit notes from a dictated or pasted consult (plans that include it are listed in the Products and Services Catalogue) | Video rooms for teleconsults | Medicine-name suggestions (RxNorm) |
| Owner | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
| Data held | Consult text sent for a draft, only when a clinic turns the scribe on | Live video only | Medicine names in queries |
| Setting | `ANTHROPIC_API_KEY` | `TELECONSULT_BASE_URL` (default is the free public Jitsi service, which asks the first person to sign in as moderator) | `RXNAV_API_URL` (defaults to the public NLM service) |
| Documentation | `.env.example`; privacy page | same | `.env.example` |

NLM RxNav is not on the privacy page's sub-processor list (contradiction 33).

## Push notifications (Expo and web push)

Expo push and web push deliver notifications to phones and browsers.

| Item | Detail |
|---|---|
| Purpose | Notifications to the eMCR and MyClinicSoft Rep apps (Expo push service) and to browsers (web push with VAPID keys) |
| Owner | [TO CONFIRM: owner role] |
| Data held | Device push tokens in MongoDB; notification text in transit |
| Talks to | `lib/push-notifications.ts`; apps register devices through `MOBILE_API.md` endpoints |
| Documentation | `MOBILE_API.md`; `.env.example` |

## Sentry (error monitoring)

Sentry is optional error monitoring for the web platform.

| Item | Detail |
|---|---|
| Purpose | Collects server and browser errors and traces |
| Owner | [TO CONFIRM: owner role] |
| Data held | Error events after scrubbing: no request bodies, cookies, auth headers or query strings; user reduced to an opaque id; patient fields filtered; no Session Replay (`lib/sentry-scrub.ts`) |
| Talks to | Browser events go through the same-origin `/monitoring` tunnel |
| Status | Inactive until `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is set [TO CONFIRM: whether it is set in production] |
| Documentation | `README.md` ("Monitoring (Sentry)"); `.env.example` |

## Public API, webhooks and lab integrations

The MyClinicSoft public API (`/api/v1`) and webhooks connect a clinic's other systems; lab integrations exchange lab requests and results.

| Item | Detail |
|---|---|
| Purpose | REST API and webhooks for clinics on plans that include them (see Products and Services Catalogue); third-party lab requests and result webhooks |
| Owner | [TO CONFIRM: owner role] |
| Data held | API keys (stored as hashes), webhook endpoints and deliveries (kept 30 days) |
| Talks to | Clinic systems over HTTPS; labs sign webhooks with HMAC-SHA256 (`LAB_WEBHOOK_SECRET`, `LAB_INTEGRATIONS`) |
| Limits | 120 requests a minute per key; failed webhook deliveries are retried 6 more times over about 20 hours [TO CONFIRM: webhook retry schedule (contradiction 64)] |
| Documentation | `PUBLIC_API.md`; `app/(public)/integrations/page.tsx`; `.env.example` |

## eMCR and MyClinicSoft Rep mobile apps

eMCR (Electronic MyClinic Record) and MyClinicSoft Rep are Expo (React Native) apps in their own repositories.

| Item | eMCR | MyClinicSoft Rep |
|---|---|---|
| Purpose | Patient app | App for medical representatives |
| Repository | `clinic-management-mobile` | `clinic-management-rep` |
| Version | 1.1.4 (`mobile/app.json`) | 0.1.0, not released |
| Owner | [TO CONFIRM] | [TO CONFIRM] |
| Data held on the phone | Tokens in secure storage; an encrypted offline cache | same |
| Talks to | The web platform's API at the main domain only, never a clinic subdomain (`MOBILE_API.md`) | same |
| Builds and store | Expo EAS profiles development, preview and production; production builds submit to the Google Play production track (`mobile/eas.json`) | EAS profiles exist; `eas init` has not been run (`rep/README.md`) |
| Documentation | `mobile/README.md`; `mobile/RELEASE_NOTES.md`; `MOBILE_API.md` | `rep/README.md`; `MOBILE_API.md` |

## GitHub and GitHub Actions

GitHub hosts the code and GitHub Actions runs continuous integration.

| Item | Detail |
|---|---|
| Purpose | Code hosting, pull requests, CI |
| Owner | [TO CONFIRM: owner role] |
| Data held | Source code; no production secrets (CI uses placeholder values) |
| Talks to | CI runs on pushes and pull requests to `main` |
| Documentation | `.github/workflows/ci.yml`; "Engineering Standards and Release Procedure" |

## How data flows between systems

The main data flows between MyClinicSoft systems are:

1. Clinic staff use the web console on their clinic's subdomain; the web platform on Vercel reads and writes MongoDB Atlas.
2. Patients (eMCR) and medical representatives (MyClinicSoft Rep) call the web platform's API on the main domain with bearer tokens; the API reads and writes MongoDB Atlas.
3. Public booking and self-registration on the website pass the Turnstile check (when on) and rate limits (Upstash, when set) before records are written.
4. Uploaded files go to Cloudinary as non-public assets; the database record keeps a reference, and the app streams the file to signed-in users.
5. Messages go out by email (Resend), SMS (Twilio, when live) and push (Expo, web push).
6. Vercel calls the scheduled jobs on their UTC schedules; the jobs read MongoDB and send reminders, reports and notices.
7. A clinic pays for a plan through PayMongo; PayMongo's webhook marks the subscription paid; the web platform issues a BIR sales invoice and emails it through Resend.
8. Patients pay clinic bills through the clinic's own connected provider.
9. Once a week the `data-retention` job moves old audit-log months to Vercel Blob.
10. When a clinic uses the AI scribe, the consult text goes to Anthropic and a draft note comes back for a licensed professional to review.
11. Clinic systems pull data through the public API and receive webhooks; labs send results by signed webhook.
12. Server errors are written to the logs as structured JSON and, when Sentry is on, sent to Sentry after scrubbing.

## Environments and how changes move between them

MyClinicSoft has three environments described in the engineering documentation.

| Environment | What it is | Data |
|---|---|---|
| Development | Each engineer's machine: `pnpm dev` against MongoDB 8.0 in Docker (`pnpm db:local:up`) | An anonymised copy of a production backup (`pnpm db:local:refresh`). Email, payments and push are unset, so nothing reaches a real person |
| Test | GitHub Actions CI: type-check, lint, Vitest tests (database mocked), dependency audit, production build with placeholder settings | No real data |
| Production | Vercel with MongoDB Atlas; production settings live in Vercel and, for scripts, in `.env.prod.local` | Real clinic and patient data |

No shared staging environment is documented [TO CONFIRM: whether Vercel preview deployments are used, and against which database]. `docs/PUBLIC_SITE_FOLLOWUPS.md` notes that "Vercel previews work" for booking and onboarding.

Changes move from a branch, through a pull request to `main` with CI, to production. How a merge reaches production is not written down [TO CONFIRM: whether Vercel deploys automatically from `main`]. Release steps are in "Engineering Standards and Release Procedure"; production data changes go through "Running a Production Data Migration". Scripts reach production only through `pnpm prod <script>`, which shows the target database and asks for confirmation.

The mobile apps have EAS build profiles: development (points at a local backend), preview (internal distribution) and production. Both preview and production builds use the production API.

## Monitoring and who is alerted

MyClinicSoft monitoring, as documented in the code and engineering notes:

| Signal | Where it shows | Who is alerted |
|---|---|---|
| Health check `/api/health` (also `/api/health/live`, `/api/health/ready`); answers 503 when the database is not ready | Any uptime checker [TO CONFIRM: whether one is set up] | [TO CONFIRM] |
| Unhandled server errors as structured JSON | Vercel logs | [TO CONFIRM] |
| Error events | Sentry, when a DSN is set | [TO CONFIRM] |
| SMS rule checks ("SMS policy would block") | Vercel logs | Read during "Going Live with SMS and Phone Codes" |
| Failed scheduled jobs | Vercel logs (for example, the `platform-invoices` job answers 500 on failure) | [TO CONFIRM] |
| Support requests from clinics | Platform console, `/platform/support` | Platform admins |
| Webhook endpoints switched off after 25 failures in a row | Admin → Developers | The clinic administrator |

`README.md` says "Health checks and resource monitoring should be set up in production", which suggests they are not yet [TO CONFIRM].

## Known limitations

Known limitations of the MyClinicSoft systems, as documented in the code and engineering notes. Limitations already stated in a system's own section are listed there and not repeated here: database tier and encryption at rest ("MongoDB Atlas (database)"), SMS status ("Twilio (SMS and phone codes)"), rate limits and Turnstile keys ("Upstash Redis (rate limits) and Cloudflare Turnstile (bot check)"), Sentry ("Sentry (error monitoring)"), the Vercel plan ("Vercel (hosting and scheduled jobs)") and mobile builds ("eMCR and MyClinicSoft Rep mobile apps").

| Limitation | Source |
|---|---|
| In-app clinic backups share the free tier's 512 MB | `lib/backups.ts` (contradiction 30) |
| eMCR has no iOS store release | `mobile/eas.json` (contradiction 28) |
| No mobile over-the-air updates: eMCR fixes reach phones only through a new store build | `mobile/RELEASE_NOTES.md` |
| The default Jitsi service asks the first person in a room to sign in as moderator | `.env.example` |
| Changing the Cloudinary root folder after files are stored splits them across two folders | `.env.example` |
| If `DOCUMENT_SEAL_SECRET` is unset, rotating `SESSION_SECRET` makes every printed seal fail verification | `.env.example` |
| `AUDIT.md` (2026-04-04) and `.github/copilot-instructions.md` describe an older stack (PayPal, Nodemailer, Socket.IO, Jest, npm) | contradictions 35, 36, 38, 41 |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Engineering Standards and Release Procedure; Restoring the Database After an Incident; Running the Backup Restore Drill; Going Live with SMS and Phone Codes; Running a Production Data Migration; Invoicing and Expenses Procedure; Data Handling and Confidentiality; Products and Services Catalogue |

## Open questions

1. Owner role for each system: the web platform, Vercel, Vercel Blob, MongoDB Atlas, Resend, Twilio, Cloudinary, Upstash Redis, Cloudflare Turnstile, PayMongo, Anthropic, Jitsi, NLM RxNav, push, Sentry, the public API and lab integrations, eMCR, MyClinicSoft Rep and GitHub; and who holds each vendor account.
2. Vercel log retention.
3. Whether the Vercel Blob store is connected in production.
4. Production database tier and backups: `README.md` "Backups use MongoDB Atlas Cloud Backup"; `docs/BACKUP_RESTORE.md` Cloud Backup "Requires an M10 or larger cluster"; `lib/backups.ts` "the free tier's 512 MB" (contradiction 30).
5. Encryption at rest: `app/(public)/security/page.tsx` "the database is encrypted at rest"; `docs/PUBLIC_SITE_FOLLOWUPS.md` "Confirm MongoDB Atlas encryption at rest is on for the production cluster" (contradiction 29).
6. Resend data retention.
7. Whether Cloudinary is configured in production and whether the attachment migrations have run.
8. Whether Upstash Redis is on in production, and when the Turnstile keys will be set.
9. Whether card details ever touch MyClinicSoft systems (assumed not).
10. Whether Sentry is set up in production.
11. Whether Vercel preview deployments are used, and against which database; whether there should be a staging environment.
12. Whether Vercel deploys automatically from `main`.
13. Whether an uptime checker watches `/api/health`, and who is alerted for health failures, server errors, Sentry events and failed scheduled jobs.
14. `README.md` says health checks and resource monitoring "should be set up in production": confirm the current state.
15. Sub-processor list: `app/(public)/privacy/page.tsx` names an unnamed "Email delivery provider" and omits Upstash, Cloudflare Turnstile, Vercel Blob and NLM RxNav, which `.env.example` and `lib/email.ts` configure; it lists Twilio while SMS is not live (contradiction 33).
16. Error monitoring: `README.md` "Integrated with Sentry for error monitoring and alerting" versus "stays completely inactive until a DSN is set" (contradiction 39).
17. Deployment model: `PRODUCT.md` "Deployment-agnostic (cloud or on-prem)" versus `README.md` "The app is deployed on Vercel" (contradiction 22).
18. Webhook retries: `PUBLIC_API.md` "7 attempts over about 21 hours"; `app/(public)/integrations/page.tsx` "retried 6 more times with back-off over about 20 hours". Both describe six retries; the hours differ (contradiction 64).
19. [TO CONFIRM: log retention wording (contradiction 32)]: the Privacy Policy says "Backups and logs are overwritten on a rolling basis"; lib/audit-archive.ts and docs/BACKUP_RESTORE.md keep audit-log archives for 5 years.
