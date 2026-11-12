# Sales Playbook

## Summary

The Sales Playbook describes how DevCom Digital sells MyClinicSoft to clinics in the Philippines: who the product suits, who buys, how a clinic moves from first contact to a paid plan, and how to answer common objections. It is for anyone who talks to prospective clinics [TO CONFIRM: sales role title]. Most clinics buy without a salesperson: they sign up for the 14-day free trial [TO CONFIRM: trial length (contradictions 12 and 42)] and pay online through PayMongo; only Enterprise goes through "Talk to sales". Demos are not offered, because the free trial replaces them. Prices and plan limits are in "Products and Services Catalogue"; discount rules are not part of this playbook.

## Ideal customer profile

The MyClinicSoft ideal customer is a clinic or medical practice in the Philippines that wants to run patient records, scheduling, clinical documentation, billing and inventory from one system (sources: COMPANY_PROFILE.md; PRODUCT.md).

| Item | Profile |
|---|---|
| Industry | Clinics and medical practices; primary geography the Philippines, secondary ASEAN |
| Size | Independent clinics, growing practices and multi-doctor practices. Plan fit by number of doctors follows the plan limits in "Products and Services Catalogue" |
| Buyer | Clinic owner or administrator |

Signals of a good fit, from the problems the website addresses (sources: compare page; COMPANY_PROFILE.md):

- Records kept on paper charts, spreadsheets or chat apps, and patient histories scattered across files.
- Reminders sent by hand, one by one; a crowded lobby with paper queue numbers.
- PhilHealth and HMO claims tracked with receipts and manual tallies.
- Stock levels and expiry dates updated "when someone remembers".
- A wish to give patients online booking, a live queue and results on their phones.

## Signals of a poor fit

Signals that a clinic is a poor fit for MyClinicSoft:

| Signal | Why | Source |
|---|---|---|
| Needs the software installed on its own servers | MyClinicSoft is cloud-based [TO CONFIRM: deployment options (contradiction 22)] | faq page; README.md |
| Needs several locations managed from one account | Each location is its own account today [TO CONFIRM (contradiction 5)] | faq page |
| Needs phone, chat or round-the-clock support | Not offered | docs/PUBLIC_SITE_FOLLOWUPS.md |
| Needs to pay in a currency other than pesos | Subscriptions are pesos only | docs/PUBLIC_SITE_FOLLOWUPS.md |
| Needs an iPhone patient app now | eMCR is on Android; iOS is coming soon | faq page |
| Expects clinical decision-making from the software | MyClinicSoft is not a medical device and gives no medical advice | terms page |

## Buyer roles and what each cares about

The buyer roles in a clinic and what each cares about, from the users and value statements in the source files:

| Role | What the role cares about |
|---|---|
| Clinic owner or administrator (the buyer) | One system instead of several tools; dashboards, staff, reports; data privacy and audit trails; price and no setup fee; signing the Terms of Service on behalf of the clinic |
| Doctor | Fast visit notes, diagnoses with ICD-10, e-prescriptions with interaction checks, lab results; AI visit notes on plans that include them |
| Nurse and medical technologist | Recording vitals and lab results without double entry |
| Receptionist (front desk) | Booking, check-in, the queue and reminders between phone calls |
| Accountant (billing) | Invoices, payments, PhilHealth and HMO claims, financial reports |
| Patient (indirect influence) | Booking, a live queue and results in the eMCR app |

Sources: PRODUCT.md; COMPANY_PROFILE.md; lib/roles.ts; DESIGN.md.

## Sales stages

The sales stages for MyClinicSoft. Most clinics move through them on their own; the CRM is [TO CONFIRM: CRM used by sales].

| Stage | Entry criteria | Activities | Exit criteria | System where it is recorded |
|---|---|---|---|---|
| Enquiry | A clinic writes to support@myclinicsoft.solutions or uses the contact form (topic "Pricing or a demo"), or reads the pricing page | Answer questions; point to the "Customer FAQ" and the pricing page; invite the clinic to start the free trial | The clinic signs up, or asks for Enterprise | Support mailbox [TO CONFIRM: CRM] |
| Free trial | The clinic signs up at `/tenant-onboard` | Help with setup and data import; the system reminds the clinic 3 days and 1 day before the trial ends | The clinic pays for a plan, or the trial ends | Platform console: clinic lifecycle "In trial" |
| Conversion | The clinic chooses Basic, Professional or Enterprise | The clinic administrator pays monthly or yearly through PayMongo on the subscription page | Payment confirmed | Platform console: lifecycle "Paying"; payment history; BIR sales invoice |
| Enterprise | The clinic clicks "Talk to sales" | Agree price, support terms, integrations, training and payment by invoice | Contract signed [TO CONFIRM: contract process] | [TO CONFIRM] |
| Lapsed | The trial or paid plan ended without payment | Remind the clinic of the 7-day read-only grace period and how to subscribe | The clinic pays again, or stays lapsed | Platform console: lifecycle "Trial ended" or "Lapsed" |

