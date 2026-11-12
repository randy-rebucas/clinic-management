# Source inventory

Written 2026-11-10 for the myclinicsoft knowledge folder (step 1).

## How SOURCES was read

There is no `apps/` folder in the repository. SOURCES was taken to be the three application repositories in the workspace, without PROMPTS (`docs/prompt-resources/`), OUTPUT (`docs/knowledge-resources/`), dependencies (`node_modules/`), build output or git data:

| Repository | What it is |
|---|---|
| `clinic-management` | MyClinicSoft web platform: staff console, public site, APIs |
| `clinic-management-mobile` | eMCR patient app |
| `clinic-management-rep` | MyClinicSoft Rep app for medical representatives |

Every documentation file (`.md`) in the three repositories was read, along with the public website pages, the legal pages and the code files that hold business facts (prices, plan limits, trial length, retention, roles). The rest of the source code (application logic) was searched for specific facts rather than read line by line. **Please confirm that this reading of SOURCES is correct** (see the questions in [README.md](../README.md)).

Paths below are relative to `clinic-management/` unless they start with `mobile/` (`clinic-management-mobile/`) or `rep/` (`clinic-management-rep/`).

## Files

"Feeds documents" uses the catalogue numbers in [README.md](../README.md).

### Business and product documents

| File | What it covers | Date (if stated) | Looks out of date? | Feeds documents |
|---|---|---|---|---|
| `COMPANY_PROFILE.md` | Company (DevCom Digital), product overview, modules, audience, positioning, privacy statement | none | Partly: describes plans only as "confirm through the website" | C1, C2, C3, D3, D4, P1 |
| `PRODUCT.md` | Users, purpose, positioning, operating context, constraints, product principles | none | Yes: mentions patient and rep web portals (removed 2026-10-18) and "email (SMTP)" (now Resend) | C1, C2, D3, D4, P1, P2, P5 |
| `README.md` | Feature list, tech stack, environment variables, roles table, CI, deployment, backups | none (last commit 2026-11-07) | Partly: "Next.js 16.0.3", "License MIT", "High test coverage" | C2, D6, D7 |
| `AUDIT.md` | Automated code audit: stack, models, API surface, issues | 2026-04-04 | **Yes, largely obsolete** (PayPal, Nodemailer, Socket.IO, Jest, `middleware.ts` advice, 4-variable `.env.example`) | D6 (history only), P4 |
| `DESIGN.md` | Design system "The Operations Console": colours, type, components, copy rules | none | Partly: says the patient and rep portals were migrated (they were removed) | D4, C2 |
| `MOBILE_ROADMAP.md` | Mobile strategy, phases 0–8, MVP scope, risks, decisions | 2026-09-21; amended 2026-10-18 | Partly: Expo SDK 57, 30-day tokens, "not built yet" items, booking excluded | P1, P2, P4, P5 |
| `MOBILE_API.md` | API used by eMCR and the rep app; activation, vouchers, rep billing rules | none | No | C3, C2, D6, D2, P2 |
| `PUBLIC_API.md` | Public REST API `/api/v1`, API keys, webhooks, limits | last commit 2026-10-20 | No | C3, D6 |
| `docs/BACKUP_RESTORE.md` | Atlas Cloud Backup policy, restore drill, incident restore, audit-log archive, manual backups | last commit 2026-10-29 | No | C6, D6, D7, S1-a, S1-b, S1-g |
| `docs/SMS_TWILIO.md` | SMS and phone-code go-live runbook, opt-out rules, SMS policy | last commit 2026-11-06 | No (SMS not yet live) | D6, S1-c, C6 |
| `docs/PUBLIC_SITE_FOLLOWUPS.md` | Open owner decisions and promises that still need tooling, from the public-site audit | audit 2026-10-22; last commit 2026-11-05 | No | P4, P5, C6, D2, D3 |
| `docs/LOCAL_DEV_DATABASE.md` | Local Docker database, anonymised production copy, `pnpm prod` | last commit 2026-11-07 | Mentions PayPal (removed) | D6, D7 |
| `__tests__/README.md` | Test rules (Vitest, mocked database, coverage goal) | last commit 2026-10-16 | "Tests are currently in development" | D7 |
| `.github/copilot-instructions.md` | Coding conventions written for an AI coding assistant | last commit 2026-11-07 | Yes: `npm`, "vitest or jest", folders that no longer exist | D7 (conventions only) |
| `.github/workflows/ci.yml` | CI pipeline on push and pull request to `main` | none | No | D7 |
| `vercel.json` | Hosting configuration and 41 scheduled jobs (UTC) | last commit 2026-11-05 | No | D6, D7 |
| `package.json` | Scripts, dependencies, package manager (pnpm 10.33.0) | none | No | D6, D7 |
| `.env.example` | Names and descriptions of configuration settings (no values used) | none | No | D6 |
| `.claude/skills/console-redesign/SKILL.md` | Instructions to an AI assistant for redesigning console pages | 2026-10-18 | Partly (names an old working branch) | D4 (style facts only) |
| `AGENTS.md` | Note for AI coding assistants about the Next.js version | none | No | none |
| `mobile/README.md` | eMCR app: features, sign-in, build | none | Partly: says reps "will get a separate app" (it exists) | C3, C2, D2 |
| `mobile/RELEASE_NOTES.md` | eMCR versions 1.0.0–1.1.4 | 2026-11-08 (1.1.4) | 1.0.0 entries superseded by later versions | C3, D2, P4 |
| `mobile/lib/i18n/GLOSSARY.md` | English–Filipino terminology for the eMCR app | none | No | C2, D4 |
| `mobile/app.json`, `mobile/package.json`, `mobile/eas.json` | eMCR name, version 1.1.4, platforms, store submit settings | none | No | C3, D6 |
| `mobile/AGENTS.md`, `mobile/CLAUDE.md` | Notes for AI coding assistants | none | No | none |
| `rep/README.md` | MyClinicSoft Rep app: features, phases, decisions | none | Partly: "versions match eMCR" (eMCR moved to SDK 58) | C3, C2, P4 |
| `rep/lib/i18n/GLOSSARY.md` | English–Filipino terminology for the rep app | none | Says "needs native review before phase 3" (phase 3 done) | C2, D4 |
| `rep/app.json`, `rep/package.json`, `rep/eas.json` | Rep app name, version 0.1.0, platforms | none | No | C3 |
| `rep/AGENTS.md`, `rep/CLAUDE.md` | Notes for AI coding assistants | none | No | none |

