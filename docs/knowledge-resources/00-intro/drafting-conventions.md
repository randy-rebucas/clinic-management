# Drafting conventions

Written 2026-11-10 (step 2). Every draft uses the spellings and values below. Each line names its source. Where SOURCES contradict each other, the value marked **provisional** is used until the owner answers, and the draft keeps a [TO CONFIRM] marker pointing to the contradiction number in [source-inventory.md](../_review/source-inventory.md).

Not uploaded.

## Names: company and products

| Use exactly | Do not write | Source |
|---|---|---|
| DevCom Digital | Devcom, DevCom | COMPANY_PROFILE.md; terms page |
| MyClinicSoft | myclinicsoft (except the project name), MyClinic Soft, Clinic Management System | COMPANY_PROFILE.md; contradiction 21 |
| eMCR | EMCR, e-MCR, the patient portal | mobile/README.md; mobile/app.json |
| Electronic MyClinic Record (first use only: "eMCR (Electronic MyClinic Record)") | Electronic Medical Clinic Record | mobile/README.md |
| MyClinicSoft Rep | rep portal, med rep app | rep/README.md; rep/app.json |
| MyClinicSoft public API (`/api/v1`) | open API | PUBLIC_API.md |
| Project name in file names and P-document titles: myclinicsoft | | owner's instructions |

## Names: plans

| Use exactly | Note | Source |
|---|---|---|
| Free trial | 14 days | pricing page |
| Basic | | pricing page; lib/subscription-packages.ts |
| Professional | | same |
| Enterprise | | same |

## Names: roles

| Use exactly | Meaning | Source |
|---|---|---|
| Administrator (clinic administrator) | Full access within one clinic; "owner" counts as administrator | lib/roles.ts |
| Doctor | Clinical staff: patient care, visits, prescriptions | lib/roles.ts |
| Nurse | Clinical staff: patient care and lab results | lib/roles.ts |
| Medical technologist | Laboratory staff: receives lab requests, enters results | lib/roles.ts |
| Receptionist | Front desk: appointments, patient management, hands out medicines at checkout | lib/roles.ts |
| Accountant | Billing and invoices | lib/roles.ts |
| Medical representative (short form: rep) | Never "med rep" or "medrep" in documents. **Provisional** meaning: "pharmaceutical and medical-device representatives" (contradiction 18) | lib/roles.ts; rep/README.md |
| Patient | eMCR account holder or clinic patient | MOBILE_API.md |
| Family manager (guardian) | Manages a dependant's eMCR access; a minor's access passes to them at 18 | MOBILE_API.md; privacy page |
| Platform admin | A person at DevCom Digital who runs MyClinicSoft itself, not one clinic | lib/platform-auth.ts |
| Data Protection Officer | Privacy contact; no person named | privacy page |
| Support team | Answers support requests | faq page |

Company role titles for support, sales, finance and engineering are not in SOURCES. Drafts write "[TO CONFIRM: owner role]" and do not invent titles.

## Names: terms

| Use exactly | Do not write | Source |
|---|---|---|
| clinic | tenant (except in D6 and D7, as "clinic (tenant)") | MOBILE_API.md |
| activation voucher (also "voucher"); activation code inside it | coupon, promo code | lib/emcr/activation.ts; terms page |
| voucher batch (number format EV-YYYYMMDD-NNNN) | | lib/emcr/vouchers.ts |
| support request (reference SR-XXXXXX) | ticket, case | lib/support.ts |
| grace period | | lib/subscription-period.ts |
| AI visit notes (customer-facing); AI scribe (terms, privacy, technical) | | pricing page; terms page |
| teleconsult | telemedicine, video consult | pricing page |
| e-prescription (customer-facing); e-Rx (patient app only) | | COMPANY_PROFILE.md; mobile/README.md |
| PhilHealth, HMO, BIR, ICD-10, QR Ph, GCash, Maya, GrabPay, PayMongo | Philhealth, Paymongo | integrations page; faq page |
| Data Privacy Act of 2012 (RA 10173). Short form after first use: Data Privacy Act | PH DPA, Data Protection Act | privacy page; faq page (PRODUCT.md uses "PH DPA" and "Philippine Data Protection Act") |
| National Privacy Commission (NPC) | | privacy page |
| sales invoice (BIR) | official receipt | lib/bir.ts |
| sign in | log in, login (as a verb) | mobile/lib/i18n/GLOSSARY.md |

## Canonical values

### Prices and fees (all PHP; price figures live in C3 and D5 only)

| Item | Value | Source |
|---|---|---|
| Basic | ₱1,499 a month (default) | lib/subscription-period.ts |
| Professional | ₱3,999 a month (default) | lib/subscription-period.ts |
| Enterprise | ₱9,999 a month (default) | lib/subscription-period.ts |
| Yearly price | 10 × the monthly price ("two months free"): ₱14,990 / ₱39,990 / ₱99,990 at the defaults | lib/subscription-period.ts. **Provisional** wording: "two months free" (contradiction 9) |
| Setup fee | none | pricing page |
| Minimum price for any paid item | ₱20 (PayMongo minimum) | lib/platform-config-schema.ts |
| eMCR activation voucher | ₱80 a year, paid by the patient in cash at a clinic counter | terms page; lib/emcr/activation.ts |
| eMCR voucher wholesale price to clinics | ₱60 (the clinic keeps ₱20, 25%). Confidential, D5 only | lib/emcr/activation.ts |
| Medical representative fees | ₱0 (default): monthly fee, per-seat team fee and one-time activation fee | lib/rep-billing.ts; lib/platform-config.ts |

All prices are defaults in code. A platform admin can change them in Platform → Configuration, so every draft keeps "[TO CONFIRM: live price]" next to them until the owner confirms (lib/platform-config.ts).