The platform console dashboard shows paying clinics, clinics in trial, sign-ups in the last 30 days, churn over 30 days and trial-to-paid conversion (source: app/(platform)/platform/page.tsx; lib/platform-metrics.ts).

## Qualification questions

Qualification questions built from the plan limits and fit signals in the source files:

1. How many doctors and how many staff accounts does the clinic need? (Plan limits are in "Products and Services Catalogue".)
2. Roughly how many patients and appointments a month does the clinic handle?
3. Does the clinic file PhilHealth or HMO claims?
4. What does the clinic use today for records, scheduling and billing: paper, spreadsheets, chat apps or another system?
5. How many existing records would need to be brought over, and in what format (for example CSV or Excel)?
6. Does the clinic need AI visit notes, teleconsult, or a REST API and webhooks for its own integrations?
7. Does the clinic have more than one location?
8. Will the clinic pay monthly, yearly, or (Enterprise) by invoice?
9. Do the clinic's patients mostly use Android phones?
10. Who in the clinic will be the administrator and sign the Terms of Service?

## Value messages by customer type

Value messages by customer type, using only claims the source files support:

| Customer type | Value message |
|---|---|
| Small clinic (Basic) | All core clinic modules in one system: patients, appointments, queue, visits, prescriptions, lab results, billing with PhilHealth and HMO claims, inventory. No setup fee; start the same day |
| Growing clinic (Professional) | Everything in Basic plus AI visit notes, teleconsult, a REST API and webhooks, and priority email support [TO CONFIRM: support level per plan (contradiction 6)] |
| Large or multi-doctor practice (Enterprise) | Everything in Professional plus custom integrations with the DevCom Digital team, support terms agreed in the contract, personalised training sessions and payment by invoice |
| Every clinic | Patients get the eMCR app at no cost to the clinic: online booking, a live queue on their phones, and results and prescriptions in the app. Built for the Data Privacy Act of 2012 (RA 10173), with role-based access, two-factor sign-in and an audit trail |

Sources: app/(public)/pricing/page.tsx; app/(public)/faq/page.tsx; app/(public)/compare/page.tsx; app/(public)/terms/page.tsx. Results depend on each clinic's workflows; the source files call these "product goals, not guaranteed clinical or financial outcomes" (COMPANY_PROFILE.md).

## Objection: "We manage fine with paper and spreadsheets"