### Public website and legal pages (`app/(public)/`)

| File | What it covers | Date (if stated) | Looks out of date? | Feeds documents |
|---|---|---|---|---|
| `page.tsx` (home) | Headlines, modules, eMCR and rep teasers | none | "Rep app: coming soon" (the app is built but not released) | C1, D3, D4 |
| `pricing/page.tsx` | Plans, highlights, "Every plan includes", pricing Q&A | none | No | C3, D5, D2, D3 |
| `features/page.tsx` | Module list | none | No | C3, D3 |
| `faq/page.tsx` | 27 customer questions and answers | none | No | D2, D1 |
| `compare/page.tsx` | MyClinicSoft compared with paper and spreadsheets; vendor questions | none | No | D3 |
| `about/page.tsx` | Company and product story | none | No | C1, D4 |
| `contact/page.tsx`, `support/page.tsx` | Contact form, support channels, support request flow | none | No | D1, C4 |
| `security/page.tsx` | Security and privacy measures | none | No | C6, D2, D3 |
| `integrations/page.tsx` | PhilHealth, HMO, labs, API, webhooks | none | No | C3, D6 |
| `resources/page.tsx`, `download/page.tsx`, `demo/page.tsx` | Resource links, app download, demo request | none | No | D2 |
| `medical-representatives/onboard/page.tsx` | Rep registration (paused) | none | Says rep app "on the way" | C3 |
| `terms/page.tsx` | Terms of Service | updated 2026-10-22 | No | D9, C6, D5, D2 |
| `privacy/page.tsx` | Privacy Policy, sub-processors, retention, rights | updated 2026-10-22 | No | C6, D2 |
| `components/PublicPage.tsx` | Support email and support hours | none | No | D1, C1 |

