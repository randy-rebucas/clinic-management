# Products and Services Catalogue

## Summary

The Products and Services Catalogue describes every product and service DevCom Digital offers: the four MyClinicSoft plans (Free trial, Basic, Professional and Enterprise), yearly billing, the eMCR patient app, the MyClinicSoft Rep app and the MyClinicSoft public API. It is for every colleague who explains, sells or supports the products, and it is the one place for public list prices and plan limits. All prices are in Philippine pesos (₱) and are defaults in the code: a platform admin can change them in Platform → Configuration, so each price carries a [TO CONFIRM: live price] marker until the owner confirms it. Costs, margins and internal discount rules are not in this document; they are in Pricing and Discount Rules.

## MyClinicSoft Free trial

The MyClinicSoft Free trial is the plan every new clinic starts on when it signs up on the website (source: app/(public)/pricing/page.tsx; app/api/tenants/onboard/route.ts).

| Item | Detail |
|---|---|
| What it is | 14 days of MyClinicSoft with the clinic's own team. No credit card is required to start (source: app/(public)/terms/page.tsx) [TO CONFIRM: trial length (contradictions 12 and 42)] |
| Who it is for | Any clinic deciding whether MyClinicSoft fits before paying |
| Included | The core features, with the limits shown in the plan limits table below [TO CONFIRM: what the trial includes (contradiction 3)]. AI visit notes and teleconsult are included (source: app/(public)/pricing/page.tsx) |
| Not included | REST API and webhooks (source: lib/subscription-packages.ts). [TO CONFIRM: whether the trial includes reports and data export (contradictions 3 and 4)] |
| Delivery time | Available at once after self-service sign-up. The clinic is warned 3 days and 1 day before the trial ends (source: lib/automations/trial-expiration.ts) |
| After the trial | The clinic chooses a paid plan to keep going; everything set up during the trial stays. Without a paid plan the trial ends and the expiry rules in "Billing terms for MyClinicSoft plans" apply (source: app/(public)/pricing/page.tsx; app/(public)/terms/page.tsx) |
| Public list price | Free |
| Related products | MyClinicSoft Basic, MyClinicSoft Professional, MyClinicSoft Enterprise |

## MyClinicSoft Basic

MyClinicSoft Basic is the entry paid plan, marked "Recommended" on the pricing page (source: app/(public)/pricing/page.tsx).

| Item | Detail |
|---|---|
| What it is | All core clinic modules with email support |
| Who it is for | "Small clinics with 1–3 doctors" (source: app/(public)/pricing/page.tsx) |
| Included | Patient management, appointment scheduling, visit management, prescriptions, lab results, billing, inventory and basic reporting (source: app/(public)/faq/page.tsx), plus everything in "What every MyClinicSoft plan includes" |
| Not included | AI visit notes, teleconsult, REST API and webhooks (source: lib/subscription-packages.ts; app/(public)/pricing/page.tsx) |
| Delivery time | Available at once after payment through PayMongo |
| Public list price | ₱1,499 a month (default) [TO CONFIRM: live price]. Yearly price: see "Yearly billing" |
| Related products | MyClinicSoft Free trial, MyClinicSoft Professional, eMCR |

## MyClinicSoft Professional

MyClinicSoft Professional is the plan for growing clinics (source: app/(public)/pricing/page.tsx).

| Item | Detail |
|---|---|
| What it is | Everything in Basic, with AI visit notes, teleconsult, the REST API and webhooks, and priority email support |
| Who it is for | "Growing clinics with up to 10 doctors" (source: app/(public)/pricing/page.tsx) |
| Included | AI visit notes (drafts that a licensed professional must review before they are saved, signed or relied on; source: app/(public)/terms/page.tsx), teleconsult, custom reports, API access and webhooks (source: app/(public)/faq/page.tsx), priority email support (source: app/(public)/pricing/page.tsx) |
| Not included | Custom integrations built with the DevCom Digital team (Enterprise only) (source: app/(public)/pricing/page.tsx) |
| Delivery time | Available at once after payment through PayMongo |
| Public list price | ₱3,999 a month (default) [TO CONFIRM: live price]. Yearly price: see "Yearly billing" |
| Related products | MyClinicSoft Basic, MyClinicSoft Enterprise, MyClinicSoft public API |

## MyClinicSoft Enterprise

MyClinicSoft Enterprise is the plan for the largest customers, sold through "Talk to sales" (source: app/(public)/pricing/page.tsx).