The objection is that the clinic's current paper charts, spreadsheets and chat apps are good enough. The response walks through the everyday jobs the compare page lists: finding a patient's full history (scattered files versus searchable in seconds), reminders (sent one by one versus automatic), the queue (paper numbers versus QR check-in and a live queue on patients' phones), and security (anyone with the cabinet key versus role-based access and an audit trail). Evidence to cite: the compare page at www.myclinicsoft.solutions.

## Objection: "Our staff are not technical"

The objection is that the clinic team lacks IT skills. The response: MyClinicSoft is built for healthcare professionals, not IT experts; it is cloud-based, with no installation or server maintenance; and DevCom Digital provides documentation, guides for every module and support. Evidence to cite: the "Customer FAQ" and the free trial.

## Objection: "Switching will take too long"

The objection is that moving to a new system is too much work. The response: basic setup of the clinic, doctors and schedules takes minutes and the clinic can start the same day; the team helps import existing records sent as CSV or Excel exports; bringing over old records takes longer the more there are. Evidence to cite: the compare page ("Switching is easier than you think") and the FAQ.

## Objection: "Is our patient data safe?"

The objection is a concern about privacy and security. The response: MyClinicSoft is built for the Data Privacy Act of 2012 (RA 10173), with TLS encryption, extra encryption of sign-in secrets and integration keys, role-based access, two-factor sign-in, clinic isolation, audit logs, and backups clinic administrators can take at any time. DevCom Digital does not sell clinic patient data or use it to train AI models. Evidence to cite: the security page and Privacy Policy. Never say "DPA compliant", and do not mention encryption at rest until it is confirmed [TO CONFIRM: encryption at rest (contradiction 29)].

## Objection: "What if we want to leave?"

The objection is fear of being locked in. The response: the clinic owns its data, can export it while the account is active or read-only, and after closing the account can ask in writing for its data to be deleted within 30 days. Evidence to cite: the Terms of Service and the FAQ [TO CONFIRM: data export on the Free trial (contradiction 4)].

## Objection: "We cannot get a refund if it does not work out"

The objection is that payments are non-refundable. The response: that is why every clinic starts with a free trial with no credit card, and everything set up during the trial stays when the clinic subscribes; there is no setup fee. Evidence to cite: the Terms of Service and the pricing page [TO CONFIRM: refund policy (contradiction 11)].

## Objection: "Can we see a demo first?"

The objection is a request for a demo. The response: DevCom Digital does not run demos; the free trial replaces them, so the clinic can try the product with its own team and data. Evidence to cite: the `/demo` page redirects to the sign-up page (source: app/(public)/demo/page.tsx).

## Objection: "We have several branches"

The objection is that the clinic has more than one location. The response: each location runs as its own MyClinicSoft account today, and managing several locations from one account is on the roadmap [TO CONFIRM: multi-location support (contradiction 5)]. Evidence to cite: the FAQ.

## Objection: "Our patients use iPhones"

The objection is that eMCR is not on iPhone. The response: eMCR is available on Android through Google Play and the iOS version is coming soon; patients can still book through the clinic's online booking page [TO CONFIRM: iOS release date (contradiction 28)].

## Objection: "We need phone or 24/7 support"

The objection is a need for phone, chat or round-the-clock support. The response: all plans include email support, Professional gets priority handling, and Enterprise support hours and response times are agreed in the contract. Phone, chat and 24/7 support are not offered. Evidence to cite: the pricing page and support page [TO CONFIRM: support level per plan (contradiction 6)].

## What may not be promised without approval

The following may not be promised to a prospect without approval from [TO CONFIRM: approving role]. Most were removed from the public website in the 2026-10-22 audit because nothing backs them (docs/PUBLIC_SITE_FOLLOWUPS.md):

| Do not promise | Reason or source |
|---|---|
| 24/7, phone or chat support | Removed from the website |
| Prorated plan changes or credit for unused time | Removed; contradiction 1 |
| Add-ons, white-label versions | Removed |
| Several locations under one account | Removed; contradiction 5 |
| "DPA compliant" or National Privacy Commission registration | Removed; registration is an open owner decision; contradiction 46 |
| Uptime figures, testimonials, customer counts, customer names | Removed; PRODUCT.md |
| Encryption at rest | Open owner decision; contradiction 29 |
| Enterprise support hours or response times | Decided per contract |
| A refund, a discount, extra trial days or any other price exception | See "Pricing and Discount Rules" |
| Release dates for the iOS app or the MyClinicSoft Rep app | Not set |
| Custom integration work or delivery dates | Agreed for Enterprise only |
| Installation on the clinic's own servers | Contradiction 22 |
| That eMCR is free for patients | Patients may need an activation voucher; contradiction 7 |

## Hand-over to delivery or onboarding

Clinics on the self-service path set themselves up when they sign up, and the step-by-step setup is in "Onboarding a New Clinic". When a clinic needs help after signing up, sales passes it to the support team through the support request system or the support mailbox, as described in "Customer Support Playbook". For Enterprise, the hand-over passes on the agreed support terms, integrations, training and payment terms [TO CONFIRM: Enterprise hand-over steps and owner]. Data imports are handled "together with our team" [TO CONFIRM: who does data imports].

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Products and Services Catalogue; Customer FAQ; Customer Support Playbook; Pricing and Discount Rules; Brand Voice and Writing Style Guide; Onboarding a New Clinic; Standard Contract Terms Summary |

## Open questions

1. [TO CONFIRM: sales role title]: the source files name only "Talk to sales".
2. [TO CONFIRM: CRM used by sales] and where enquiries are recorded.
3. [TO CONFIRM: contract process] for Enterprise and [TO CONFIRM: Enterprise hand-over steps and owner].
4. [TO CONFIRM: deployment options (contradiction 22)]: PRODUCT.md "Deployment-agnostic (cloud or on-prem)"; faq page "cloud-based … no installation"; README.md deployed on Vercel.
5. [TO CONFIRM: multi-location support (contradiction 5)].
6. [TO CONFIRM: encryption at rest (contradiction 29)].
7. [TO CONFIRM: data export on the Free trial (contradiction 4)].
8. [TO CONFIRM: refund policy (contradiction 11)].
9. [TO CONFIRM: iOS release date (contradiction 28)].
10. [TO CONFIRM: support level per plan (contradiction 6)]. Related: lib/support-chat.ts gives clinic staff an in-app chat thread with the platform team, while docs/PUBLIC_SITE_FOLLOWUPS.md removed chat-support claims (contradiction 53); this playbook says chat support is not offered.
11. [TO CONFIRM: approving role] for anything outside this playbook.
12. [TO CONFIRM: who does data imports].
13. The contact form offers the topic "Pricing or a demo" (components/ContactForm.tsx), but the demo page says "Demos aren't offered — the 14-day free trial replaces them" (app/(public)/demo/page.tsx) (contradiction 52).
14. No customer names, case studies or testimonials are available for sales use (PRODUCT.md; fact sheet "Named customers").
15. [TO CONFIRM: owner role], effective date and review date.
16. [TO CONFIRM: trial length (contradictions 12 and 42)]: the terms page and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts gives 7 days, and the trial emails in lib/automations/trial-expiration.ts say "7-day trial period".
