# Communication and Conduct Standards

## Summary

Communication and Conduct Standards sets out how people at DevCom Digital speak and write to clinics, patients, medical representatives and the public about MyClinicSoft, eMCR and MyClinicSoft Rep. It is for everyone who answers customers or writes public text. The source files hold no written conduct policy, so this document collects only the rules the source files do state: which claims may not be made, what must be checked before it is promised, and where complaints and sensitive requests go. The firmest rules are that testimonials, case studies and figures must not be fabricated, that unbacked claims such as 24/7 or phone support are not made, and that privacy, legal and security matters go to their own mailboxes. Everything not stated in the source files is marked [TO CONFIRM].

## Scope

Communication and Conduct Standards covers all communication on behalf of DevCom Digital about its products: support replies, support chat, emails, the website, app text and sales conversations. [TO CONFIRM: who the policy applies to: employees, contractors, AI employees, partners] [TO CONFIRM: whether the policy also covers conduct inside the company, such as behaviour between colleagues]

The groups that communicate with customers today are described in Teams and Responsibilities. Facts about plans and prices are in the Products and Services Catalogue. How to handle personal data is in Data Handling and Confidentiality. Word choice and style are in the Brand Voice and Writing Style Guide.

## Tone and professionalism with customers

The tone rules below come from the source files. [TO CONFIRM: a company-wide tone policy for support and sales]

| Rule | Source |
|---|---|
| Write plainly for healthcare staff, not IT experts | app/(public)/faq/page.tsx; app/(public)/about/page.tsx |
| State consequences in plain words before a customer acts, and say when something is missing | DESIGN.md |
| In Filipino, use everyday, warm language with short sentences; use "po" only in apologies or requests that need extra courtesy | mobile/lib/i18n/GLOSSARY.md; rep/lib/i18n/GLOSSARY.md |
| Keep the English word where that is what patients, reps and clinic staff actually say | mobile/lib/i18n/GLOSSARY.md; rep/lib/i18n/GLOSSARY.md |
| Never change medical meaning when translating; keep the English term when in doubt | mobile/lib/i18n/GLOSSARY.md |
| Reply during support hours, in the order messages arrive | app/(public)/contact/page.tsx |

The support hours are in the Company Overview.

## Promises and commitments

The public-site audit of 2026-10-22 removed claims that DevCom Digital cannot back (source: docs/PUBLIC_SITE_FOLLOWUPS.md). The same claims are not made in any other channel. [TO CONFIRM: that this rule applies to support and sales as well as the website]

| Not to be promised or claimed | Source | Who may change this |
|---|---|---|
| 24/7 support, phone support or chat support | docs/PUBLIC_SITE_FOLLOWUPS.md | [TO CONFIRM] |
| Proration, add-ons, managing several locations from one account, white-label | docs/PUBLIC_SITE_FOLLOWUPS.md | [TO CONFIRM] |
| "DPA compliant". The approved wording is "built for the Data Privacy Act of 2012 (RA 10173)" | docs/PUBLIC_SITE_FOLLOWUPS.md; app/(public)/security/page.tsx | [TO CONFIRM] |
| Testimonials, case studies, usage figures or uptime figures | PRODUCT.md; docs/PUBLIC_SITE_FOLLOWUPS.md; app/(public)/about/page.tsx | [TO CONFIRM] |
| Enterprise support hours or response times, beyond "agreed in your contract" | docs/PUBLIC_SITE_FOLLOWUPS.md | Owner (open owner decision) |
| That the database is encrypted at rest, until confirmed | docs/PUBLIC_SITE_FOLLOWUPS.md | Owner (open owner decision) |
| Refunds: "All payments are final and non-refundable … except where Philippine law requires otherwise" | app/(public)/terms/page.tsx | [TO CONFIRM] |
| Uninterrupted service | app/(public)/terms/page.tsx | [TO CONFIRM] |
| Clinical or financial results: these are "product goals, not guaranteed clinical or financial outcomes" | COMPANY_PROFILE.md | [TO CONFIRM] |
| Medical advice: the Service "is a records and workflow tool, not a medical device" | app/(public)/terms/page.tsx | [TO CONFIRM] |