| Item | Detail |
|---|---|
| What it is | Everything in Professional, custom integrations with the DevCom Digital team, and support terms agreed in the customer's contract |
| Who it is for | "Large and multi-doctor practices" (source: app/(public)/pricing/page.tsx) |
| Included | Unlimited patients, doctors, staff, appointments and storage (see the plan limits table); personalised training sessions (source: app/(public)/faq/page.tsx); payment by invoice as well as through PayMongo (source: app/(public)/faq/page.tsx) |
| Not included | Published support hours or response times: these are agreed in the contract [TO CONFIRM: Enterprise support terms] |
| Delivery time | [TO CONFIRM: time from first contact to a running Enterprise account] |
| Public list price | ₱9,999 a month (default), shown on the pricing page [TO CONFIRM: live price, and whether Enterprise is sold at the list price or only through a quote] |
| Related products | MyClinicSoft Professional, MyClinicSoft public API |

## What every MyClinicSoft plan includes

The pricing page lists these items under "Every plan includes" (source: app/(public)/pricing/page.tsx):

- Patients, appointments, queue, visits
- Prescriptions and lab results
- Billing, PhilHealth and HMO claims
- Inventory
- SMS and email reminders
- eMCR patient app connection [TO CONFIRM: how to present the ₱80 patient fee (contradiction 7)]
- Two-factor sign-in and audit trail
- Backups the clinic can take at any time

The features page lists the modules in four groups: Core, Clinical, Administrative, and Communication and access (source: app/(public)/features/page.tsx). [TO CONFIRM: number of modules (contradiction 10)]

## MyClinicSoft plan limits

The MyClinicSoft plan limits below come from lib/subscription-packages.ts and the pricing page.

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

Locations are left out until the owner confirms how several clinic locations are sold. [TO CONFIRM: locations per plan (contradiction 5)] [TO CONFIRM: support level per plan (contradiction 6)]

## Yearly billing

Yearly billing lets a clinic pay for a year of Basic, Professional or Enterprise at once (source: lib/subscription-period.ts; app/(public)/pricing/page.tsx).

| Item | Detail |
|---|---|
| What it is | A year's subscription priced at 10 times the monthly price: "two months free" [TO CONFIRM: wording of the saving (contradiction 9)] |
| Who it is for | Clinics that want to pay once a year |
| Public list price | Basic ₱14,990 a year; Professional ₱39,990 a year; Enterprise ₱99,990 a year (defaults) [TO CONFIRM: live price] |
| Related products | MyClinicSoft Basic, MyClinicSoft Professional, MyClinicSoft Enterprise |

## Billing terms for MyClinicSoft plans

The billing terms below apply to every paid MyClinicSoft plan (source: app/(public)/terms/page.tsx unless stated).

| Term | Detail |
|---|---|
| Billing | In advance, monthly or yearly, in Philippine pesos; the clinic pays applicable taxes |
| Payment methods | Through PayMongo: GCash, Maya, credit and debit cards, GrabPay and QR Ph. Enterprise customers can also pay by invoice (source: app/(public)/faq/page.tsx) |
| Setup fee | None (source: app/(public)/pricing/page.tsx) |
| Refunds | "All payments are final and non-refundable … except where Philippine law requires otherwise" [TO CONFIRM: refunds (contradiction 11)] |
| Changing plans | [TO CONFIRM: how plan changes are charged (contradiction 1)] |
| Price changes | At least 30 days' notice; a change applies from the next billing period |
| Expired subscription | Read-only for a 7-day grace period, so records can be viewed and exported; then access is suspended until the clinic subscribes again. Data is not deleted for a missed payment |

## eMCR

eMCR (Electronic MyClinic Record) is the patient app for clinics that use MyClinicSoft (source: mobile/README.md; app/(public)/terms/page.tsx).

| Item | Detail |
|---|---|
| What it is | A mobile app where patients see appointments, the live queue, lab results, prescriptions, bills and documents from their clinics, book visits and manage family members' records, in English or Filipino (source: mobile/README.md) |
| Who it is for | Patients of participating clinics, and parents or guardians who manage a family member's records |
| Included without activation | A basic summary of the patient's own records: profile and the lists of appointments, prescriptions, invoices, visits and lab results, notifications, clinics and family (source: app/(public)/terms/page.tsx; MOBILE_API.md) |
| Included with activation | Booking, check-in, the live queue, health summary, documents, vitals, and visit and lab-result details (source: MOBILE_API.md). The activation requirement is not yet switched on, so every feature is open until it is |
| Not included | Lab-result PDFs, unless the clinic uploaded one as a document (source: MOBILE_API.md). [TO CONFIRM: whether insurance flows stay out of the app] |
| Availability | Version 1.1.4 on Android through Google Play; the iOS version is "coming soon" (source: mobile/app.json; app/(public)/faq/page.tsx) [TO CONFIRM: iOS release date (contradiction 28)] |
| Related products | MyClinicSoft plans (every plan includes the eMCR connection) |