### Plan limits (C3 holds the table)

| Limit | Free trial | Basic | Professional | Enterprise |
|---|---|---|---|---|
| Doctors | 2 | 3 | 10 | Unlimited |
| Staff users | 3 | 5 | 15 | Unlimited |
| Patients | 50 | 100 | 500 | Unlimited |
| Appointments a month | 100 | 500 | 2,000 | Unlimited |
| Storage | 1 GB | 5 GB | 20 GB | Unlimited |
| AI visit notes and teleconsult | Yes | No | Yes | Yes |
| API and webhooks | No | No | Yes | Yes |
| Support | Email | Email | Priority email | Agreed in contract |

Sources: lib/subscription-packages.ts; pricing page. The support row uses the **provisional** public wording (contradiction 6). Locations are left out of customer documents until contradiction 5 is answered.

### Periods and limits

| Item | Value | Source |
|---|---|---|
| Free trial | 14 days, no credit card | terms page; onboard route. **Provisional** (contradiction 12) |
| What the trial includes | **Provisional**: "the core features, with the limits shown in the Products and Services Catalogue" (contradiction 3) | faq page |
| Grace period after a subscription ends | 7 days, read-only; then access is suspended; data is not deleted for a missed payment | terms page; lib/subscription-period.ts |
| Trial expiry warnings | 3 days and 1 day before the end | lib/automations/trial-expiration.ts |
| Price-change notice | at least 30 days, applies from the next billing period | terms page |
| Notice of material changes to the terms | at least 15 days | terms page |
| Refunds | none: "All payments are final and non-refundable … except where Philippine law requires otherwise" | terms page. **Provisional** (contradiction 11) |
| Changing plans | **Provisional**: "[TO CONFIRM: how plan changes are charged]" (contradiction 1) | |
| Deleting a closed clinic's data | within 30 days of a written request from a clinic administrator | terms page; privacy page |
| Liability cap | fees the clinic paid in the 12 months before the event | terms page |
| Disputes | 30 days of good-faith settlement, then the proper courts of the Philippines | terms page |
| eMCR activation | 365 days a voucher; renewals add a year to the current expiry | lib/emcr/activation.ts; terms page |
| eMCR renewal reminders | 30 days and 7 days before expiry, and on the day it ends | mobile/RELEASE_NOTES.md |
| eMCR clinic invite code | works once, lasts 14 days | MOBILE_API.md |
| Patient payment link | valid 30 days; online minimum ₱20 | lib/payments/invoice-pay.ts; MOBILE_API.md |
| Public API rate limit | 120 requests a minute per key | PUBLIC_API.md |
| Webhook retries | 6 more times over about 20 hours | integrations page |
| Audit log | 90 days in the database, then archived for 5 years | lib/audit-archive.ts. Contradiction 32 |
| SMS delivery log | 60 days, no message bodies | docs/SMS_TWILIO.md |
| NPC breach notice | within 72 hours of discovery | docs/BACKUP_RESTORE.md. **Provisional** wording (contradiction 31) |
| Clinic in-app backups | at most 3 per clinic, 12 MB each | lib/backups.ts |
| Restore drill | once, then quarterly | docs/BACKUP_RESTORE.md |
| Support request lengths | subject 3–200 characters; message 10–10,000 | app/api/support/route.ts |

### Contact details (role mailboxes only)

| Purpose | Value | Source |
|---|---|---|
| Customer support and security reports | support@myclinicsoft.solutions (security reports: subject "Security report") | components/PublicPage.tsx; security page |
| Legal | legal@myclinicsoft.solutions | terms page |
| Privacy and Data Protection Officer | privacy@myclinicsoft.solutions | privacy page |
| In-app support (clinic administrators) | Admin → Support (`/admin/support`) | support page |
| Website | www.myclinicsoft.solutions | lib/seo.ts |
| Office address | [TO CONFIRM]. City only once confirmed; none found in SOURCES | |
| Phone | none published | contact page |

### Time, currency and formats

| Item | Value | Source |
|---|---|---|
| Currency | Philippine pesos, written "₱1,499" (symbol, thousands comma); "PHP" only in tables headed Currency | DESIGN.md; terms page |
| Time zone | Asia/Manila (PHT, UTC+8). Scheduled jobs are set in UTC | lib/tz.ts; README.md |
| Support hours | Monday–Friday 9:00 AM–6:00 PM; Saturday 10:00 AM–4:00 PM; Sunday closed. **Provisional**: Asia/Manila time | components/PublicPage.tsx |
| Dates in documents | YYYY-MM-DD (e.g. 2026-11-10) | SOURCES use ISO dates throughout (MOBILE_API.md) |
| Headings | sentence case | DESIGN.md |
| Spelling | British (organise, anonymise, unauthorised); quotations and on-screen labels stay exactly as written | matches the house rules and most drafts (decided at the M7 check, 2026-11-10) |

## Wording rules taken from SOURCES

- Never claim "DPA compliant". Write "built for the Data Privacy Act of 2012 (RA 10173)" (docs/PUBLIC_SITE_FOLLOWUPS.md; faq page).
- No uptime figures, testimonials, customer counts or competitor names (PRODUCT.md; docs/PUBLIC_SITE_FOLLOWUPS.md).
- No 24/7, phone or chat support promise (docs/PUBLIC_SITE_FOLLOWUPS.md; contradiction 6).
- "Encrypted at rest" only with [TO CONFIRM] until the owner confirms it (contradiction 29).
- AI visit notes are drafts that "a licensed professional must review" (terms page).
- The eMCR app never shows prices or "buy" wording; vouchers are sold at clinic counters (MOBILE_API.md). The MyClinicSoft Rep app "never sells anything" but shows plan and seat status and prices; payment happens on the web (rep/README.md).
