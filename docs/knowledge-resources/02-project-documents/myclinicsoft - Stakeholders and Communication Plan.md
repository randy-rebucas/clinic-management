# myclinicsoft: Stakeholders and Communication Plan

## myclinicsoft: Summary

myclinicsoft: Stakeholders and Communication Plan lists who has a stake in the myclinicsoft project (provisionally the MyClinicSoft web platform, the eMCR (Electronic MyClinic Record) patient app, the MyClinicSoft Rep app and the go-live work [TO CONFIRM: project scope]), who decides what, how updates flow and when issues are escalated. It is for everyone who works on the project at DevCom Digital. The material names roles, not people, and names no internal meeting rhythm, so most internal decision makers, frequencies and response times are marked [TO CONFIRM]. Customer-facing channels that are stated in the material are: in-app support requests, support@myclinicsoft.solutions, legal@myclinicsoft.solutions and privacy@myclinicsoft.solutions; no phone support is published.

## myclinicsoft: Stakeholders inside DevCom Digital

Influence ratings in this table are provisional drafting estimates [TO CONFIRM: influence ratings].

| Stakeholder (role or organisation) | Interest | Influence | What they need from the project |
|---|---|---|---|
| Owner (makes the "owner decisions" in docs/PUBLIC_SITE_FOLLOWUPS.md) [TO CONFIRM: owner role title] | Product direction, legal and privacy commitments, pricing | High | Clear open decisions with options and deadlines |
| Platform admin | Runs MyClinicSoft, answers support requests, sets prices and configuration (lib/platform-auth.ts; lib/support.ts; lib/platform-config.ts) | High | Working admin tools, go-live runbooks, release notes |
| Data Protection Officer (no person named) | Privacy compliance and data subject requests (privacy page) | High | Privacy impact of each change; breach procedure |
| Support team | Answers support requests (faq page) | Medium | Release notes, known issues, the eMCR fee and activation rules |
| Mobile team plus backend support ("one focused mobile team plus backend support", MOBILE_ROADMAP.md) | Building eMCR, MyClinicSoft Rep and the backend they use | Medium | Stable API contract (MOBILE_API.md), decisions, priorities |
| Sales ("Talk to sales", pricing page) [TO CONFIRM: sales role] | Enterprise deals | Medium | Plan contents, Enterprise support terms |

## myclinicsoft: Stakeholders outside DevCom Digital

Influence ratings in this table are provisional drafting estimates [TO CONFIRM: influence ratings].

| Stakeholder (role or organisation) | Interest | Influence | What they need from the project |
|---|---|---|---|
| Clinic owners and administrators (buyers) | One system for the clinic; price; data safety | High | Reliable service, notice of changes, support |
| Clinic staff (Doctor, Nurse, Medical technologist, Receptionist, Accountant) | Fast, low-error daily work | Medium | Working modules, help for changes such as self-registered records |
| Patients and family managers (eMCR) | Access to their own records, booking, reminders | Medium | Clear activation rules, privacy, reliable codes and reminders |
| Medical representatives (MyClinicSoft Rep) | Booking clinic visits, visit log | Low | Release of the app, a way to pay on the web |
| National Privacy Commission (NPC) | Data Privacy Act compliance | High | Registration if required; breach notice where required |
| BIR | Sales invoices under RA 11976 and RR 7-2024 (lib/bir.ts) | High | Correct sales invoices |
| PhilHealth and HMOs | Claims from clinics (integrations page) | Low | Correct claim data |
| Sub-processors and suppliers (Vercel, MongoDB Atlas, Cloudinary, Twilio, Resend, Anthropic, Jitsi, PayMongo, Xendit, Maya Business, Expo, Sentry, Upstash, Cloudflare) | Service use under their terms | Medium | Correct configuration; sender registration for Twilio |
| Google Play and Apple App Store | App review and payment rules | High | Apps that sell nothing; privacy disclosures |

## myclinicsoft: Who decides what

The material states few decision rights. Where it is silent, the cell says [TO CONFIRM].

