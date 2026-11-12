# Company Overview

## Summary

The Company Overview describes DevCom Digital, a business registered in the Philippines, and its product MyClinicSoft. It is for every colleague who needs a short, reliable picture of what the company does, who its customers are, how it is organised and how work reaches it. DevCom Digital builds MyClinicSoft, a cloud clinic management platform for Philippine clinics, and eMCR (Electronic MyClinic Record), the patient app for clinics that use MyClinicSoft. The company sells to clinics online in Philippine pesos (₱), works in the Asia/Manila time zone and publishes support hours from Monday to Saturday. The source files name no company departments, so the organisation section lists only the roles and mailboxes that the source files do mention.

## What the company does

DevCom Digital builds MyClinicSoft, an integrated clinic management platform that helps Philippine clinics coordinate day-to-day operations in one place: patient records, scheduling, clinical documentation, billing, inventory and patient communication (source: COMPANY_PROFILE.md). The public website describes MyClinicSoft as "Cloud clinic management software for Philippine clinics" (source: lib/seo.ts).

DevCom Digital states the product purpose as "An integrated clinic management platform covering the full operational loop of a healthcare practice — patient registration through billing — so staff spend less time on administrative overhead and more on patient care" (source: PRODUCT.md). The About page puts the mission as "Less admin, more patient care" (source: app/(public)/about/page.tsx).

DevCom Digital owns MyClinicSoft, eMCR and their software, content and branding (source: app/(public)/terms/page.tsx). The company runs the platform as a hosted service: clinics use it over the internet with no installation or server maintenance (source: app/(public)/faq/page.tsx). [TO CONFIRM: whether an on-premises option exists (contradiction 22)]

The company's industry is healthcare technology and clinic practice management (source: COMPANY_PROFILE.md). [TO CONFIRM: founding date, office location and company size]

## Customers and markets

DevCom Digital's customers are clinics and medical practices in the Philippines (source: COMPANY_PROFILE.md). PRODUCT.md names the Philippines as the primary geography and ASEAN as secondary. The public website is in English and Filipino (source: lib/seo.ts).

| Customer group | Who they are | Source |
|---|---|---|
| Clinics (buyers) | Independent clinics, growing practices and multi-doctor practices. Clinic owners and administrators decide and buy | COMPANY_PROFILE.md |
| Clinic staff (users) | Doctors, nurses, medical technologists, receptionists, accountants and clinic administrators | lib/roles.ts |
| Patients | People who use eMCR to see records and book with participating clinics | COMPANY_PROFILE.md; app/(public)/terms/page.tsx |
| Medical representatives | Pharmaceutical and medical-device representatives who visit clinics and use the MyClinicSoft Rep app [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device (contradiction 18)] | rep/README.md; lib/roles.ts |

Clinics buy online. Every clinic starts with a free trial and then chooses a monthly or yearly subscription, paid through PayMongo; Enterprise customers go through "Talk to sales" (source: app/(public)/pricing/page.tsx; app/(public)/faq/page.tsx). The trial length and the plans are in the Products and Services Catalogue.

DevCom Digital does not name customers in the source files. [TO CONFIRM: which customers, if any, may be named in documents]

## Products and services at a glance

The Products and Services Catalogue holds what each product includes, its price and its limits. In one line each:

| Product or service | One line |
|---|---|
| MyClinicSoft Free trial | The free starting plan every new clinic gets |
| MyClinicSoft Basic | Paid plan for small clinics |
| MyClinicSoft Professional | Paid plan for growing clinics |
| MyClinicSoft Enterprise | Paid plan for large and multi-doctor practices, sold through "Talk to sales" |
| Yearly billing | A yearly payment option for the paid plans |
| eMCR | Patient app for clinics that use MyClinicSoft; activated by a voucher the patient buys at a clinic counter |
| MyClinicSoft Rep | Mobile app for medical representatives; built, not yet released |
| MyClinicSoft public API (`/api/v1`) and webhooks | Lets a clinic connect its own systems |

## How the company is organised

DevCom Digital's departments are not named in the source files. [TO CONFIRM: company departments, their heads (role titles) and reporting lines]

The source files mention only these roles and functions. The Teams and Responsibilities document describes each one and how to reach it.

