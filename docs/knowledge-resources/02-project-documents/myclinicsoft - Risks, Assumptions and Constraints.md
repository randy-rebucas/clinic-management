# myclinicsoft: Risks, Assumptions and Constraints

## myclinicsoft: Summary

myclinicsoft: Risks, Assumptions and Constraints lists the known risks, the working assumptions and the fixed constraints of the myclinicsoft project (provisionally the MyClinicSoft web platform, the eMCR (Electronic MyClinic Record) patient app, the MyClinicSoft Rep app and the go-live work [TO CONFIRM: project scope]). It is for the people who plan, build and approve the work. Every risk, assumption and constraint names its source file; the main sources are MOBILE_ROADMAP.md, docs/PUBLIC_SITE_FOLLOWUPS.md, docs/SMS_TWILIO.md, docs/BACKUP_RESTORE.md and PRODUCT.md. The most important open risks are that production backups may not meet the documented policy, that several legal-page promises still need tooling, and that SMS, bot-check and rate-limit settings must be complete before go-live. Likelihood and impact ratings are provisional drafting estimates, and no risk has a named owner yet [TO CONFIRM: ratings and owner roles].

## myclinicsoft: Risks from the mobile roadmap (architecture)

The architecture risks below come from the risks table in MOBILE_ROADMAP.md (2026-09-21). Owner roles are [TO CONFIRM: owner role] for every row.

| ID | Risk | Likelihood | Impact | Mitigation | Owner role | Trigger that means it is happening |
|---|---|---|---|---|---|---|
| RK1 | Mobile sign-in built as a bolt-on that diverges from the web session logic, creating "two sources of truth" | Low | High | One token payload schema with a type per surface; reuse the web signing code. MOBILE_API.md now documents one token model for both apps | [TO CONFIRM] | A sign-in rule changed in one place but not the other |
| RK2 | A CSRF or security gap in the request proxy ships to production with the new mobile endpoints | Low | High | Phase 0 as a hard gate; MOBILE_ROADMAP.md marks phase 0 done and says the proxy's CSRF and cron checks "are active" | [TO CONFIRM] | A request that should be refused by the proxy is accepted |
| RK3 | Offline sync conflicts, e.g. a patient cancels offline while staff reschedule | Medium | Medium | Offline scope kept to read-only caching; no offline writes | [TO CONFIRM] | A proposal to allow changes while offline |
| RK4 | Push built twice (web push and mobile push) and drifting apart | Medium | Medium | One notification-dispatch layer with pluggable channels | [TO CONFIRM] | New push code added outside the shared layer |

## myclinicsoft: Risks from the mobile roadmap (privacy, stores and scope)

The privacy, store and scope risks below also come from the risks table in MOBILE_ROADMAP.md (2026-09-21). Owner roles are [TO CONFIRM: owner role] for every row.

| ID | Risk | Likelihood | Impact | Mitigation | Owner role | Trigger that means it is happening |
|---|---|---|---|---|---|---|
| RK5 | Data Privacy Act gap on phones: device loss, health information cached on the phone | Medium | High | Secure storage only, no health information in plain storage, short-lived signed document links, remote sign-out through the device registry | [TO CONFIRM] | A lost-phone report, or health data found in plain app storage |
| RK6 | Store review delays; "Apple in particular scrutinizes health apps" | Medium | Medium | Allow generous time for review; prepare privacy labels and data-handling disclosures early | [TO CONFIRM] | A rejection, or a review longer than [TO CONFIRM: acceptable review time] |
| RK7 | Scope creep: admin, billing or inventory features pulled into the mobile apps | Medium | Medium | Explicit non-goals; a staff app is a separate, narrower decision | [TO CONFIRM] | A request to add an admin feature to eMCR |

## myclinicsoft: Risks from backups and owner decisions

The backup and owner-decision risks below come from docs/BACKUP_RESTORE.md, lib/backups.ts and the owner decisions in docs/PUBLIC_SITE_FOLLOWUPS.md. Owner roles are [TO CONFIRM: owner role] for every row.