## eMCR activation price and sales rule

The eMCR activation price and sales rule below cover how patients pay for eMCR (source: app/(public)/terms/page.tsx; MOBILE_API.md).

| Item | Detail |
|---|---|
| Public list price | Clinics do not pay for eMCR. A patient activates it with a voucher bought for cash at a participating clinic: ₱80 for one year [TO CONFIRM: live price (contradiction 8)]. Renewals add a year to the current expiry. Vouchers are non-refundable and cannot be exchanged for cash (source: app/(public)/terms/page.tsx) |
| Reminders | By notification and SMS 30 days and 7 days before activation ends, and on the day it ends (source: mobile/RELEASE_NOTES.md) |
| Sales rule | The app never shows prices or "buy" wording; vouchers are sold at clinic counters (source: MOBILE_API.md) |
| Related products | eMCR |

## MyClinicSoft Rep

MyClinicSoft Rep is the mobile app for medical representatives who visit clinics on MyClinicSoft (source: rep/README.md).

| Item | Detail |
|---|---|
| What it is | An app to book visits in a clinic's rep hours, keep a visit log, carry product sheets and, for managers, see the team's visits (source: rep/README.md) |
| Who it is for | Medical representatives (pharmaceutical and medical-device representatives) [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device (contradiction 18)], and the managers of company teams |
| Included free | The visit log and products (source: rep/README.md; MOBILE_API.md) |
| Needs a plan | Booking with clinics and recording deliveries need a rep plan or a team seat, unless the rep fee is ₱0, which makes booking free (source: rep/README.md; MOBILE_API.md) [TO CONFIRM: rep booking fee (contradiction 19)] |
| Availability | Version 0.1.0, built but not released. Rep registration on the website is paused; clinics that already work with a rep can add them from their own account (source: rep/app.json; app/(public)/medical-representatives/onboard/page.tsx) [TO CONFIRM: release date (contradiction 17)] |
| Public list price | Rep monthly fee, team seat fee and one-time activation fee: ₱0 by default (source: lib/rep-billing.ts; lib/platform-config-schema.ts) [TO CONFIRM: live price]. Clinics never pay for rep visits (source: MOBILE_API.md) |
| Sales rule | The app never sells anything; reps pay on the web (source: rep/README.md) |
| Related products | MyClinicSoft plans (clinics set rep hours) |

## MyClinicSoft public API

The MyClinicSoft public API (`/api/v1`) and webhooks let a clinic connect another system, such as a lab system, a booking website, an accounting tool or a data warehouse (source: PUBLIC_API.md; app/(public)/integrations/page.tsx).

| Item | Detail |
|---|---|
| What it is | A REST API for patients, appointments, doctors and invoices, and signed webhooks for four events: a patient registered, an appointment booked, an appointment's status changed, an invoice fully paid (source: PUBLIC_API.md; app/(public)/integrations/page.tsx) |
| Who it is for | Clinics on Professional or Enterprise and the developers they work with. A clinic administrator creates keys and webhook endpoints under Admin → Developers (source: PUBLIC_API.md) |
| Included | Keys limited to one clinic and to chosen scopes; 120 requests a minute per key; failed webhook deliveries retried with back-off (source: PUBLIC_API.md) |
| Not included | Medical history, allergies, identifiers, guardians and sign-in details are never exposed (source: PUBLIC_API.md) |
| Availability | Available at once on Professional and Enterprise. Requests are refused if the plan lapses or drops below Professional (source: PUBLIC_API.md) |
| Public list price | Included in the Professional and Enterprise plans; no separate price in the source files |
| Related products | MyClinicSoft Professional, MyClinicSoft Enterprise |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | Company Overview; Company Glossary; Pricing and Discount Rules; Sales Playbook; Customer FAQ; Standard Contract Terms Summary; Issuing eMCR Activation Voucher Batches |

## Open questions