### Code files read for business facts

| File | What it covers | Looks out of date? | Feeds documents |
|---|---|---|---|
| `lib/subscription-period.ts` | Default plan prices, yearly pricing, 7-day grace period, plan-switch credit | No | C3, D5 |
| `lib/subscription-packages.ts` | Plan limits and features (trial, Basic, Professional, Enterprise) | Has support levels the website no longer promises | C3, D5 |
| `lib/platform-config.ts`, `lib/platform-config-schema.ts` | Admin-configurable prices, ₱20 minimum, voucher and rep fees, BIR issuer details | No | D5, D8 |
| `lib/subscription.ts`, `lib/subscription-page.ts`, `components/admin/SubscriptionClient.tsx` | Payments, refunds and chargebacks, the clinic's subscription page | No | D5, D8 |
| `app/api/tenants/onboard/route.ts` | Self-service clinic sign-up with a 14-day trial | No | C3, S1-e |
| `scripts/onboard-tenant.ts` | Command-line clinic set-up | Uses a 7-day trial, UTC and USD | S1-e |
| `scripts/delete-tenant.ts` | Deletes a closed clinic's data | No | S1-h |
| `lib/emcr/activation.ts`, `lib/emcr/vouchers.ts`, `lib/platform-emcr.ts` | eMCR vouchers (₱80 face value, ₱60 wholesale, 365 days), batches | No | C3, D5, S1-i |
| `lib/rep-billing.ts` | Medical representative fees (all default ₱0) | No | C3, D5 |
| `lib/discount-calculator.ts` | Discounts on patients' clinic bills (PWD, senior citizen, membership) | No | C2 (clinic feature, not a company discount) |
| `lib/roles.ts`, `lib/permissions.ts`, `lib/platform-auth.ts` | Staff roles, platform admins | No | C2, C4 |
| `lib/support.ts`, `app/api/support/route.ts`, `models/SupportRequest.ts` | Support request categories, statuses, reference format | No | D1, S1-f |
| `lib/platform-invoice.ts`, `lib/bir.ts` | BIR sales invoices to clinics, serial format | No | D8 |
| `lib/automations/data-retention.ts`, `lib/audit-archive.ts`, `lib/patient-erasure.ts`, `app/api/compliance/data-deletion/route.ts` | Retention, audit-log archive, patient erasure | No | C6, S1-g |
| `lib/backups.ts` | In-app clinic backups (3 per clinic, 12 MB each) | No | D6 |
| `lib/email.ts`, `lib/env-validation.ts`, `lib/seo.ts`, `lib/tz.ts` | Email provider, required settings, site description, default time zone | No | C1, D6 |
| `components/TenantNotFound.tsx` | Clinic-not-found page | Yes: support address on a different domain | none (contradiction 40) |

## Contradictions between files

Each contradiction is numbered so drafts and the drafting conventions can refer to it as "contradiction N".

**Pricing, plans and billing**

1. **Changing plans.**
   - `app/(public)/pricing/page.tsx`: "Upgrade or downgrade at any time, and changes take effect immediately."
   - `app/(public)/faq/page.tsx`: "The new plan starts when it's paid; time left on the old plan isn't prorated or refunded."
   - `lib/subscription-period.ts`: days left on the old plan "are converted at the two plans' daily prices", so unused paid time is carried over.