The eMCR and MyClinicSoft Rep apps never show prices or "buy" wording (source: MOBILE_API.md; rep/README.md).

[TO CONFIRM: who approves any commitment beyond published terms, such as a discount, a custom integration, a delivery date or a support level, and the limit for each]

## Accuracy

The accuracy rules below come from the source files.

1. Quote prices and plan terms from the live pricing page. The prices in the source files are defaults that a platform admin can change, and COMPANY_PROFILE.md says "current pricing and terms should be confirmed through the official MyClinicSoft website".
2. Describe only what the product does today. DESIGN.md shows only settings "something in the app reads", never "a switch that does nothing"; the same honesty applies to what is said about the product.
3. Say plainly what is not yet available: the iOS version of eMCR is "coming soon", MyClinicSoft Rep is not yet released, and managing several locations from one account is "on our roadmap" (source: app/(public)/faq/page.tsx; app/(public)/page.tsx).
4. Disclose the eMCR activation fee where eMCR is presented. Before the activation requirement is switched on, the pages that present eMCR as included are to state the yearly activation fee (open owner decision, docs/PUBLIC_SITE_FOLLOWUPS.md). The fee is in the Products and Services Catalogue.
5. Describe AI visit notes as drafts that "may be incomplete or wrong"; "a licensed professional must review them before they are saved, signed, or relied on" (source: app/(public)/terms/page.tsx).
6. When a fact is not known, say so and find out rather than guess. [TO CONFIRM: whether this is a stated company rule; no SOURCE states it in these words]

## Handling complaints and upset customers

DevCom Digital has no written complaints procedure in the source files. [TO CONFIRM: complaints procedure, response times and who owns it] The routes below are what the source files state.

| Complaint | Route | Source |
|---|---|---|
| A clinic is unhappy with the service | Support request from Admin → Support; a reply from the clinic reopens a resolved request | app/(public)/support/page.tsx; lib/support.ts |
| A patient wants a record corrected or a copy | The patient's clinic first; DevCom Digital helps the clinic respond | app/(public)/faq/page.tsx; app/(public)/privacy/page.tsx |
| A patient has a problem with the eMCR app | Support team | app/(public)/faq/page.tsx |
| A patient lost a voucher already paid for, or complains about eMCR activation | A platform admin can grant activation days by hand | lib/emcr/activation.ts |
| A person complains about how their personal data is handled | Data Protection Officer; the person may also complain to the National Privacy Commission | app/(public)/privacy/page.tsx |
| A clinic disputes the Terms | Both sides first try to settle in good faith in writing; after 30 days without settlement, the proper courts of the Philippines | app/(public)/terms/page.tsx |
| A customer asks for a refund | The refund rule is in "Promises and commitments" [TO CONFIRM: how refund requests are handled (contradiction 11)] | app/(public)/terms/page.tsx |

The channels for each route are in Teams and Responsibilities.

## Escalating to a person

The source files name only a few cases that go to a specific role. [TO CONFIRM: escalation rules, including when an AI employee hands a conversation to a person, and the role that receives it]

| When | Escalate to | Source |
|---|---|---|
| A privacy question or a request to use data rights for data DevCom Digital controls | Data Protection Officer | app/(public)/privacy/page.tsx |
| A suspected personal data breach. If it is a breach, the National Privacy Commission must be notified within 72 hours of discovery [TO CONFIRM: breach notice wording (contradiction 31)] | [TO CONFIRM: role] | docs/BACKUP_RESTORE.md (contradiction 31) |
| A security issue | The support mailbox with the subject "Security report"; reporters are asked not to share details publicly until it is fixed | app/(public)/security/page.tsx |
| A clinic suspects unauthorised access to its accounts | Legal mailbox | app/(public)/terms/page.tsx |
| A question about the Terms of Service | Legal mailbox | app/(public)/terms/page.tsx |
| An Enterprise or pricing enquiry | Sales ("Talk to sales") | app/(public)/pricing/page.tsx |
| Enterprise support terms, NPC registration, naming the DPO, the eMCR fee disclosure, encryption at rest | Owner | docs/PUBLIC_SITE_FOLLOWUPS.md |

## Prohibited behaviour