| ID | Risk | Likelihood | Impact | Mitigation | Owner role | Trigger that means it is happening |
|---|---|---|---|---|---|---|
| RK8 | Production database backups do not meet the documented policy: Atlas Cloud Backup needs an M10 or larger cluster, and lib/backups.ts refers to "the free tier's 512 MB" | High | High | Move to a cluster that supports Cloud Backup, turn it on, run the restore drill (see "Running the Backup Restore Drill") | [TO CONFIRM] | No Cloud Backup snapshots listed in Atlas |
| RK9 | DevCom Digital is not registered with the NPC although registration is "likely required once processing sensitive data of 1,000+ people" | [TO CONFIRM] | High | Owner decides; add the registration to the privacy and security pages | [TO CONFIRM] | Sensitive data held on 1,000 or more people without a registration |
| RK10 | No named Data Protection Officer behind the privacy mailbox | Medium | Medium | Owner designates a person and decides whether to publish the name | [TO CONFIRM] | A privacy request with no one assigned |
| RK11 | Enterprise support terms are undefined | Medium | Medium | Owner decides real hours and response times before publishing any | [TO CONFIRM] | An Enterprise contract that needs support terms |

## myclinicsoft: Risks from legal-page promises and public claims

The legal-page and public-claim risks below come from the open items in docs/PUBLIC_SITE_FOLLOWUPS.md. Owner roles are [TO CONFIRM: owner role] for every row.

| ID | Risk | Likelihood | Impact | Mitigation | Owner role | Trigger that means it is happening |
|---|---|---|---|---|---|---|
| RK12 | eMCR activation is enforced before the fee is disclosed on the home, features, FAQ, about and compare pages | Medium | High | Disclose the yearly fee first (see "Products and Services Catalogue") | [TO CONFIRM] | Enforcement switched on while any of those pages still presents eMCR as included |
| RK13 | "Encrypted at rest" is claimed on the security page and FAQ without confirmation | Medium | High | Confirm encryption at rest on the production cluster, or remove the claim | [TO CONFIRM] | The claim is still published and not confirmed |
| RK14 | Legal-page promises without tooling: deleting a closed clinic's data within 30 days, and emailing 15 days' notice of term changes | Medium | High | Document or build the clinic data deletion; build an email to all clinic administrators | [TO CONFIRM] | A written deletion request or a term change arrives |

## myclinicsoft: Risks from go-live configuration

The go-live configuration risks below come from consequences stated in docs/SMS_TWILIO.md and docs/PUBLIC_SITE_FOLLOWUPS.md. Owner roles are [TO CONFIRM: owner role] for every row.

| ID | Risk | Likelihood | Impact | Mitigation | Owner role | Trigger that means it is happening |
|---|---|---|---|---|---|---|
| RK15 | Monthly SMS usage is not capped because a database index is missing in production | Medium | High | Create the missing indexes before deploying (see "Going Live with SMS and Phone Codes") [TO CONFIRM: whether indexes are built before or after deploying (contradiction 61)] | [TO CONFIRM] | The index check reports missing indexes |
| RK16 | Phone-code sign-in fails after go-live (codes not arriving on some networks) | Medium | High | Test on Globe, Smart and DITO handsets; roll back to the local sender if codes do not arrive | [TO CONFIRM] | Code sign-in failures reported after deploy |
| RK17 | SMS quotas are set from placeholder numbers, not the confirmed Philippine rate | High | Medium | Set quotas from the confirmed rate | [TO CONFIRM] | Quotas unchanged after go-live |
| RK18 | Cloudflare Turnstile half-configured: "With only the secret set, every public booking and registration is refused" | Low | High | Set both keys together | [TO CONFIRM] | Public booking refuses every request |
| RK19 | Upstash Redis missing in production, so rate limits are per server instance | Medium | Medium | Configure Upstash Redis in production | [TO CONFIRM] | Rate limits not shared across instances |
| RK20 | PayMongo not configured in production, so plans cannot be paid online | Low | High | Keep PayMongo always on in production | [TO CONFIRM] | A clinic cannot pay for a plan online |

## myclinicsoft: Assumptions

The myclinicsoft assumptions below are believed true but not yet checked; each names its source and how it will be checked.