2. **Trial days when buying a plan.**
   - `components/admin/SubscriptionClient.tsx`: "The trial days you have left are kept: the paid period starts when the trial ends."
   - `lib/subscription-period.ts`: "A plan that was never bought (trial) is worth nothing to carry."
3. **What the trial includes.**
   - `pricing/page.tsx`: "Try everything with your own team for 14 days." `compare/page.tsx` and `contact/page.tsx`: "Try every feature free for 14 days."
   - `faq/page.tsx`: "a 14-day free trial of the core features".
   - `lib/subscription-packages.ts`: the trial has no reporting, API, webhooks or data export.
4. **Data export.**
   - `faq/page.tsx`: "You can export your data at any time".
   - `compare/page.tsx`: "paid plans include data export".
   - `lib/subscription-packages.ts`: the trial has `dataExport: false`.
5. **Multiple locations.**
   - `faq/page.tsx`: "Each clinic location runs as its own MyClinicSoft account today. Managing several locations from one account is on our roadmap".
   - `lib/subscription-packages.ts`: Professional `maxLocations: 3`; Enterprise unlimited.
6. **Support level.**
   - `pricing/page.tsx`: Professional "Priority email support"; Enterprise "Support terms agreed in your contract".
   - `lib/subscription-packages.ts`: Professional phone and chat support; Enterprise `supportLevel: '24/7'`. `lib/subscription-page.ts` shows Enterprise as "Around the clock".
   - `docs/PUBLIC_SITE_FOLLOWUPS.md`: "Unbacked claims removed (24/7, phone/chat, ...)".
7. **Who pays for eMCR.**
   - `pricing/page.tsx`: "eMCR patient app connection" is listed under "Every plan includes". `terms/page.tsx`: "Clinics do not pay for eMCR."
   - `terms/page.tsx` also says some features need "a voucher bought for cash at a participating clinic (₱80)". The home, features, FAQ, about and compare pages do not mention the fee (open item in `docs/PUBLIC_SITE_FOLLOWUPS.md`).
8. **Where the eMCR voucher price is set.**
   - `lib/emcr/activation.ts`: `VOUCHER_FACE_VALUE = 80` and a ₱60 wholesale price, fixed in code.
   - `lib/platform-config.ts`: `voucherFaceValue` and `voucherWholesalePrice` can be changed by a platform admin.
9. **Yearly discount.**
   - `faq/page.tsx`: "Annual plans save about 17% compared to monthly billing — that's 2 months free." (fixed text)
   - `pricing/page.tsx` and `lib/subscription-period.ts` calculate the saving from the configurable `yearlyMonths`, so the two disagree if an admin changes it.
10. **Number of modules.** Home page: "15+ more modules included" over a list of 10 items. `features/page.tsx`: 21 module cards.
11. **Refunds.**
    - `pricing/page.tsx`, `faq/page.tsx`, `terms/page.tsx`: "All payments are final and non-refundable … except where Philippine law requires otherwise."
    - `lib/subscription.ts` removes paid time when PayMongo reports a full refund or chargeback, so refunds can happen.
12. **Trial length.**
    - `terms/page.tsx` and `app/api/tenants/onboard/route.ts` (`+ 14`): 14 days.
    - `scripts/onboard-tenant.ts`: `+ 7 // 7 days from now`. This script also defaults the time zone to "UTC" and the currency to "USD".
13. **Currency.** All prices are in PHP, but `lib/subscription-page.ts` shows payment history with `p.currency || 'USD'`.
14. **Pricing figures.** `PRODUCT.md`: "No customer testimonials, case studies, or pricing figures on hand". `lib/subscription-period.ts` holds default prices (₱1,499 / ₱3,999 / ₱9,999 a month).

**Product scope and naming**

15. **Patient and rep web portals.**
    - `PRODUCT.md`: "Patients — self-service portal"; "Medical representatives — dedicated pharma sales portal". `DESIGN.md`: the portals "migrated" onto the design system.
    - `MOBILE_API.md`: "The web portals for patients … and medical representatives … have been removed." `MOBILE_ROADMAP.md`: "Superseded 2026-10-18".