1. [TO CONFIRM: live price] for every price in this document. All are defaults in lib/subscription-period.ts, lib/rep-billing.ts and lib/emcr/activation.ts; platform admins can change them in Platform → Configuration (lib/platform-config.ts).
2. [TO CONFIRM: trial length] app/(public)/terms/page.tsx and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts uses "+ 7 // 7 days from now" (contradiction 12); the trial-expiry emails in lib/automations/trial-expiration.ts speak of a "7-day trial period" (contradiction 42).
3. [TO CONFIRM: what the trial includes] app/(public)/pricing/page.tsx: "Try everything with your own team for 14 days"; app/(public)/faq/page.tsx: "a 14-day free trial of the core features"; lib/subscription-packages.ts: no reporting, API, webhooks or data export in the trial (contradiction 3).
4. [TO CONFIRM: whether the trial includes reports and data export] app/(public)/faq/page.tsx: "You can export your data at any time"; app/(public)/compare/page.tsx: "paid plans include data export"; lib/subscription-packages.ts: trial `dataExport: false` (contradiction 4).
5. [TO CONFIRM: time from first contact to a running Enterprise account]
6. [TO CONFIRM: Enterprise support terms] docs/PUBLIC_SITE_FOLLOWUPS.md: "Decide the real hours and response times before publishing any again."
7. [TO CONFIRM: whether Enterprise is sold at the list price or only through a quote] The pricing page shows a monthly Enterprise price but its button is "Talk to sales".
8. [TO CONFIRM: how to present the ₱80 patient fee] app/(public)/pricing/page.tsx lists "eMCR patient app connection" under "Every plan includes"; the terms page says activation may need a ₱80 voucher; the home, features, FAQ, about and compare pages do not mention the fee (contradiction 7).
9. [TO CONFIRM: number of modules] Home page: "15+ more modules included" over 10 items; app/(public)/features/page.tsx: 21 module cards (contradiction 10).
10. [TO CONFIRM: locations per plan] app/(public)/faq/page.tsx: "Each clinic location runs as its own MyClinicSoft account today"; lib/subscription-packages.ts: Professional `maxLocations: 3`, Enterprise unlimited (contradiction 5).
11. [TO CONFIRM: support level per plan] The pricing page says Professional "Priority email support" and Enterprise "Support terms agreed in your contract"; lib/subscription-packages.ts gives Professional phone and chat support and Enterprise "24/7"; docs/PUBLIC_SITE_FOLLOWUPS.md lists these as unbacked claims removed (contradiction 6).
12. [TO CONFIRM: wording of the saving] app/(public)/faq/page.tsx: "Annual plans save about 17% … that's 2 months free" (fixed text); the pricing page calculates the saving from the configurable months-per-year setting (contradiction 9).
13. [TO CONFIRM: refunds] The terms, pricing and FAQ pages say payments are non-refundable; lib/subscription.ts removes paid time when PayMongo reports a full refund or chargeback (contradiction 11).
14. [TO CONFIRM: how plan changes are charged] app/(public)/pricing/page.tsx: "changes take effect immediately"; app/(public)/faq/page.tsx: "time left on the old plan isn't prorated or refunded"; lib/subscription-period.ts converts the days left "at the two plans' daily prices" (contradiction 1). Related: components/admin/SubscriptionClient.tsx says trial days left are kept, while lib/subscription-period.ts says a trial "is worth nothing to carry" (contradiction 2).
15. [TO CONFIRM: whether insurance flows stay out of the app] MOBILE_ROADMAP.md excludes insurance flows from the patient app.
16. [TO CONFIRM: iOS release date] app/(public)/faq/page.tsx: "The iOS version is coming soon"; mobile/app.json already defines an iOS build (contradiction 28).
17. [TO CONFIRM: live eMCR voucher price] lib/emcr/activation.ts fixes the face value at ₱80 in code; lib/platform-config.ts lets a platform admin change it (contradiction 8).
18. [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device] lib/roles.ts: "Pharmaceutical representatives"; rep/README.md: "pharmaceutical and medical-device representatives" (contradiction 18).
19. [TO CONFIRM: rep booking fee] MOBILE_API.md: booking is free while the rep fee is ₱0, "which is the default"; rep/README.md: booking needs a rep plan or a team seat, with no free default mentioned (contradiction 19).
20. [TO CONFIRM: release date of MyClinicSoft Rep] The home page says "Rep app: coming soon"; rep/README.md marks all four build phases "(done)" at version 0.1.0 (contradiction 17).
21. [TO CONFIRM: owner role, effective date and review date of this document]
22. Payment history currency: lib/subscription-page.ts shows payment history with `p.currency || 'USD'`, although all prices are in PHP (contradiction 13).
23. Webhook retries: app/(public)/integrations/page.tsx says failed deliveries "are retried 6 more times with back-off over about 20 hours"; PUBLIC_API.md says "7 attempts over about 21 hours" (the same six retries; the total time differs slightly) (contradiction 64).
24. Team seat fee: lib/platform-config-schema.ts treats a seat fee of ₱0 as "not sold" (team plans not offered online), while a rep monthly fee of ₱0 means "free". The two ₱0 defaults mean different things (contradiction 60).
25. Taxes: app/(public)/terms/page.tsx says the clinic is "responsible for applicable taxes"; app/(public)/faq/page.tsx says "The price you see is the price you pay" (contradiction 51).
26. SMS reminders: app/(public)/pricing/page.tsx lists "SMS and email reminders" in every plan, but docs/SMS_TWILIO.md describes SMS as not yet live (contradiction 50).
