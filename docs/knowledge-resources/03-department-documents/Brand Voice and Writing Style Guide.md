# Brand Voice and Writing Style Guide

## Summary

The Brand Voice and Writing Style Guide sets out how DevCom Digital writes about MyClinicSoft, eMCR (Electronic MyClinic Record) and MyClinicSoft Rep: on the website, in the apps, in emails and in support replies. It is for everyone who writes for customers, in English or Filipino. The voice is plain, honest, practical and warm, and every example in this guide comes from the website, the apps or their design and translation rules. The most important rule is about claims: no testimonials, uptime figures, customer counts or "DPA compliant", and nothing the product does not back. The brand identity (name, logo and colours) "is fixed and binding" (PRODUCT.md).

## Who we write for

DevCom Digital writes for the people named in the source files (PRODUCT.md; COMPANY_PROFILE.md; DESIGN.md):

| Reader | What they need from the words |
|---|---|
| Clinic owners and administrators | What the product does, what it costs and what they are agreeing to, in plain terms |
| Clinic staff who "spend their whole shift" in the console: front desk, doctors, nurses, medical technologists, billing | Short labels and messages that say what will happen, readable between phone calls |
| Patients using eMCR, in English or Filipino | Everyday words, as in the apps they already use; nothing that changes medical meaning |
| Medical representatives using MyClinicSoft Rep | The same plain style, in English or Filipino |

## Voice trait: plain

Plain means short sentences and the words people actually say. A setting says what it changes; an error gives a "short plain explanation" and a "Try again" button; an activity entry "reads as one sentence that starts with the person", never as codes or raw ids (DESIGN.md).

| We write like this | Not like this |
|---|---|
| "Above 0, every invoice is taxed at this rate and staff can't type a tax amount." (a setting that says what it does, DESIGN.md) | A switch with no explanation, or a setting nothing reads |
| "Only clinic administrators can contact support" | An error code |
| "Front desk, doctors, billing, and admins each see only what their role allows." (security page) | Technical names for access control |

## Voice trait: honest

Honest means saying only what the product does and what the company has decided, including the unwelcome answers. COMPANY_PROFILE.md calls the benefits "product goals, not guaranteed clinical or financial outcomes".

| We write like this | Not like this |
|---|---|
| "No. Payments are non-refundable, so start with the 14-day free trial to make sure it fits your clinic." (pricing page) | Avoiding the question, or hinting at refunds |
| "Built for the Data Privacy Act of 2012" (security page) | "DPA compliant" |
| "eMCR is available now on Android through Google Play. The iOS version is coming soon." (FAQ) | "Available on all phones" |

## Voice trait: practical

Practical means writing about the work a clinic does, not about the software. The about page puts it as "tools that remove real work from the front desk and the consult room, not features for their own sake", and "Designed for healthcare staff, not IT teams".

| We write like this | Not like this |
|---|---|
| "Clinic operations, run from one system" (home page headline) | Superlatives about the technology |
| "Scan at the clinic and follow your place in the queue." (home page) | A list of features with no task attached |
| "Start the same day; bringing over old records takes longer the more you have." (compare page) | "Instant migration" |

## Voice trait: warm

Warm means friendly and polite without being formal. In Filipino the apps use "everyday, warm Filipino as in GCash/Maya/Shopee: short sentences, 'mo/iyo' (not 'ninyo/inyo'), 'po' only in apologies or requests that need extra courtesy" (mobile/lib/i18n/GLOSSARY.md; rep/lib/i18n/GLOSSARY.md).

| We write like this | Not like this |
|---|---|
| "How can we help you today?" (support page) | "Submit your inquiry" |
| "Kumusta ang pagbisita mo?" ("How was your visit?", eMCR) | The formal "ninyo/inyo" forms |
| "Ikaw na!" ("Your turn", eMCR queue) | A formal announcement |

## Words we use and words we avoid