16. **Reps on the web console.** `MOBILE_ROADMAP.md`: "Keep the existing Next.js web app … for staff/admin/ops (… medical reps)". `MOBILE_API.md`: "The staff web login now refuses rep accounts and points them to the app."
17. **Rep app status.**
    - `app/(public)/page.tsx`: "Rep app: coming soon". `medical-representatives/onboard/page.tsx`: "Rep registration is paused while we build it."
    - `rep/README.md`: all four build phases "(done)", version 0.1.0, but "`eas init` has not been run for this app yet".
18. **Who medical representatives are.** `lib/roles.ts`: "Pharmaceutical representatives who visit the clinic's doctors". `rep/README.md`: "pharmaceutical and medical-device representatives".
19. **Rep booking fee.**
    - `MOBILE_API.md`: booking needs a plan, a team seat "or booking being free (the platform's rep fee is ₱0, which is the default)".
    - `rep/README.md`: "booking with clinics and recording deliveries need a rep plan (or a team seat)", with no free default mentioned.
20. **Staff roles.** `PRODUCT.md` lists "Inventory managers" and "Finance & billing staff". `lib/roles.ts` has no inventory role and adds "Medical technologist" and "Accountant".
21. **Product name.** "MyClinicSoft" (most files), "myclinicsoft" (`MOBILE_ROADMAP.md`, `AUDIT.md`), "Clinic Management System" (`DESIGN.md`).
22. **Deployment model.** `PRODUCT.md`: "Deployment-agnostic (cloud or on-prem)". `faq/page.tsx`: "cloud-based … no installation or server maintenance required". `README.md`: "The app is deployed on Vercel".
23. **Support email domain.** `components/TenantNotFound.tsx` links a support address at `clinicmanagement.com`. Every other file uses `myclinicsoft.solutions`.

**Patient app (eMCR)**

24. **Booking in the patient app.** `MOBILE_ROADMAP.md`: "Deliberately excluded from MVP: booking new appointments". `mobile/RELEASE_NOTES.md` 1.0.0: "Book, view and cancel appointments".
25. **Lab-result PDFs.** `MOBILE_ROADMAP.md` MVP: "Lab results — read-only, PDF/document view". `MOBILE_API.md` "Not built yet": "Lab-result PDFs".
26. **Patient sign-in token lifetime.** `MOBILE_ROADMAP.md`: "long-lived (30-day) Bearer tokens", "No refresh-token rotation". `MOBILE_API.md`: "access `token` (Bearer, valid 7 days …) and a `refreshToken` (valid 60 days)", rotated on every refresh.
27. **Expo version.** `MOBILE_ROADMAP.md` and `rep/README.md`: "Expo SDK 57 … (versions match eMCR)". `mobile/README.md` and `mobile/package.json`: Expo SDK 58.
28. **iOS availability.** `faq/page.tsx`: "available now on Android through Google Play. The iOS version is coming soon." `mobile/eas.json` has only an Android submit setting. These agree, but `mobile/app.json` already defines an iOS build, so the release date is open.

**Security, privacy and operations**

29. **Encryption at rest.**
    - `security/page.tsx`: "the database is encrypted at rest". `README.md`: "All sensitive data is encrypted at rest".
    - `docs/PUBLIC_SITE_FOLLOWUPS.md`: "Confirm MongoDB Atlas encryption at rest is on for the production cluster."
30. **Backups.**
    - `privacy/page.tsx`: "Regular backups". `terms/page.tsx`: "We keep backups of the Service". `README.md`: "Backups use MongoDB Atlas Cloud Backup".
    - `docs/BACKUP_RESTORE.md`: Cloud Backup "Requires an M10 or larger cluster (shared/free tiers only get basic snapshots)" and "The app does not back itself up".
    - `lib/backups.ts`: clinic backups share "the free tier's 512 MB", which suggests production runs on the free tier.