| Decision | Decides | Consulted |
|---|---|---|
| Project scope, priorities and deadline | [TO CONFIRM: decision maker] | [TO CONFIRM] |
| Open owner decisions: NPC registration, named Data Protection Officer, Enterprise support terms, eMCR fee disclosure, encryption at rest (docs/PUBLIC_SITE_FOLLOWUPS.md) | Owner [TO CONFIRM: owner role title] | Data Protection Officer, platform admin [TO CONFIRM] |
| Plan prices, yearly months, voucher and rep fees (Platform → Configuration) | Platform admin (lib/platform-config.ts) [TO CONFIRM: who approves a price change] | [TO CONFIRM] |
| Discounts and contract terms | See "Pricing and Discount Rules" and "Standard Contract Terms Summary" | |
| Whether an adult's record may be added to someone else's eMCR account | The clinic ("the clinic must approve", MOBILE_API.md) | |
| Whether a rep visit request is approved | The clinic (MOBILE_API.md) | |
| Patient requests to access, correct or delete clinic records | The clinic, as personal information controller; DevCom Digital helps (privacy page) | Data Protection Officer |
| Which automations also send push notifications | "a product decision" for each one (MOBILE_ROADMAP.md) [TO CONFIRM: decision maker] | |
| Whether a breach must be reported to the NPC | [TO CONFIRM: decision maker] | Data Protection Officer |
| Releasing an app build to the store | [TO CONFIRM: decision maker] | Mobile team |

## myclinicsoft: Regular updates

Only the customer notices below are stated in the material. Internal project updates are not described: [TO CONFIRM: internal status updates, audience, frequency and channel].

| Update | Audience | Frequency | Channel | Prepared by |
|---|---|---|---|---|
| Internal project status | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |
| eMCR release notes and Google Play "What's new" (under 500 characters) | Patients; support team | Each store release | Google Play listing; mobile/RELEASE_NOTES.md | Mobile team [TO CONFIRM] |
| Price change notice | Clinics | At least 30 days before a change; applies from the next billing period (terms page) | [TO CONFIRM: channel] | [TO CONFIRM] |
| Notice of material changes to the Terms of Service | Clinic administrators | At least 15 days before they take effect (terms page); an email to all clinic admins still needs building (docs/PUBLIC_SITE_FOLLOWUPS.md) | Email [TO CONFIRM] | [TO CONFIRM] |
| Free trial expiry warnings | Clinic administrators | 3 days and 1 day before the trial ends | Email and in-app notification (lib/automations/trial-expiration.ts) | System |
| eMCR renewal reminders | Patients | 30 days and 7 days before expiry, and on the day it ends | Push and SMS | System |
| Support request replies | Requester | Each reply | In the app and by email (support page) | Platform admin |
| Notice that promotional texts need consent | Clinics | Once, before SMS rules are enforced (docs/SMS_TWILIO.md) | [TO CONFIRM: channel] | [TO CONFIRM] |
| Notice that self-registered records cannot be claimed until staff save them | Clinics | Once (docs/PUBLIC_SITE_FOLLOWUPS.md, "Tell clinics") | Staff help docs | [TO CONFIRM] |

## myclinicsoft: Escalation

The material sets only a few escalation times. All times are Asia/Manila.

| Issue | Goes to | How fast | Source |
|---|---|---|---|
| Suspected personal data breach | Data Protection Officer [TO CONFIRM: escalation path]; the NPC where required | NPC notice within 72 hours of discovery [TO CONFIRM: breach notice wording (contradiction 31)]; affected patients "may also need to be told" | docs/BACKUP_RESTORE.md; privacy page |
| Production database damaged or records lost | [TO CONFIRM: role]; scheduled jobs paused and the app put in maintenance first | [TO CONFIRM: target time] | docs/BACKUP_RESTORE.md |
| Security report from outside | support@myclinicsoft.solutions, subject "Security report" | [TO CONFIRM: response time] | security page |
| Phone codes not arriving after SMS go-live | [TO CONFIRM: role]; roll back to the local sender | [TO CONFIRM: response time] | docs/SMS_TWILIO.md |
| Clinic support request | Platform admin through the in-app support request system | During support hours; response times [TO CONFIRM] | support page; components/PublicPage.tsx |
| Enterprise support issue | As agreed in the clinic's contract | As agreed in the contract | pricing page; support page |

