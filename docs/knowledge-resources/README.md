# myclinicsoft knowledge folder

Draft knowledge documents for DevCom Digital's knowledge library, written from the three MyClinicSoft repositories using the prompts in `docs/prompt-resources/`. Everything here is a draft for the owner to check.

**Status: plan approved by the owner on 2026-11-10 without answers to the questions below. Drafts use the provisional values in [drafting-conventions.md](00-intro/drafting-conventions.md) and keep every open point as a [TO CONFIRM] marker.**

## Contents

| Folder | What it holds | Index |
|---|---|---|
| 00-intro | Fact sheet and drafting conventions (not uploaded) | [Intro - Index](00-intro/Intro%20-%20Index.md) |
| 01-company-foundations | C1–C6 | [Company Foundations - Index](01-company-foundations/Company%20Foundations%20-%20Index.md) |
| 02-project-documents | P1–P5 for myclinicsoft | [Project Documents - Index](02-project-documents/Project%20Documents%20-%20Index.md) |
| 03-department-documents | D1–D10 and S1 procedures | [Department Documents - Index](03-department-documents/Department%20Documents%20-%20Index.md) |
| 04-training-material | T1 lesson pack | [Training Material - Index](04-training-material/Training%20Material%20-%20Index.md) |
| 05-document-tools | Results of the M3, M5 and M7 checks (not uploaded) | [Document Tools - Index](05-document-tools/Document%20Tools%20-%20Index.md) |
| _review | Source inventory and review report (not uploaded) | [Review - Index](_review/Review%20-%20Index.md) |

## Catalogue and plan

**Decision** means: Draft (SOURCES has enough material), Thin (some material, many gaps) or Skip (no material). Category, Confidentiality and Available to are copied from each prompt file. **Status** is Planned until a document is drafted.

### Company foundations

| # | Document | Decision | Main sources | Category | Confidentiality | Available to | Status |
|---|---|---|---|---|---|---|---|
| C1 | Company Overview | Draft | COMPANY_PROFILE.md, PRODUCT.md, about page, lib/seo.ts, components/PublicPage.tsx | Reference | Internal | Company-wide | Drafted |
| C2 | Company Glossary | Draft | COMPANY_PROFILE.md, MOBILE_API.md, lib/roles.ts, both i18n GLOSSARY.md files, DESIGN.md, faq and integrations pages | Reference | Internal | Company-wide | Drafted |
| C3 | Products and Services Catalogue | Draft | pricing, features and integrations pages, lib/subscription-packages.ts, lib/subscription-period.ts, terms page, lib/emcr/activation.ts, mobile/README.md, rep/README.md, PUBLIC_API.md | Sales & marketing | Internal (Public if it only holds published information) | Company-wide | Drafted |
| C4 | Teams and Responsibilities | Thin: SOURCES name no departments; only the support team, platform admins, the Data Protection Officer and legal and sales contacts | lib/platform-auth.ts, lib/support.ts, contact, support, terms and privacy pages, MOBILE_ROADMAP.md | Reference | Internal | Company-wide | Drafted |
| C5 | Communication and Conduct Standards | Thin: claim rules and complaint routes exist, but no conduct policy | DESIGN.md copy rules, docs/PUBLIC_SITE_FOLLOWUPS.md, PRODUCT.md, terms page, support page | Policy (controlled) | Internal | Company-wide | Drafted |
| C6 | Data Handling and Confidentiality | Draft | privacy and terms pages, docs/BACKUP_RESTORE.md, lib/audit-archive.ts, lib/automations/data-retention.ts, lib/patient-erasure.ts, docs/SMS_TWILIO.md, README.md (Sentry scrubbing), docs/LOCAL_DEV_DATABASE.md | Policy (controlled) | Internal | Company-wide | Drafted |

### Project documents (project: myclinicsoft)

| # | Document | Decision | Main sources | Category | Confidentiality | Available to | Status |
|---|---|---|---|---|---|---|---|
| P1 | myclinicsoft: Project Brief | Draft | PRODUCT.md, COMPANY_PROFILE.md, MOBILE_ROADMAP.md, mobile/RELEASE_NOTES.md, rep/README.md, docs/PUBLIC_SITE_FOLLOWUPS.md | Project | Internal | Project (objective) | Drafted |
| P2 | myclinicsoft: Requirements and Acceptance Criteria | Thin: requirements exist as product principles, the MVP list and plan limits, with no stated acceptance criteria | PRODUCT.md, MOBILE_ROADMAP.md, lib/subscription-packages.ts, MOBILE_API.md, docs/SMS_TWILIO.md | Project | Internal | Project (objective) | Drafted |
| P3 | myclinicsoft: Stakeholders and Communication Plan | Thin: stakeholders can be listed, but no decision rights, update rhythm or escalation | PRODUCT.md, privacy page, docs/PUBLIC_SITE_FOLLOWUPS.md, MOBILE_ROADMAP.md, terms page | Project | Internal | Project (objective) | Drafted |
| P4 | myclinicsoft: Decision Log | Draft: about 9 decisions stated as made; deciders not named | MOBILE_ROADMAP.md, MOBILE_API.md, rep/README.md, docs/PUBLIC_SITE_FOLLOWUPS.md, mobile/RELEASE_NOTES.md | Project | Internal | Project (objective) | Drafted |
| P5 | myclinicsoft: Risks, Assumptions and Constraints | Draft | MOBILE_ROADMAP.md, PRODUCT.md, docs/PUBLIC_SITE_FOLLOWUPS.md, docs/BACKUP_RESTORE.md, docs/SMS_TWILIO.md | Project | Internal | Project (objective) | Drafted |