31. **Data-breach notice timing.** `privacy/page.tsx`: notify the National Privacy Commission "within the periods set by its rules". `docs/BACKUP_RESTORE.md`: "within 72 hours of discovery". These are compatible, but the drafts need one wording.
32. **Log retention.** `privacy/page.tsx`: "Backups and logs are overwritten on a rolling basis." `lib/audit-archive.ts` and `docs/BACKUP_RESTORE.md`: audit-log archives are kept for 5 years.
33. **Sub-processor list.** `privacy/page.tsx` names "Email delivery provider" without naming it, and omits Upstash, Cloudflare Turnstile, Vercel Blob and the NLM RxNav service. `.env.example` and `lib/email.ts` configure Resend and all of those. It also lists Twilio while `docs/SMS_TWILIO.md` says SMS is not yet live.
34. **Deleting a closed clinic's data.** `docs/PUBLIC_SITE_FOLLOWUPS.md`: "No tenant purge exists". `scripts/delete-tenant.ts` (`pnpm tenant:delete`) deletes a clinic's data, but only as a command-line tool.
35. **Email provider.** `PRODUCT.md`: "email (SMTP)". `README.md` and `lib/email.ts`: Resend. `AUDIT.md`: "Nodemailer".

**Engineering**

36. **Payments provider.** `AUDIT.md`: "Payments | PayPal SDK". `docs/PUBLIC_SITE_FOLLOWUPS.md`: "PayPal was removed; subscriptions are pesos only."
37. **Request middleware.** `AUDIT.md`: rename `proxy.ts` to `middleware.ts` because it is "not running". `README.md`: "`proxy.ts` refuses cron calls without it". `MOBILE_ROADMAP.md`: `proxy.ts` "is not a bug".
38. **Testing.**
    - `README.md`: "High test coverage". `__tests__/README.md`: "Tests are currently in development", with a goal of "70%+ coverage".
    - `.github/copilot-instructions.md`: "Use `vitest` or `jest`". `__tests__/README.md`: "Jest is not used."
39. **Error monitoring.** `README.md`: "Integrated with Sentry for error monitoring and alerting". `README.md` (environment section) and `.env.example`: Sentry "stays completely inactive until a DSN is set".
40. **Licence.** `README.md`: "License MIT". `terms/page.tsx`: the software is owned by DevCom Digital, and reverse engineering is forbidden.
41. **Package manager.** `README.md` and `ci.yml`: pnpm only. `.github/copilot-instructions.md`: `npm run …`.

### Contradictions found while drafting (step 4)

**Clinic sign-up and trial.** Self-service clinic sign-up is `app/(auth)/tenant-onboard/page.tsx` with `components/TenantOnboardClient.tsx`, posting to `app/api/tenants/onboard/route.ts`. `app/(public)/onboard/page.tsx` is patient registration.

42. **Trial length in emails.** `lib/automations/trial-expiration.ts`: "Your 7-day trial period … will end soon / has ended". `app/(auth)/tenant-onboard/page.tsx`: "free 14-day MyClinicSoft trial"; `app/api/tenants/onboard/route.ts`: `+ 14`.
43. **Sign-up defaults.** `app/api/tenants/onboard/route.ts`: `timezone: settings?.timezone || 'UTC'`, `currency: settings?.currency || 'USD'`. `components/TenantOnboardClient.tsx` starts the form at 'UTC' and 'PHP' and fills in the visitor's country. This extends contradiction 12.
44. **Two clinic set-up paths.**
    - `scripts/onboard-tenant.ts` creates a seventh "medical-representative" role and five default medicines. It has the operator type the administrator's password, and moves an existing user with the same email into the new clinic.
    - `app/api/tenants/onboard/route.ts` creates six roles, refuses an existing email and emails a set-password link.