| ID | Assumption | How we will check it | By when |
|---|---|---|---|
| A1 | Patient-app general availability takes "roughly 4–5 months with one focused mobile team plus backend support, assuming Phase 0 lands first" (MOBILE_ROADMAP.md) | Compare with actual progress and staffing | [TO CONFIRM] |
| A2 | The production database runs on the MongoDB Atlas free tier (inferred from lib/backups.ts) | Check the cluster tier in Atlas | [TO CONFIRM] |
| A3 | Encryption at rest is on for the production database (security page; README.md) | Check in Atlas, as docs/PUBLIC_SITE_FOLLOWUPS.md asks | Before the claim stays published [TO CONFIRM: date] |
| A4 | Twilio Verify behaves as the code expects: whether a resend extends the 10-minute expiry, a wrong code returns status "pending", and how Verify binds to the registered sender (docs/SMS_TWILIO.md) | Test with real Twilio traffic; ask Twilio during sender registration | During SMS go-live [TO CONFIRM: date] |
| A5 | Expo's push service covers both Android and iOS (MOBILE_ROADMAP.md: it "abstracts both") | Test push on an iOS build | Before the iOS release [TO CONFIRM: date] |
| A6 | Live prices and fees match the defaults in code (lib/platform-config.ts lets a platform admin change them) | Check Platform → Configuration | [TO CONFIRM] |
| A7 | Support hours are in Asia/Manila time (components/PublicPage.tsx gives no time zone) | Owner confirms | [TO CONFIRM] |

## myclinicsoft: Legal and brand constraints

The legal and brand constraints below are fixed limits on the myclinicsoft project, each with its source.

| Constraint | Source | Consequence if broken |
|---|---|---|
| The Data Privacy Act of 2012 (RA 10173) is "a hard constraint on data handling" | PRODUCT.md; privacy page | The product breaks its core positioning; patients may complain to the NPC (privacy page) |
| Role-based access and audit logging are compulsory, "not optional" | PRODUCT.md | The compliance requirement is not met |
| A personal data breach is notified to the NPC within 72 hours of discovery where required [TO CONFIRM: breach notice wording (contradiction 31)] | docs/BACKUP_RESTORE.md; privacy page | [TO CONFIRM: legal consequence of late notice] |
| Sales invoices follow RA 11976 and RR 7-2024 | lib/bir.ts | Invoices to clinics do not meet BIR rules |
| The mobile apps never sell anything | rep/README.md; MOBILE_API.md | The apps break App Store and Google Play payment rules |
| The brand identity "is fixed and binding" | PRODUCT.md | The product departs from its fixed identity |
| No fabricated testimonials, case studies or uptime figures; no "DPA compliant", 24/7, phone or chat support claims | PRODUCT.md; docs/PUBLIC_SITE_FOLLOWUPS.md | Public claims the service cannot back |
| At least 30 days' notice of price changes; at least 15 days' notice of material term changes; closed clinic data deleted within 30 days of a written request | terms page; privacy page | DevCom Digital breaks its own Terms of Service |

## myclinicsoft: Technical and operational constraints

The technical and operational constraints below are fixed limits on how the myclinicsoft project is built and run, each with its source.

| Constraint | Source | Consequence if broken |
|---|---|---|
| Hosting on Vercel needs the Pro plan or higher | README.md | The Hobby plan rejects scheduled jobs that run every 5 to 30 minutes |
| Scheduled jobs are set in UTC, chosen for clinic hours in Asia/Manila | README.md | Reminders and jobs run at the wrong local time |
| Atlas Cloud Backup needs an M10 or larger cluster | docs/BACKUP_RESTORE.md | Only basic snapshots exist |
| Never restore straight over production as a first step | docs/BACKUP_RESTORE.md | A bad restore can damage live data |
| The backend is deployed before each eMCR store build | mobile/RELEASE_NOTES.md | The app works, but new server behaviour (e.g. family-manager sign-out) is missing |
| eMCR has no over-the-air updates; changes reach phones only through store builds | mobile/RELEASE_NOTES.md | Fixes wait for store review |
| Promotional texts need consent | docs/SMS_TWILIO.md | Texts are blocked once the SMS rules are enforced |
| No real-time channel on Vercel; data refreshes by polling | MOBILE_ROADMAP.md | A feature that assumes live sockets will not work |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | myclinicsoft: Project Brief; myclinicsoft: Requirements and Acceptance Criteria; myclinicsoft: Decision Log; Data Handling and Confidentiality; Systems Overview; Going Live with SMS and Phone Codes; Running the Backup Restore Drill; Responding to a Suspected Data Breach; Deleting a Closed Clinic's Data |