| Use | Avoid | Note |
|---|---|---|
| MyClinicSoft | MyClinic Soft, Clinic Management System | "myclinicsoft" only as the internal project name |
| eMCR; first use "eMCR (Electronic MyClinic Record)" | EMCR, e-MCR, the patient portal | The patient web portal was removed |
| MyClinicSoft Rep | rep portal, med rep app | |
| medical representative (short form: rep) | med rep, medrep | |
| clinic | tenant | "tenant" only in technical documents |
| sign in, sign out | log in, login (as a verb) | Filipino: "mag-sign in", never "mag-log in" in one place and "mag-sign in" in another |
| support request (reference SR-XXXXXX) | ticket, case | Filipino keeps "request"; the reference is never translated |
| activation voucher, activation code | coupon, promo code | |
| AI visit notes (customer-facing); AI scribe (legal and technical) | | |
| teleconsult | telemedicine, video consult | |
| e-prescription; e-Rx (patient app only) | | |
| sales invoice (BIR) | official receipt | |
| Data Privacy Act of 2012 (RA 10173); after first use "Data Privacy Act" | PH DPA, Data Protection Act | |
| PhilHealth, HMO, PayMongo, GCash, Maya, GrabPay, QR Ph, ICD-10 | Philhealth, Paymongo | |

In the apps, never show prices or "buy" wording: vouchers are sold at clinic counters and rep plans are paid on the web (MOBILE_API.md; rep/README.md). In Filipino, keep the English word where that is what patients and staff say (appointment, lab results, QR code, password), and keep doses, test names and diagnoses in English when in doubt (GLOSSARY.md files).

Sources: mobile/lib/i18n/GLOSSARY.md; rep/lib/i18n/GLOSSARY.md; lib/support.ts; lib/emcr/activation.ts; lib/bir.ts; app/(public)/pricing/page.tsx; app/(public)/privacy/page.tsx; mobile/README.md.

## Formatting conventions

| Item | Convention | Source |
|---|---|---|
| Dates in documents | YYYY-MM-DD, for example 2026-10-22 | terms page; MOBILE_API.md |
| Times | 9:00 AM – 6:00 PM | components/PublicPage.tsx |
| Time zone | Asia/Manila unless stated | lib/tz.ts |
| Currency | Peso sign and thousands comma: ₱1,499. "PHP" only in tables headed Currency | DESIGN.md; terms page |
| Figures in the product | Numbers, times, dates and amounts in Geist Mono with tabular figures, so columns line up | DESIGN.md |
| Headings and badges | Sentence case | DESIGN.md |
| Buttons in Filipino | Verb first, capitalised like the English: "I-save", "Magpatuloy", "Subukan Ulit"; English loan verbs take a hyphen prefix: i-tap, i-scan, mag-book | GLOSSARY.md |
| Product names | MyClinicSoft, eMCR (lower-case e), MyClinicSoft Rep, exactly as written here [TO CONFIRM: eMCR at the start of a sentence] | COMPANY_PROFILE.md; mobile/README.md; rep/README.md |
| Icons | Outline icons; never emoji | DESIGN.md |

Some public-page card titles use title case, for example "Patient Management" on the home page, against the sentence-case rule [TO CONFIRM: whether public card titles follow sentence case].

## Email and message structure

The support emails in the product follow one pattern (lib/support.ts):

1. Subject: the topic and the reference, for example "Re: <subject> [SR-XXXXXX]".
2. First line: who did what, in one sentence, for example "The MyClinicSoft support team replied to your request SR-XXXXXX."
3. The message itself, set apart as a quote.
4. The next step, when there is one, for example "We have marked it resolved. Reply from the app if anything is still wrong."

In-app notifications use the same order: a short title ("Support replied: <subject>"), then the message, sent as "MyClinicSoft support". Messages that are answered somewhere else say so ("The requester gets your reply by email"). Greeting, sign-off and signature for emails written by people are [TO CONFIRM: email greeting and signature]. Text from the server (error messages and push notifications) is not translated (GLOSSARY.md).

## Social media and public posts

The source files contain no social media rules or accounts [TO CONFIRM: social media accounts and who posts]. Until the owner decides, the following need approval from [TO CONFIRM: approving role] before publishing on the website or elsewhere:

- any new claim about security, privacy, support levels, availability or results;
- any price, discount or fee, including the eMCR voucher fee;
- any photo or screenshot: the features and about pages still use stock photos captioned as clinic teams, which are to be replaced with product screenshots or real photos (docs/PUBLIC_SITE_FOLLOWUPS.md);
- any customer name, quotation or logo;
- any release date (iOS app, MyClinicSoft Rep, SMS).

## Claims we may make