Procedures are in "Responding to a Suspected Data Breach", "Restoring the Database After an Incident" and "Handling a Clinic Support Request".

## myclinicsoft: Customer and partner contact rules

The material states these contact rules for the myclinicsoft project:

| Who is contacted | Channel | Rule | Source |
|---|---|---|---|
| Clinic administrators | In-app support requests (Admin → Support) and email | Replies come in the app and by email. Other staff ask their clinic administrator. | support page |
| Anyone with a question | support@myclinicsoft.solutions or the contact form | Replies during support hours, in the order messages arrive | contact page |
| Legal matters | legal@myclinicsoft.solutions | | terms page |
| Privacy and data subject requests | privacy@myclinicsoft.solutions (Data Protection Officer) | Patients contact the clinic first for clinic records | privacy page |
| Patients | Through their clinic, eMCR push and SMS | DevCom Digital does not hold the clinic's patient records as controller; the clinic does | privacy page |
| Patients asking for eMCR access | Sign-in instructions go to the contact on the clinic's record, never to the one typed | | MOBILE_API.md |
| Medical representatives | MyClinicSoft Rep support screen; billing support request for a payment link | The app never sells | rep/README.md |
| Phone | None published | | contact page |

Support hours are in the Company Overview, provisionally in Asia/Manila time [TO CONFIRM: support hours time zone]. Who at DevCom Digital may contact customers and partners directly is not stated: [TO CONFIRM: who may contact customers and suppliers]. Further rules are in "Communication and Conduct Standards".

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | myclinicsoft: Project Brief; myclinicsoft: Decision Log; myclinicsoft: Risks, Assumptions and Constraints; Company Overview; Teams and Responsibilities; Communication and Conduct Standards; Customer Support Playbook; Responding to a Suspected Data Breach; Restoring the Database After an Incident; Handling a Clinic Support Request |

## Open questions

1. [TO CONFIRM: project scope] Whole MyClinicSoft platform, or a narrower piece of work?
2. [TO CONFIRM: influence ratings] Influence ratings are drafting estimates.
3. [TO CONFIRM: owner role title] Who is the "owner" behind the owner decisions in docs/PUBLIC_SITE_FOLLOWUPS.md?
4. [TO CONFIRM: sales role] Who handles "Talk to sales"?
5. [TO CONFIRM: decision maker] for project scope, priorities and deadline; for push decisions per automation; for NPC breach reports; for store releases. Who is consulted on each.
6. [TO CONFIRM: who approves a price change] Platform admins can change prices; the material does not say who approves.
7. [TO CONFIRM: internal status updates, audience, frequency and channel] and the channel and preparer for price-change notices, term-change notices, the promotional-consent notice and the self-registered-records notice.
8. [TO CONFIRM: escalation path], target times and response times for breaches, database incidents, security reports, SMS failures and support requests.
9. [TO CONFIRM: support hours time zone] Assumed Asia/Manila.
10. [TO CONFIRM: who may contact customers and suppliers] directly.
11. [TO CONFIRM: owner role, effective date, review date] for this document.
12. Contradictory: components/TenantNotFound.tsx links a support address on a different domain from every other file (contradiction 23).
13. Contradictory: lib/subscription-packages.ts gives Professional phone and chat support and Enterprise "24/7"; the pricing page promises "Priority email support" and contract terms for Enterprise, and docs/PUBLIC_SITE_FOLLOWUPS.md says those claims were removed (contradiction 6).
14. Out of date: PRODUCT.md and DESIGN.md still describe patient and medical representative web portals; MOBILE_API.md says they were removed (contradiction 15).
15. Contradictory: the Privacy Policy lists an unnamed "Email delivery provider" and omits Upstash, Cloudflare Turnstile, Vercel Blob and NLM RxNav, which .env.example configures (contradiction 33). The supplier row above follows the configured list.
16. [TO CONFIRM: breach notice wording] docs/BACKUP_RESTORE.md: the NPC "must be notified within 72 hours of discovery"; app/(public)/privacy/page.tsx: "within the periods set by its rules" (contradiction 31).