### Department documents

| # | Document | Decision | Main sources | Category | Confidentiality | Available to | Status |
|---|---|---|---|---|---|---|---|
| D1 | Customer Support Playbook | Thin: channels, hours, categories, statuses and refund rule exist; no response targets, priorities or hand-over triggers | support, contact and faq pages, components/PublicPage.tsx, lib/support.ts, models/SupportRequest.ts, terms page | SOP (controlled) | Internal | Department: support | Drafted |
| D2 | Customer FAQ | Draft | faq page (27 questions), pricing page Q&A, compare page, security page, terms and privacy pages, mobile/README.md | Customer support | Public or Internal | Department: support (add sales if useful) | Drafted |
| D3 | Sales Playbook | Thin: customer profile, plans and value messages exist; no sales stages, CRM or qualification method | COMPANY_PROFILE.md, PRODUCT.md, pricing, compare, features and home pages | Sales & marketing | Internal | Department: sales | Drafted |
| D4 | Brand Voice and Writing Style Guide | Draft | DESIGN.md, PRODUCT.md, public page headlines, both i18n GLOSSARY.md files, docs/PUBLIC_SITE_FOLLOWUPS.md | Sales & marketing | Internal | Company-wide | Drafted |
| D5 | Pricing and Discount Rules | Thin: price list and voucher economics exist; no discount limits or approvers | lib/subscription-period.ts, lib/platform-config.ts, lib/platform-config-schema.ts, lib/emcr/activation.ts, lib/rep-billing.ts, terms page, platform tenant actions | Financial | Confidential | Department: sales and finance (needs the Retrieve confidential knowledge authority) | Drafted |
| D6 | Systems Overview | Draft | README.md, .env.example (names only), privacy page, docs/BACKUP_RESTORE.md, docs/SMS_TWILIO.md, docs/LOCAL_DEV_DATABASE.md, vercel.json, PUBLIC_API.md, MOBILE_API.md | Technical | Internal | Department: engineering | Drafted |
| D7 | Engineering Standards and Release Procedure | Draft: CI, testing and migration rules exist; branch naming and rollback are not written down | .github/workflows/ci.yml, README.md, __tests__/README.md, docs/SMS_TWILIO.md, docs/BACKUP_RESTORE.md, mobile/RELEASE_NOTES.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| D8 | Invoicing and Expenses Procedure | Thin: subscription sales invoices are documented; nothing on expenses, purchases or month-end | lib/platform-invoice.ts, lib/bir.ts, terms page, faq page | SOP (controlled) | Internal | Department: finance | Drafted |
| D9 | Standard Contract Terms Summary | Draft: one contract type (Terms of Service); no Enterprise contract template | terms page, privacy page | Legal | Confidential | Role: the roles that handle contracts | Drafted |
| D10 | People Policies Summary | **Skip**: SOURCES contains no HR policy | none | HR | Internal | Company-wide | Skipped |

### S1 procedures (one document each)