| Claim | Source |
|---|---|
| Built for the Data Privacy Act of 2012 (RA 10173) | security page; faq page |
| Role-based access, two-factor sign-in, audit logs of access to patient records | security page |
| TLS encryption in transit; extra AES-256-GCM encryption of sign-in secrets and integration keys | security page |
| Every clinic's data kept separate | security page |
| Backups clinic administrators can take at any time | security page; pricing page |
| 14-day free trial, no credit card [TO CONFIRM: trial length (contradictions 12 and 42)] | pricing page; terms page |
| No setup fee | pricing page |
| Cloud-based, no installation | faq page |
| Clinics do not pay for eMCR, with the voucher fee disclosed | terms page |
| DevCom Digital does not sell clinic patient data or use it to train AI models | privacy page |

## Claims we may not make

| Claim | Why | Source |
|---|---|---|
| "DPA compliant" | Removed as unbacked | docs/PUBLIC_SITE_FOLLOWUPS.md |
| Testimonials, case studies, customer counts, competitor names | None on hand; must not be fabricated | PRODUCT.md; docs/PUBLIC_SITE_FOLLOWUPS.md |
| Uptime figures, such as a percentage | Removed from the about page | docs/PUBLIC_SITE_FOLLOWUPS.md |
| 24/7, phone or chat support | Removed; contradictions 6 and 53 | docs/PUBLIC_SITE_FOLLOWUPS.md |
| Proration, add-ons, multi-location, white-label | Removed | docs/PUBLIC_SITE_FOLLOWUPS.md |
| "Encrypted at rest" | Only with [TO CONFIRM: encryption at rest (contradiction 29)] | docs/PUBLIC_SITE_FOLLOWUPS.md |
| National Privacy Commission registration | Not confirmed | docs/PUBLIC_SITE_FOLLOWUPS.md |
| A number of modules ("15+ more modules") | The pages disagree [TO CONFIRM: module count (contradiction 10)] | home page; features page |
| Guaranteed clinical or financial outcomes | "Product goals, not guaranteed … outcomes" | COMPANY_PROFILE.md |
| That AI visit notes can be used without review | A licensed professional must review them | terms page |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Company Glossary; Communication and Conduct Standards; Customer FAQ; Sales Playbook; Products and Services Catalogue |

## Open questions

1. [TO CONFIRM: eMCR at the start of a sentence]: the source files always write "eMCR" but give no rule for a sentence start.
2. [TO CONFIRM: whether public card titles follow sentence case]: DESIGN.md sets sentence case; the home page uses "Patient Management", "Appointment Scheduling".
3. [TO CONFIRM: email greeting and signature] for emails written by people.
4. [TO CONFIRM: social media accounts and who posts].
5. [TO CONFIRM: approving role] for public posts and new claims.
6. [TO CONFIRM: encryption at rest (contradiction 29)].
7. [TO CONFIRM: module count (contradiction 10)].
8. The security page description still says "Data Privacy Act compliance" and the FAQ answers "Is MyClinicSoft compliant with the Data Privacy Act?" with "Yes", against the "DPA compliant" removal in docs/PUBLIC_SITE_FOLLOWUPS.md (contradiction 46).
9. The home and about pages say "Built for the PH Data Privacy Act", which uses the short form "PH" that the conventions avoid.
10. PRODUCT.md uses "Philippine Data Protection Act" and "PH DPA", which are the wrong name for RA 10173.
11. DESIGN.md is titled "Design System: Clinic Management System", not MyClinicSoft (contradiction 21).
12. All Filipino text in MyClinicSoft Rep was drafted without a native reviewer and "needs native review" before release (rep/lib/i18n/GLOSSARY.md); several eMCR terms carry the same flag (mobile/lib/i18n/GLOSSARY.md).
13. [TO CONFIRM: owner role], effective date and review date.
14. Chat support: docs/PUBLIC_SITE_FOLLOWUPS.md removed "phone/chat" support claims as unbacked, while lib/support-chat.ts gives each clinic staff member an in-app chat thread with the platform team (contradiction 53). Whether chat support may be mentioned is open.
15. [TO CONFIRM: trial length (contradictions 12 and 42)]: the terms page and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts gives 7 days, and the trial emails in lib/automations/trial-expiration.ts say "7-day trial period".