## Open questions

1. [TO CONFIRM: project scope] Whole MyClinicSoft platform, or a narrower piece of work?
2. [TO CONFIRM: ratings and owner roles] Likelihood and impact are drafting estimates; every risk RK1 to RK20 needs an owner role.
3. [TO CONFIRM: acceptable review time] for store review (RK6).
4. [TO CONFIRM] likelihood of RK9: how many people's sensitive data MyClinicSoft holds today.
5. [TO CONFIRM] by-when dates for assumptions A1 to A7, including the SMS go-live date and iOS release date.
6. [TO CONFIRM: legal consequence of late notice] to the NPC.
7. [TO CONFIRM: owner role, effective date, review date] for this document.
8. Contradictory: the security page and README.md say the database "is encrypted at rest"; docs/PUBLIC_SITE_FOLLOWUPS.md asks to "Confirm MongoDB Atlas encryption at rest is on" (contradiction 29).
9. Contradictory: the privacy and terms pages promise regular backups and README.md says "Backups use MongoDB Atlas Cloud Backup"; docs/BACKUP_RESTORE.md says Cloud Backup needs an M10 or larger cluster and lib/backups.ts refers to the free tier (contradiction 30).
10. Contradictory: docs/PUBLIC_SITE_FOLLOWUPS.md says "No tenant purge exists"; scripts/delete-tenant.ts deletes a clinic's data from the command line (contradiction 34). RK14 may be partly mitigated.
11. Out of date: MOBILE_ROADMAP.md describes "long-lived (30-day) Bearer tokens" with "No refresh-token rotation"; MOBILE_API.md gives 7-day access tokens and 60-day rotating refresh tokens (contradiction 26). RK1 uses MOBILE_API.md.
12. Contradictory: AUDIT.md says the request proxy is "not running" and must be renamed; MOBILE_ROADMAP.md and README.md say it is the correct convention and active (contradiction 37). RK2 follows MOBILE_ROADMAP.md.
13. Contradictory: README.md says Sentry is "Integrated … for error monitoring and alerting"; README.md and .env.example also say it "stays completely inactive until a DSN is set" (contradiction 39).
14. Suggested, not confirmed: eMCR and MyClinicSoft Rep copy the same shared code "on purpose (no shared package yet)" (rep/README.md), so a security fix made in one app may be missed in the other.
15. Suggested, not confirmed: the roadmap relies on "one focused mobile team", which may mean key-person dependence.
16. Suggested, not confirmed: clinic in-app backups share the free tier's 512 MB database (lib/backups.ts), so storage may run out as clinics grow.
17. Suggested, not confirmed: MyClinicSoft Rep's store set-up has not been done ("`eas init` has not been run", rep/README.md), which may delay its release.
18. Suggested, not confirmed: SMS sender approval by Twilio and the networks may take time; several go-live steps wait "Once the sender is approved" (docs/SMS_TWILIO.md).
19. Suggested, not confirmed: differences between the public site and the code on plan changes, support levels, locations and refunds (contradictions 1, 5, 6, 11) may lead to customer disputes.
20. Suggested, not confirmed: errors in production may go unnoticed if Sentry is not configured (contradiction 39).
21. Suggested, not confirmed: the features and about pages use stock photos captioned as clinic teams (docs/PUBLIC_SITE_FOLLOWUPS.md), which may read as a misleading claim.
22. [TO CONFIRM: breach notice wording] docs/BACKUP_RESTORE.md: the NPC "must be notified within 72 hours of discovery"; app/(public)/privacy/page.tsx: "within the periods set by its rules" (contradiction 31).
23. [TO CONFIRM: whether indexes are built before or after deploying] docs/SMS_TWILIO.md: "Before deploying this code"; scripts/sync-indexes.ts: "run this after deploying a change that adds or removes an index"; docs/BACKUP_RESTORE.md: "After deploying" (contradiction 61). RK15 follows docs/SMS_TWILIO.md.
