# Teams and Responsibilities

## Summary

Teams and Responsibilities describes who at DevCom Digital handles which kind of work for MyClinicSoft, and how customers and colleagues reach them. It is for every colleague who needs to know where to send a request. The source files name no company departments: they mention only platform admins, a support team, a Data Protection Officer, a legal mailbox, sales ("Talk to sales"), a mobile team with backend support, and the owner. This document describes only what the source files state about each of them; everything else, including role titles, backups and hand-over rules, is marked [TO CONFIRM].

## How the company is staffed

DevCom Digital's department structure is not written down in the source files. [TO CONFIRM: company departments, the role titles in each, and how many people fill them] The groups below are working groups taken from what the source files say people do. One person may belong to several of them. [TO CONFIRM: whether the platform admins and the support team are the same people]

| Group | Source |
|---|---|
| Platform admins | lib/platform-auth.ts; lib/support.ts; lib/support-chat.ts; lib/platform-config.ts |
| Support team | app/(public)/faq/page.tsx; app/(public)/support/page.tsx; lib/support.ts |
| Data Protection Officer | app/(public)/privacy/page.tsx |
| Legal contact | app/(public)/terms/page.tsx |
| Sales | app/(public)/pricing/page.tsx; components/ContactForm.tsx |
| Mobile team and backend support | MOBILE_ROADMAP.md |
| Owner | docs/PUBLIC_SITE_FOLLOWUPS.md |

## Platform admins

Platform admins are "the people who run MyClinicSoft itself, not any one clinic" (source: lib/platform-auth.ts). The code calls them "the platform team" in support messages (source: lib/support.ts).

| Item | Detail |
|---|---|
| Purpose | Run the MyClinicSoft service for all clinics |
| Responsible for | Answering support requests and support chat conversations from clinic staff (lib/support.ts; lib/support-chat.ts); setting prices and business settings in Platform → Configuration (lib/platform-config.ts); issuing eMCR voucher batches (app/(platform)/platform/vouchers); granting eMCR days by hand after a complaint or a lost voucher already paid for (lib/emcr/activation.ts); extending a clinic's current period and viewing a clinic read-only to help it (components/platform/ClinicActions.tsx); sending announcements to clinics (app/(platform)/platform/notifications) |
| Not responsible for | A clinic's own patient records and how the clinic uses them; the clinic is the personal information controller (app/(public)/privacy/page.tsx) |
| Roles | Platform admin [TO CONFIRM: role titles and who is a platform admin] |
| Requests handled | Support requests, support chat, configuration and price changes, voucher batches, clinic account changes |
| How to reach | Through a support request; platform admins get an email for every new clinic request and reply (lib/support.ts). New requests from medical representatives are emailed to the support mailbox instead (app/api/medical-representatives/support/route.ts; contradiction 59) |
| Hands work to / receives work from | Receives support requests from clinic administrators and from medical representatives in the MyClinicSoft Rep app (lib/support.ts; app/api/medical-representatives/support/route.ts). [TO CONFIRM: who platform admins hand work to] |

## Support team

The support team answers "patients and clinics alike" (source: app/(public)/faq/page.tsx). Replies to support requests are signed "The MyClinicSoft support team" (source: lib/support.ts).

| Item | Detail |
|---|---|
| Purpose | Help clinics, patients and visitors use MyClinicSoft and eMCR |
| Responsible for | Answering support requests and support email during support hours, in the order messages arrive, with Professional and Enterprise requests handled first (app/(public)/contact/page.tsx; app/(public)/faq/page.tsx); problems with the eMCR app itself (app/(public)/faq/page.tsx); helping clinics bring existing records over, for example from CSV or Excel exports (app/(public)/faq/page.tsx); documentation and guides for every module (app/(public)/faq/page.tsx) |
| Not responsible for | Corrections or copies of a patient's medical records: the clinic manages them, and patients contact the clinic first (app/(public)/faq/page.tsx) |
| Roles | [TO CONFIRM: support role titles] |
| Requests handled | Support requests in the categories general, technical, billing, account, onboarding and other (lib/support.ts); contact form topics: help with a clinic account, patient and eMCR questions, billing, feature requests, bug reports and other (components/ContactForm.tsx) |
| How to reach | See "How to reach each group". Support hours are in the Company Overview |
| Hands work to / receives work from | [TO CONFIRM: hand-over rules to platform admins, engineering, the Data Protection Officer and sales] |

## Data Protection Officer

The Data Protection Officer is DevCom Digital's contact "for privacy questions or to exercise your rights" (source: app/(public)/privacy/page.tsx). No person is named. [TO CONFIRM: named Data Protection Officer and whether the name is published (docs/PUBLIC_SITE_FOLLOWUPS.md)]

