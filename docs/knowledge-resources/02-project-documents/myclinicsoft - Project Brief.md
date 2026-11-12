# myclinicsoft: Project Brief

## myclinicsoft: Summary

The myclinicsoft project is DevCom Digital's work on MyClinicSoft, an integrated clinic management platform for clinics and medical practices in the Philippines. Its goal is to cover "the full operational loop of a healthcare practice — patient registration through billing" in one system, so clinic staff spend less time on administrative work. The main deliverables are the MyClinicSoft web platform (already in production), the eMCR (Electronic MyClinic Record) patient app for Android, the MyClinicSoft Rep app for medical representatives, and the go-live work that is still open (SMS, backups and public-site follow-ups). No project deadline is stated in the material: [TO CONFIRM: project deadline]. This brief provisionally treats the project as the MyClinicSoft platform as a whole: [TO CONFIRM: project scope].

## myclinicsoft: Background and business problem

The myclinicsoft project exists because "clinic workflows often span separate systems and manual processes" (COMPANY_PROFILE.md). That makes it harder for clinic staff to coordinate appointments, keep records current, manage patient flow, complete documentation and keep operational information in sync.

MyClinicSoft brings these workflows into one shared platform and manages the patient journey from registration and booking through visits, prescriptions, results and billing. PRODUCT.md positions the product as "purpose-built for Philippine healthcare compliance", with compliance and audit logging built in from the start, plus specialised modules (medical representative visits, queue management) that general practice-management software does not cover.

The mobile part of the project started from a roadmap prepared on 2026-09-21 (MOBILE_ROADMAP.md). It recommended keeping the web app for clinic staff and building a patient app first. On 2026-10-18 the patient and medical representative web portals were removed, so patients and medical representatives now use the mobile apps only.

Why the work is happening now is not stated in the material: [TO CONFIRM: why now].

## myclinicsoft: Goal and success measures

The goal of the myclinicsoft project, in the words of PRODUCT.md: "An integrated clinic management platform covering the full operational loop of a healthcare practice — patient registration through billing — so staff spend less time on administrative overhead and more on patient care."

PRODUCT.md defines success qualitatively: "Success means clinics run day-to-day operations (scheduling, clinical documentation, billing, inventory) from one system instead of several disconnected tools."

| Success measure | Target | Source |
|---|---|---|
| Clinics run scheduling, clinical documentation, billing and inventory in MyClinicSoft instead of several tools | [TO CONFIRM: measurable target, e.g. number of active clinics] | PRODUCT.md |
| Free trial clinics that become paying clinics | [TO CONFIRM: target conversion rate] | none |
| eMCR activations by patients | [TO CONFIRM: target number of activations] | none |
| Patient app reaches general availability (GA) | [TO CONFIRM: GA date and definition] | MOBILE_ROADMAP.md |

The material contains no numeric targets. Every target above needs the owner's answer.

## myclinicsoft: Scope included

The myclinicsoft project provisionally includes the following work [TO CONFIRM: project scope]:

| Area | What is included | Source |
|---|---|---|
| MyClinicSoft web platform | Patients, staff, appointments and online booking, queue, visits, prescriptions, lab results, referrals, billing with PhilHealth and HMO claims, inventory, reports, audit logs | COMPANY_PROFILE.md; README.md |
| eMCR patient app | Android app for patients of participating clinics: appointments, queue, results, prescriptions, invoices, family access, activation vouchers | MOBILE_API.md; mobile/RELEASE_NOTES.md |
| MyClinicSoft Rep app | App for medical representatives: visit log, products, clinic booking, teams and plan status | rep/README.md |
| MyClinicSoft public API (`/api/v1`) | REST API and webhooks that let clinics connect their own systems | PUBLIC_API.md |
| Go-live work | SMS and phone codes through Twilio, production backups and restore drill, public-site follow-ups (owner decisions, configuration, promises that need tooling) | docs/SMS_TWILIO.md; docs/BACKUP_RESTORE.md; docs/PUBLIC_SITE_FOLLOWUPS.md |

Plan contents, prices and limits are in "Products and Services Catalogue".

## myclinicsoft: Scope excluded

The myclinicsoft project excludes the following, as stated in the material:

| Excluded item | Reason or note | Source |
|---|---|---|
| Web portals for patients and medical representatives | Removed (see "myclinicsoft: Timeline and milestones"); patients and medical representatives use the mobile apps only | MOBILE_ROADMAP.md; MOBILE_API.md |
| A full staff mobile app | "Do not attempt to port the full admin surface (billing, inventory, reports, tenant settings) to mobile"; a narrow staff quick-access app is optional and later (phase 8) | MOBILE_ROADMAP.md |
| Insurance flows in the patient app | The insurance verification automation is a stub, so there is nothing to build against | MOBILE_ROADMAP.md |
| Managing several clinic locations from one account | "on our roadmap"; see Open questions (contradiction 5) | app/(public)/faq/page.tsx |
| Selling anything inside the mobile apps | App store payment rules; see "myclinicsoft: Decision Log" | rep/README.md; MOBILE_API.md |