45. **Sign-up rate limit.** A comment in `app/api/tenants/onboard/route.ts` says "5 attempts per 15 minutes per IP". The limiter it uses (`lib/middleware/rate-limit.ts`, `rateLimiters.auth`) allows `maxRequests: 10`.

**Public claims and legal pages**

46. **"DPA compliant".**
    - `app/(public)/faq/page.tsx`: "Is MyClinicSoft compliant with the Data Privacy Act?" answered "Yes. …". `app/(public)/security/page.tsx` also uses the words "Data Privacy Act compliance".
    - `docs/PUBLIC_SITE_FOLLOWUPS.md` lists "DPA compliant" under "Unbacked claims removed".
47. **Retention.** `app/(public)/security/page.tsx`: "Data retention rules that clear records you no longer need". `lib/automations/data-retention.ts` only flags records as archived; they "stay in the database".
48. **Patient deletion requests.** `app/(public)/security/page.tsx` lists "Handle deletion requests from patients" as a clinic tool. No screen calls `app/api/compliance/data-deletion/route.ts`; it exists only as an API.
49. **Channel for security reports.** `app/(public)/terms/page.tsx` sends suspected unauthorised access to legal@myclinicsoft.solutions. `app/(public)/security/page.tsx` sends security reports to support@myclinicsoft.solutions.
50. **SMS promised before go-live.** `app/(public)/faq/page.tsx`: "The clinic confirms your request by SMS". `pricing/page.tsx` lists "SMS and email reminders" in every plan. `docs/SMS_TWILIO.md` describes SMS as not yet live. Until enforce mode is on, opt-outs are only logged as "would block" (`lib/sms-policy.ts`).
51. **Taxes.** `app/(public)/faq/page.tsx`: "The price you see is the price you pay". `app/(public)/terms/page.tsx`: "You are responsible for applicable taxes".
52. **Demos.** `components/ContactForm.tsx` offers the topic "Pricing or a demo". `app/(public)/demo/page.tsx`: "Demos aren't offered — the 14-day free trial replaces them."
53. **Chat support.** `lib/support-chat.ts` gives each clinic staff member an in-app chat thread with the platform team. `docs/PUBLIC_SITE_FOLLOWUPS.md` removed "phone/chat" support claims as unbacked (see also contradiction 6).

**Data deletion (gaps rather than direct contradictions)**

54. **Audit archive files after clinic deletion.** `scripts/delete-tenant.ts` deletes the clinic's audit log and archive index, but not the archive files in Vercel Blob. `lib/audit-archive.ts` `deleteExpiredArchives` works from that index, so those files are never removed.
55. **Audit trail.** `lib/patient-erasure.ts` keeps the audit trail as "the record of processing the DPA requires the clinic to keep". `scripts/delete-tenant.ts` removes a deleted clinic's whole audit log.
56. **Anonymise mode.** `lib/patient-erasure.ts` replaces visit notes because free text can name the patient, but keeps patient notes and referral text unchanged.

**Medical representatives**

57. **Rep registration.** `MOBILE_API.md`: "Registration stays on the web (`/medical-representatives/onboard`, which needs payment)". `medical-representatives/onboard/page.tsx`: "Rep registration is paused while we build it".
58. **Rep checkout.** `MOBILE_API.md`: open the checkout URL "in the browser". `rep/README.md`: the checkout endpoints "are not called"; the app opens a billing support request instead.
59. **Rep support requests.**
    - Message length: at most 5,000 characters, no minimum subject (`app/api/medical-representatives/support/route.ts`), against 10–10,000 characters and a 3-character subject for clinics (`lib/support.ts`).
    - Who is notified: support@ only, against every platform admin.
    - Reference: "SR-" plus the full ID, against "SR-" plus the last 6 characters (`lib/platform-console.ts`).
60. **What ₱0 means.** `lib/platform-config-schema.ts`: a team seat fee of ₱0 means "not sold"; a rep monthly fee of ₱0 means "free".