| Item | Detail |
|---|---|
| Purpose | Privacy contact under the Data Privacy Act of 2012 (RA 10173) |
| Responsible for | Requests about personal information DevCom Digital controls: clinic staff accounts, eMCR accounts, billing information and enquiries sent to the company (app/(public)/privacy/page.tsx) |
| Not responsible for | Requests about clinic patient records: patients contact the clinic first, and DevCom Digital helps the clinic respond (app/(public)/privacy/page.tsx) |
| Roles | Data Protection Officer |
| How to reach | The privacy mailbox (see "How to reach each group") |
| Hands work to / receives work from | [TO CONFIRM: who decides on and sends a breach notice to the National Privacy Commission] |

## Legal contact

The legal mailbox receives questions about the Terms of Service (source: app/(public)/terms/page.tsx).

| Item | Detail |
|---|---|
| Purpose | Questions about the Terms of Service |
| Responsible for | Questions about the Terms; reports from clinics that suspect unauthorised access to their accounts (app/(public)/terms/page.tsx) |
| Roles | [TO CONFIRM: who reads the legal mailbox] |
| How to reach | The legal mailbox (see "How to reach each group") |
| Hands work to / receives work from | [TO CONFIRM] |

## Sales

Sales appears in the source files only as the "Talk to sales" button for Enterprise and the "Pricing or a demo" contact topic (source: app/(public)/pricing/page.tsx; components/ContactForm.tsx).

| Item | Detail |
|---|---|
| Purpose | Answer pricing questions and sell the Enterprise plan |
| Responsible for | Enterprise enquiries; recommending a plan to a clinic that describes itself ("tell us about your clinic and we'll recommend one", app/(public)/pricing/page.tsx) |
| Not responsible for | Self-service plans: clinics sign up and pay online without sales (app/(public)/pricing/page.tsx) |
| Roles | [TO CONFIRM: sales role titles] |
| How to reach | The contact page (see "How to reach each group") |
| Hands work to / receives work from | [TO CONFIRM: who agrees Enterprise contracts and support terms] |

## Mobile team and backend support

The mobile roadmap plans the patient app with "one focused mobile team plus backend support" (source: MOBILE_ROADMAP.md).

| Item | Detail |
|---|---|
| Purpose | Build and release eMCR and MyClinicSoft Rep, and the backend they use |
| Responsible for | [TO CONFIRM: engineering responsibilities, release ownership and on-call] |
| Roles | [TO CONFIRM: engineering role titles] |
| How to reach | [TO CONFIRM: internal channel for engineering requests] |

## Owner

The owner takes the decisions listed as "Owner decisions" after the public-site audit of 2026-10-22: National Privacy Commission registration, naming a Data Protection Officer, Enterprise support terms, disclosure of the eMCR activation fee and confirmation of encryption at rest (source: docs/PUBLIC_SITE_FOLLOWUPS.md). [TO CONFIRM: owner role title]

## How to reach each group

The channels below are the only ones published. No phone number is published (source: app/(public)/contact/page.tsx).

| Channel | Who uses it | For | Source |
|---|---|---|---|
| Admin → Support (`/admin/support`) | Clinic administrators, signed in | Support requests; replies arrive in the app and by email | app/(public)/support/page.tsx |
| support@myclinicsoft.solutions | Patients, visitors and anyone who cannot sign in | Support questions | components/PublicPage.tsx |
| Contact form (`/contact`) | Anyone | Opens an email to the support mailbox with a topic in the subject | components/ContactForm.tsx |
| support@myclinicsoft.solutions, subject "Security report" | Anyone | Reporting a security issue privately | app/(public)/security/page.tsx |
| privacy@myclinicsoft.solutions | Anyone | Privacy questions and data rights | app/(public)/privacy/page.tsx |
| legal@myclinicsoft.solutions | Clinics | Terms questions; suspected unauthorised access | app/(public)/terms/page.tsx |
| "Talk to sales" (leads to `/contact`) | Prospective Enterprise customers | Enterprise enquiries | app/(public)/pricing/page.tsx |
| Billing support request from the Rep app | Medical representatives | Asking for a payment link | rep/README.md |

## Who handles what: support, billing and configuration

The table below names, for each support, billing and configuration request, the team at DevCom Digital that handles it and its backup.