MOBILE_ROADMAP.md also excluded booking new appointments from the patient-app MVP, but eMCR 1.0.0 already offers booking (contradiction 24), so that exclusion is out of date.

## myclinicsoft: Deliverables

| Deliverable | Description | Due date | Owner role |
|---|---|---|---|
| MyClinicSoft web platform | Clinic web platform, public site and APIs, in production on Vercel (README.md) | In production | [TO CONFIRM: owner role] |
| eMCR 1.1.4 for Android | Patient app release with fixes from the 2026-11-08 audit; needs the backend deployed first (mobile/RELEASE_NOTES.md) | [TO CONFIRM: release date] | [TO CONFIRM: owner role] |
| eMCR for iOS | "The iOS version is coming soon" (app/(public)/faq/page.tsx) | [TO CONFIRM: iOS release date] | [TO CONFIRM: owner role] |
| MyClinicSoft Rep 0.1.0 | All four build phases done; not yet released; store set-up not yet done (rep/README.md) | [TO CONFIRM: release date] | [TO CONFIRM: owner role] |
| SMS and phone codes go-live | Twilio texts and Verify codes, in the order set out in "Going Live with SMS and Phone Codes" | [TO CONFIRM: SMS go-live date] | [TO CONFIRM: owner role] |
| Production backups | Atlas Cloud Backup turned on and a first restore drill run (docs/BACKUP_RESTORE.md) | [TO CONFIRM: date] | [TO CONFIRM: owner role] |
| Public-site follow-ups | Open owner decisions, configuration items and legal-page promises in docs/PUBLIC_SITE_FOLLOWUPS.md | [TO CONFIRM: date] | [TO CONFIRM: owner role] |

## myclinicsoft: Timeline and milestones

All dates are in Asia/Manila unless marked otherwise.

| Date | Milestone | Status | Source |
|---|---|---|---|
| 2026-09-21 | Mobile roadmap prepared; phase 0 hardening marked done | Done | MOBILE_ROADMAP.md |
| 2026-10-18 | Patient and medical representative web portals removed | Done | MOBILE_ROADMAP.md; MOBILE_API.md |
| 2026-10-22 | Public-site audit; Terms of Service and Privacy Policy updated | Done | docs/PUBLIC_SITE_FOLLOWUPS.md; terms and privacy pages |
| 2026-11-08 | eMCR audit; fixes included in eMCR 1.1.4 | Done (release date [TO CONFIRM]) | mobile/RELEASE_NOTES.md |
| [TO CONFIRM] | SMS and phone codes live | Not yet live | docs/SMS_TWILIO.md |
| [TO CONFIRM] | eMCR activation enforcement switched on | Open; the eMCR fee must be disclosed first | MOBILE_API.md; docs/PUBLIC_SITE_FOLLOWUPS.md |
| [TO CONFIRM] | MyClinicSoft Rep released | Built, not released | rep/README.md |
| [TO CONFIRM] | eMCR for iOS released | "Coming soon" | faq page |
| [TO CONFIRM] | Patient-app general availability | The roadmap estimated "roughly 4–5 months" from its 2026-09-21 basis | MOBILE_ROADMAP.md |

## myclinicsoft: Budget and cost limits

The material states no budget or cost limit for the myclinicsoft project: [TO CONFIRM: project budget and cost limits].

The material does name infrastructure requirements that carry a cost:

| Requirement | Why | Source |
|---|---|---|
| Vercel Pro plan or higher | Several scheduled jobs run every 5 to 30 minutes, which the Hobby plan rejects | README.md |
| MongoDB Atlas M10 cluster or larger | Needed for Atlas Cloud Backup; shared and free tiers only get basic snapshots | docs/BACKUP_RESTORE.md |
| SMS quotas per plan | Quotas must be set from "the confirmed Philippine rate"; current numbers are placeholders | docs/SMS_TWILIO.md |

The cost of each item is not in the material: [TO CONFIRM: monthly infrastructure costs].

## myclinicsoft: Teams and roles involved

The material names roles, not company departments. Role titles for support, sales, finance and engineering are not stated.

| Role | Part in the myclinicsoft project | Source |
|---|---|---|
| Owner | Makes the open owner decisions (NPC registration, named Data Protection Officer, Enterprise support terms, eMCR fee disclosure, encryption at rest) | docs/PUBLIC_SITE_FOLLOWUPS.md. [TO CONFIRM: owner role title] |
| Platform admin | Runs MyClinicSoft itself, answers support requests, sets prices and configuration | lib/platform-auth.ts; lib/support.ts; lib/platform-config.ts |
| Data Protection Officer | Privacy contact; no person named | privacy page |
| Support team | Answers support requests | faq page |
| Mobile team plus backend support | The roadmap's planning assumption: "one focused mobile team plus backend support" | MOBILE_ROADMAP.md. [TO CONFIRM: who is on the team] |
| Clinic roles (Administrator, Doctor, Nurse, Medical technologist, Receptionist, Accountant) | Users of the web platform | lib/roles.ts |
| Patients, family managers, medical representatives | Users of eMCR and MyClinicSoft Rep | MOBILE_API.md |