| # | Document | Decision | Main sources | Category | Confidentiality | Available to | Status |
|---|---|---|---|---|---|---|---|
| S1-a | Restoring the Database After an Incident | Draft | docs/BACKUP_RESTORE.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| S1-b | Running the Backup Restore Drill | Draft | docs/BACKUP_RESTORE.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| S1-c | Going Live with SMS and Phone Codes | Draft | docs/SMS_TWILIO.md, README.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| S1-d | Running a Production Data Migration | Draft | README.md, scripts/migrate-*.ts, docs/SMS_TWILIO.md, docs/LOCAL_DEV_DATABASE.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| S1-e | Onboarding a New Clinic | Thin (trial length differs, contradiction 12) | app/api/tenants/onboard/route.ts, scripts/onboard-tenant.ts, faq page | SOP (controlled) | Internal | Department: support [TO CONFIRM] | Drafted |
| S1-f | Handling a Clinic Support Request | Draft | lib/support.ts, app/api/support/route.ts, models/SupportRequest.ts, support page | SOP (controlled) | Internal | Department: support | Drafted |
| S1-g | Responding to a Suspected Data Breach | Thin: 72-hour NPC notice and restore steps exist; no roles or internal timeline | docs/BACKUP_RESTORE.md, privacy page | SOP (controlled) | Internal | Company-wide [TO CONFIRM] | Drafted |
| S1-h | Deleting a Closed Clinic's Data | Thin: the script exists, no written runbook | scripts/delete-tenant.ts, terms and privacy pages, docs/PUBLIC_SITE_FOLLOWUPS.md | SOP (controlled) | Internal | Department: engineering | Drafted |
| S1-i | Handling a Patient Data Erasure Request | Thin | app/api/compliance/data-deletion/route.ts, lib/patient-erasure.ts, privacy page | SOP (controlled) | Internal | Department: support | Drafted |
| S1-j | Issuing eMCR Activation Voucher Batches | Thin | lib/emcr/vouchers.ts, lib/emcr/activation.ts, MOBILE_API.md, terms page | SOP (controlled) | Internal | Department: sales and finance [TO CONFIRM] | Drafted |
| S1-k | Handling an SMS Opt-Out | Thin | docs/SMS_TWILIO.md, lib/sms-policy.ts | SOP (controlled) | Internal | Department: support | Drafted |

Platform sales invoicing is covered in D8, not as a separate S1.

### Training material

| # | Document | Decision | Main sources | Category | Confidentiality | Available to | Status |
|---|---|---|---|---|---|---|---|
| T1 | Customer Support Agent - Lesson Pack (proposed role) | Thin: built from D1, D2, S1-f, S1-i and S1-k once drafted | D1, D2, S1 procedures, faq and terms pages | Training | Internal | Role (or attach it to a training program) | Drafted |
| T2 | Practice questions | Skip (written later from published documents) | | (not uploaded) | | | Skipped |

**Totals:** 34 documents. 17 Draft, 15 Thin, 2 Skip (D10 and T2).

## Questions that change the plan

1. **SOURCES.** There is no `apps/` folder. I used the three repositories `clinic-management`, `clinic-management-mobile` and `clinic-management-rep`. Is that right, and should anything else count (for example sales notes or HR policies stored elsewhere)?
2. **The project.** Should P1–P5 cover the MyClinicSoft platform as a whole, or a narrower project such as the eMCR mobile rollout or the go-live work in `docs/PUBLIC_SITE_FOLLOWUPS.md`?
3. **Departments and role titles.** What departments does DevCom Digital have, and what are the role titles for support, sales, finance and engineering? This decides C4 and the owner role on every document.
4. **Live prices.** Are ₱1,499 / ₱3,999 / ₱9,999 a month and the "10 months for a year" rule the live prices in Platform → Configuration? Is the Enterprise price published, or quote-only?
5. **Contradictions in customer-facing facts.** Which answer is right for:
   - plan changes (contradiction 1);
   - trial scope (3) and trial length (12);
   - multiple locations (5);
   - support levels (6);
   - refunds (11)?
6. **eMCR fee.** Can customer documents state the ₱80 a year patient voucher now, while activation is not yet enforced (contradiction 7)?
7. **Discounts.** Who may grant a discount, a free extension or a price exception, and up to what limit? Platform admins can add days to a clinic's period today.
8. **Support targets.** What are the response and resolution targets and priority levels? Is support-hours time Asia/Manila?
9. **Contracts.** Is the Terms of Service the only contract, or are there Enterprise contracts or data processing agreements to add to D9?
10. **Security facts.** Is encryption at rest on for the production database (contradiction 29)? Which backups actually run in production (contradiction 30)?
11. **D8, D10 and T1.** Is there any expense or HR policy to add? Otherwise D10 stays skipped and D8 covers only sales invoices. Is Customer Support Agent the right role for T1?
12. **Customer names.** Some customer clinics can be identified in SOURCES (development login subdomains in README.md). I have left them out. May any customer be named?

## Fact sheet lines still [TO CONFIRM]

From [project-fact-sheet.md](00-intro/project-fact-sheet.md):

- **Customers:** which customers, if any, may be named.
- **Products:** live prices for Basic, Professional and Enterprise; whether the Enterprise price is published.
- **Company departments:** none named in SOURCES.
- **AI employees and people involved:** planned AI employees; role titles for support, sales, finance and engineering.
- **Tools:** CRM and accounting system.
- **Working hours:** time zone of the published support hours, holidays, staff working hours.
- **Project name:** whole platform or a narrower project.
- **Why now:** not stated.
- **Deliverables:** owner role and due date for each.
- **Key dates:** project deadline, iOS release date, rep app release date, SMS go-live date.
- **Budget or cost limits:** not stated.
- **Customers involved:** not stated.
- **Success measures:** no measurable targets.
- **Decisions:** who made each decision, and the date for six of the nine.