| Request type | Responsible team | Backup |
|---|---|---|
| Clinic support request (any category) | Support team; platform admins answer it in the platform console | [TO CONFIRM] |
| Problem with the eMCR app | Support team | [TO CONFIRM] |
| Correction or copy of a patient's medical record | The patient's clinic (not DevCom Digital) | Support team helps the clinic respond |
| Lost eMCR voucher or eMCR complaint | Platform admins | [TO CONFIRM] |
| Bringing existing records into MyClinicSoft | Support team ("our team" for larger migrations) | [TO CONFIRM] |
| Pricing question or Enterprise enquiry | Sales | [TO CONFIRM] |
| Billing question about a subscription | Support team (billing category) | [TO CONFIRM] |
| Medical representative asking for a payment link | Support team (billing request) | [TO CONFIRM] |
| Change to prices or business settings | Platform admins | [TO CONFIRM] |
| eMCR voucher batch for a clinic | Platform admins | [TO CONFIRM] |

## Who handles what: privacy, legal and security

The table below names, for each privacy, legal, security and owner-level request, the team at DevCom Digital that handles it and its backup.

| Request type | Responsible team | Backup |
|---|---|---|
| Privacy question or data rights request | Data Protection Officer | [TO CONFIRM] |
| Request to delete a closed clinic's data | [TO CONFIRM: which team receives and carries it out] | [TO CONFIRM] |
| Question about the Terms of Service | Legal contact | [TO CONFIRM] |
| Suspected unauthorised access to a clinic account | Legal contact | [TO CONFIRM] |
| Security vulnerability report | Support mailbox [TO CONFIRM: who investigates] | [TO CONFIRM] |
| Suspected personal data breach | [TO CONFIRM] | [TO CONFIRM] |
| Feature request or bug report | Support mailbox [TO CONFIRM: who decides on it] | [TO CONFIRM] |
| Owner decisions (see "Owner") | Owner | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | Company Overview; Communication and Conduct Standards; Data Handling and Confidentiality; Customer Support Playbook; Handling a Clinic Support Request; Responding to a Suspected Data Breach; Deleting a Closed Clinic's Data |

## Open questions

1. [TO CONFIRM: company departments, the role titles in each, and how many people fill them] The source files name no departments.
2. [TO CONFIRM: whether the platform admins and the support team are the same people] lib/support.ts says "the platform team answers them in the console" and signs replies "The MyClinicSoft support team".
3. [TO CONFIRM: role titles and who is a platform admin]
4. [TO CONFIRM: who platform admins hand work to]
5. [TO CONFIRM: support role titles]
6. [TO CONFIRM: hand-over rules to platform admins, engineering, the Data Protection Officer and sales]
7. [TO CONFIRM: named Data Protection Officer and whether the name is published] Open owner decision in docs/PUBLIC_SITE_FOLLOWUPS.md.
8. [TO CONFIRM: who decides on and sends a breach notice to the National Privacy Commission] docs/BACKUP_RESTORE.md says the NPC "must be notified within 72 hours of discovery"; app/(public)/privacy/page.tsx says "within the periods set by its rules" (contradiction 31). Neither names a role.
9. [TO CONFIRM: who reads the legal mailbox] and its hand-overs.
10. [TO CONFIRM: sales role titles] and [TO CONFIRM: who agrees Enterprise contracts and support terms].
11. [TO CONFIRM: engineering responsibilities, release ownership and on-call], [TO CONFIRM: engineering role titles] and [TO CONFIRM: internal channel for engineering requests].
12. [TO CONFIRM: owner role title]
13. [TO CONFIRM: which team receives and carries out a request to delete a closed clinic's data] docs/PUBLIC_SITE_FOLLOWUPS.md: "No tenant purge exists"; scripts/delete-tenant.ts deletes a clinic's data from the command line (contradiction 34).
14. [TO CONFIRM: who investigates a security vulnerability report] and who handles a suspected personal data breach.
15. [TO CONFIRM: who decides on feature requests and bug reports]
16. [TO CONFIRM: backup for every request type in the two "Who handles what" sections]
17. [TO CONFIRM: owner role, effective date and review date of this document]
18. Two routes for security concerns: app/(public)/terms/page.tsx asks clinics to report suspected unauthorised access to legal@myclinicsoft.solutions, while app/(public)/security/page.tsx asks for security issues at support@myclinicsoft.solutions with the subject "Security report". The two may be meant for different cases; confirm (contradiction 49).
19. Support chat: lib/support-chat.ts gives every clinic staff member an in-app conversation with the platform team, while docs/PUBLIC_SITE_FOLLOWUPS.md lists "phone/chat" support among the "Unbacked claims removed". Confirm whether support chat is an official support channel (contradiction 53).
20. Support email domain: components/TenantNotFound.tsx links a support address at a different domain; every other file uses myclinicsoft.solutions (contradiction 23).
21. Demos: components/ContactForm.tsx offers the contact topic "Pricing or a demo", while app/(public)/demo/page.tsx says "Demos aren't offered — the 14-day free trial replaces them" (contradiction 52).