| Role or function | What the source files say it does | Source |
|---|---|---|
| Platform admins | "The people who run MyClinicSoft itself, not any one clinic": they answer support requests, set prices and business settings, issue eMCR voucher batches and manage clinic accounts | lib/platform-auth.ts; lib/support.ts; lib/platform-config.ts |
| Support team | Answers patients and clinics | app/(public)/faq/page.tsx |
| Data Protection Officer | Privacy contact for anything DevCom Digital controls; no person named | app/(public)/privacy/page.tsx |
| Legal contact | Questions about the Terms of Service | app/(public)/terms/page.tsx |
| Sales | Enterprise enquiries through "Talk to sales" | app/(public)/pricing/page.tsx |
| Mobile team | The mobile roadmap plans "one focused mobile team plus backend support" | MOBILE_ROADMAP.md |
| Owner | Takes the open "owner decisions" listed after the public-site audit | docs/PUBLIC_SITE_FOLLOWUPS.md |

[TO CONFIRM: owner role title, and role titles for support, sales, finance and engineering]

## Working hours, time zone and currency

DevCom Digital's published support hours are the only working hours in the source files (source: components/PublicPage.tsx).

| Day | Support hours |
|---|---|
| Monday to Friday | 9:00 AM to 6:00 PM |
| Saturday | 10:00 AM to 4:00 PM |
| Sunday | Closed |

The support hours are taken to be Asia/Manila time. [TO CONFIRM: support hours time zone (assumed Asia/Manila), public holidays, and staff working hours] Enterprise customers have support hours and response times agreed in their contract (source: app/(public)/support/page.tsx).

| Item | Value | Source |
|---|---|---|
| Time zone | Asia/Manila (PHT, UTC+8), the platform default. Scheduled jobs are set in UTC | lib/tz.ts; README.md |
| Currency | Philippine pesos (PHP), written with the ₱ symbol and a thousands comma | app/(public)/terms/page.tsx; app/(public)/pricing/page.tsx; DESIGN.md |

## How work is requested and approved

DevCom Digital receives work from outside through a few fixed channels. The Teams and Responsibilities document lists the exact channel for each request.

1. A clinic administrator signs in and opens a support request from the clinic's Admin → Support page. The request gets a reference in the form SR-XXXXXX, and platform admins are notified by email (source: app/(public)/support/page.tsx; lib/support.ts).
2. Other clinic staff ask their clinic administrator to open a request (source: app/(public)/support/page.tsx).
3. Patients, visitors and people who cannot sign in write to the support mailbox or use the contact form (source: app/(public)/support/page.tsx; app/(public)/contact/page.tsx).
4. Prospective Enterprise customers use "Talk to sales", which leads to the contact page (source: app/(public)/pricing/page.tsx).
5. Privacy requests go to the Data Protection Officer, and questions about the Terms of Service go to the legal mailbox (source: app/(public)/privacy/page.tsx; app/(public)/terms/page.tsx).

Within the company, the source files record that platform admins set prices and business settings in Platform → Configuration (source: lib/platform-config.ts), and that some questions are "owner decisions" (source: docs/PUBLIC_SITE_FOLLOWUPS.md). [TO CONFIRM: who approves internal work, spending and customer commitments, and the limits for each]

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | Company Glossary; Products and Services Catalogue; Teams and Responsibilities; Communication and Conduct Standards; Data Handling and Confidentiality; Customer Support Playbook; Systems Overview |

## Open questions

1. [TO CONFIRM: whether an on-premises option exists] PRODUCT.md says "Deployment-agnostic (cloud or on-prem)"; app/(public)/faq/page.tsx says "cloud-based … no installation or server maintenance required"; README.md says "The app is deployed on Vercel" (contradiction 22).
2. [TO CONFIRM: founding date, office location and company size] None of these is in the source files.
3. [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device] lib/roles.ts: "Pharmaceutical representatives who visit the clinic's doctors"; rep/README.md: "pharmaceutical and medical-device representatives" (contradiction 18).
4. [TO CONFIRM: which customers, if any, may be named in documents]
5. [TO CONFIRM: company departments, their heads (role titles) and reporting lines] The source files name no departments.
6. [TO CONFIRM: owner role title, and role titles for support, sales, finance and engineering]
7. [TO CONFIRM: support hours time zone (assumed Asia/Manila), public holidays, and staff working hours] components/PublicPage.tsx gives hours without a time zone.
8. [TO CONFIRM: who approves internal work, spending and customer commitments, and the limits for each]
9. [TO CONFIRM: owner role, effective date and review date of this document]
10. Product name: most files use "MyClinicSoft", while MOBILE_ROADMAP.md and AUDIT.md use "myclinicsoft" and DESIGN.md uses "Clinic Management System" (contradiction 21). This document uses "MyClinicSoft".
11. PRODUCT.md still lists a patient "self-service portal" and a "dedicated pharma sales portal" for medical representatives; MOBILE_API.md says both web portals "have been removed" (contradiction 15). This document follows MOBILE_API.md.