DevCom Digital's Privacy Policy makes these public commitments about clinic patient data (source: app/(public)/privacy/page.tsx):

- Clinic patient data is processed on the clinic's instructions.
- DevCom Digital does not use clinic patient data for its own marketing.
- DevCom Digital does not sell clinic patient data.
- DevCom Digital does not use clinic patient data to train AI models.
- Personal information is shared only with the listed service providers, under contract, or when the law requires it.

Two further rules come from the source files:

- Testimonials, case studies and pricing figures must not be fabricated (source: PRODUCT.md).
- Claims removed as unbacked are not reintroduced (source: docs/PUBLIC_SITE_FOLLOWUPS.md; see "Promises and commitments").

The rules for handling personal and confidential data are in Data Handling and Confidentiality. [TO CONFIRM: other prohibited behaviour, such as harassment, conflicts of interest, gifts, and use of company accounts]

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | Company Overview; Teams and Responsibilities; Products and Services Catalogue; Data Handling and Confidentiality; Brand Voice and Writing Style Guide; Customer Support Playbook; Responding to a Suspected Data Breach |

## Open questions

1. [TO CONFIRM: who the policy applies to: employees, contractors, AI employees, partners]
2. [TO CONFIRM: whether the policy also covers conduct inside the company, such as behaviour between colleagues]
3. [TO CONFIRM: a company-wide tone policy for support and sales] The tone rules here come from the app translation glossaries, DESIGN.md and public pages.
4. [TO CONFIRM: that the rule against unbacked claims applies to support and sales as well as the website] docs/PUBLIC_SITE_FOLLOWUPS.md records it for the website only.
5. [TO CONFIRM: who may change each item in "Promises and commitments"] Only two items are marked as owner decisions in the source files.
6. [TO CONFIRM: who approves any commitment beyond published terms, such as a discount, a custom integration, a delivery date or a support level, and the limit for each]
7. [TO CONFIRM: whether "say so and find out rather than guess" is a stated company rule]
8. [TO CONFIRM: complaints procedure, response times and who owns it]
9. [TO CONFIRM: how refund requests are handled] The terms, pricing and FAQ pages say payments are non-refundable; lib/subscription.ts removes paid time when PayMongo reports a full refund or chargeback (contradiction 11).
10. [TO CONFIRM: escalation rules, including when an AI employee hands a conversation to a person, and the role that receives it]
11. [TO CONFIRM: role that handles a suspected personal data breach] docs/BACKUP_RESTORE.md: NPC notice "within 72 hours of discovery"; app/(public)/privacy/page.tsx: "within the periods set by its rules" (contradiction 31).
12. [TO CONFIRM: other prohibited behaviour, such as harassment, conflicts of interest, gifts, and use of company accounts]
13. [TO CONFIRM: owner role, effective date and review date of this document]
14. "DPA compliant" claim still on the FAQ: app/(public)/faq/page.tsx asks "Is MyClinicSoft compliant with the Data Privacy Act?" and answers "Yes. MyClinicSoft is built for the Philippine Data Privacy Act of 2012 (RA 10173)…", while docs/PUBLIC_SITE_FOLLOWUPS.md lists "DPA compliant" among the "Unbacked claims removed" (contradiction 46).
15. "Encrypted at rest" is still stated on app/(public)/security/page.tsx and app/(public)/faq/page.tsx ("encrypted in transit (TLS) and at rest") while docs/PUBLIC_SITE_FOLLOWUPS.md asks the owner to confirm it (contradiction 29).
16. Demos: components/ContactForm.tsx offers the topic "Pricing or a demo", while app/(public)/demo/page.tsx says "Demos aren't offered — the 14-day free trial replaces them" (contradiction 52).
17. Support chat: lib/support-chat.ts provides in-app chat between clinic staff and the platform team, while docs/PUBLIC_SITE_FOLLOWUPS.md removed "phone/chat" support claims as unbacked. Confirm whether chat may be offered as a support channel (contradiction 53).
18. Two routes for security concerns: app/(public)/terms/page.tsx sends suspected unauthorised access to legal@myclinicsoft.solutions; app/(public)/security/page.tsx sends security issues to support@myclinicsoft.solutions with the subject "Security report" (contradiction 49).