Company teams are described in "Teams and Responsibilities". Stakeholders are in "myclinicsoft: Stakeholders and Communication Plan".

## myclinicsoft: Constraints

The main constraints on the myclinicsoft project are listed below. Each one, with its source and the consequence if broken, is in "myclinicsoft: Risks, Assumptions and Constraints".

- The Data Privacy Act of 2012 (RA 10173) is "a hard constraint on data handling" (PRODUCT.md).
- Role-based access and audit logging are compulsory, "not optional" (PRODUCT.md).
- Sales invoices follow BIR rules under RA 11976 and RR 7-2024 (lib/bir.ts).
- The mobile apps never sell anything, because of App Store and Google Play payment rules (rep/README.md; MOBILE_API.md).
- The brand identity "is fixed and binding" (PRODUCT.md).
- No fabricated testimonials, case studies, uptime figures or unbacked claims (PRODUCT.md; docs/PUBLIC_SITE_FOLLOWUPS.md).

## myclinicsoft: Related documents

| Document | What it adds |
|---|---|
| myclinicsoft: Requirements and Acceptance Criteria | Numbered requirements and checks |
| myclinicsoft: Stakeholders and Communication Plan | Who is involved, who decides, how updates flow |
| myclinicsoft: Decision Log | Decisions already made, with dates |
| myclinicsoft: Risks, Assumptions and Constraints | Risk register, assumptions, constraints |
| Company Overview | DevCom Digital and MyClinicSoft in brief |
| Products and Services Catalogue | Plans, prices and limits |
| Systems Overview | Hosting, database and suppliers |
| Going Live with SMS and Phone Codes | SMS go-live steps |
| Running the Backup Restore Drill | Restore drill steps |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | myclinicsoft: Requirements and Acceptance Criteria; myclinicsoft: Stakeholders and Communication Plan; myclinicsoft: Decision Log; myclinicsoft: Risks, Assumptions and Constraints; Company Overview; Products and Services Catalogue; Systems Overview; Going Live with SMS and Phone Codes; Running the Backup Restore Drill |

## Open questions

1. [TO CONFIRM: project scope] Is the myclinicsoft project the MyClinicSoft platform as a whole (web platform, eMCR, MyClinicSoft Rep, go-live work), or a narrower piece of work such as the eMCR mobile rollout? This brief assumes the whole platform.
2. [TO CONFIRM: project deadline] No overall deadline is stated.
3. [TO CONFIRM: why now] The material does not say why the work is happening now.
4. [TO CONFIRM: measurable targets] Success measures have no numbers: number of active clinics, trial-to-paid conversion, eMCR activations, and the definition and date of patient-app general availability.
5. [TO CONFIRM: owner role and due date] for each deliverable: web platform, eMCR 1.1.4, eMCR for iOS, MyClinicSoft Rep 0.1.0, SMS go-live, production backups, public-site follow-ups.
6. [TO CONFIRM: release dates] eMCR 1.1.4 release date, iOS release date, MyClinicSoft Rep release date, SMS go-live date, date for switching on eMCR activation enforcement.
7. [TO CONFIRM: project budget, cost limits and monthly infrastructure costs].
8. [TO CONFIRM: owner role title] for the "owner decisions" in docs/PUBLIC_SITE_FOLLOWUPS.md, and who is on the "one focused mobile team plus backend support".
9. [TO CONFIRM: effective date, review date and document owner role] for this brief.
10. Out of date: MOBILE_ROADMAP.md says "Deliberately excluded from MVP: booking new appointments", but mobile/RELEASE_NOTES.md 1.0.0 lists "Book, view and cancel appointments" (contradiction 24).
11. Out of date: PRODUCT.md lists "Patients — self-service portal" and "Medical representatives — dedicated pharma sales portal", while MOBILE_API.md says those web portals "have been removed" (contradiction 15).
12. Contradictory: app/(public)/faq/page.tsx says managing several locations from one account "is on our roadmap", while lib/subscription-packages.ts gives Professional up to 3 locations (contradiction 5).
13. Contradictory: the home page says "Rep app: coming soon" and the registration page says rep registration "is paused while we build it", while rep/README.md marks all four build phases done (contradiction 17).
14. Contradictory: PRODUCT.md says "Deployment-agnostic (cloud or on-prem)"; README.md says "The app is deployed on Vercel" and the FAQ says "cloud-based" (contradiction 22).