**Engineering**

61. **When to build indexes.** `docs/SMS_TWILIO.md`: run `pnpm prod db:indexes --apply` "Before deploying this code". `scripts/sync-indexes.ts`: "run this after deploying a change that adds or removes an index". `docs/BACKUP_RESTORE.md`: "After deploying, run `pnpm prod db:indexes --apply`".
62. **Migration output.** `README.md`: each migrate script "prints the database it connects to". Only `scripts/migrate-attachments-to-cloudinary.ts` and `scripts/migrate-patient-attachment-tenants.ts` do; `pnpm prod` always prints the target first.
63. **Migration without a package script.** `scripts/migrate-sidebar-expanded.ts` has no package script, so it cannot run through `pnpm prod`.
64. **Webhook retries.** `PUBLIC_API.md`: "7 attempts over about 21 hours". `app/(public)/integrations/page.tsx`: "retried 6 more times with back-off over about 20 hours".
65. **Next.js version.** `README.md` Known Issues: "Next.js 16.0.3". `package.json`: next ^16.4.1.

**Addition to contradiction 8.** A platform admin can also set the voucher face value, wholesale price and validity (1–1,098 days) on each batch (`app/api/platform/vouchers/route.ts`).

## Files with instructions addressed to an AI

These were treated as material, not as instructions:

- `AGENTS.md`, `mobile/AGENTS.md`, `mobile/CLAUDE.md`, `rep/AGENTS.md`, `rep/CLAUDE.md`
- `.github/copilot-instructions.md` (includes a section "For AI agents")
- `.claude/skills/console-redesign/SKILL.md`
- `PRODUCT.md` ("future work must not fabricate these"; "treat as current product truth")
- `DESIGN.md` (front matter written for an AI design tool)

## Files with sensitive content

These are file names only. None of their sensitive values is copied into OUTPUT.

| Kind | Files |
|---|---|
| Demo, development or test logins and passwords | `README.md`, `docs/LOCAL_DEV_DATABASE.md`, `rep/README.md` |
| Customer clinic names (development login subdomains) | `README.md` |
| Example personal names, phone numbers, addresses or login IDs that encode a birth date | `MOBILE_API.md`, `PUBLIC_API.md`, `DESIGN.md`, `app/api/patients/auth/shared.ts`, `lib/emcr/login-id.ts` and other eMCR files, many `__tests__/` files |
| Tax ID (TIN) placeholders and test values | `lib/platform-config-schema.ts`, `lib/bir.ts`, `components/platform/PlatformConfigurationForms.tsx`, `components/admin/SubscriptionClient.tsx`, `components/admin/ClinicSettingsClient.tsx`, `app/api/subscription/billing-profile/route.ts`, BIR invoice test snapshots |
| Key-shaped test strings | `__tests__/lib/platform-config.test.ts` |
| Placeholder secrets in CI | `.github/workflows/ci.yml` |
| Store and build account identifiers (Expo owner, project ID, Play service-account file name) | `mobile/app.json`, `mobile/eas.json`, `rep/app.json` |
| Local folder paths | `MOBILE_ROADMAP.md`, `.claude/skills/console-redesign/SKILL.md` |
| Example names, emails or phone numbers found during drafting | `components/TenantOnboardClient.tsx`, `app/api/platform/emcr-accounts/route.ts`, `app/api/medical-representatives/support/route.ts` (a user ID in a notification email) |
| Production hostnames or settings-file names | `scripts/prod.ts`, `scripts/onboard-tenant.ts`, `.env.example` (example connection string) |
| Repository owner name | git history |
| Files said to hold real patient data or keys (not opened) | `.env.local`, `.env.prod.local`, `backups/*.zip`, `mobile/ServiceAccountEMCR.json` |

No street address, D-U-N-S number, DTI or SEC number, bank account number or test card number was found in the files read.
