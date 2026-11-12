# M7 final checks

Results of the M7 final check (`docs/prompt-resources/05-document-tools/M7-final-check-before-upload.md`) on every draft, run 2026-11-10. The check ignores the expected [TO CONFIRM] markers and Open questions sections.

Fixes were made in the drafts. "Remains" lists what the source files cannot fix, or what needs an editorial decision from the owner.

Changes made across all drafts after the per-document checks:
- **"SOURCES" in reader text:** the drafting term "SOURCES" was replaced with "the source files" throughout.
- **Spelling:** British spelling was set as the convention (see drafting-conventions.md).
- **Contradiction numbers:** contradictions found during drafting are numbered 42–65 in the source inventory, and the drafts cite those numbers.

Not uploaded.


### Company Overview (`01-company-foundations/Company Overview.md`)
**Fixed:**
- "Paid plan for growing clinics, with AI visit notes, teleconsult, the REST API and webhooks" (plan features belong in the Products and Services Catalogue) → reduced to "Paid plan for growing clinics"
- Public API row "Professional and Enterprise only" (plan limit stated outside the catalogue) → removed; row now only says what the API does
**Remains:**
- none

### Company Glossary (`01-company-foundations/Company Glossary.md`)
**Fixed:**
- "Clinic workflow terms" section was 356 words → split into "Clinic workflow terms" (booking, visits, treatment) and a new "Clinic records and programme terms" section, each with its own subject sentence
- Open question 8 (support chat) "not numbered in the source inventory" → now cites contradiction 53
- Open question 9 (demos) "not numbered in the source inventory" → now cites contradiction 52
**Remains:**
- none

### Products and Services Catalogue (`01-company-foundations/Products and Services Catalogue.md`)
**Fixed:**
- "eMCR" section was 319 words → split; price, reminders and sales rule moved into a new section "eMCR activation price and sales rule"
- Trial length marker "(contradiction 12)" → "(contradictions 12 and 42)"; open question 2 now also quotes the "7-day trial period" emails in lib/automations/trial-expiration.ts
- Open question 23 (webhook retries) "Not numbered" → contradiction 64
- Open question 24 (₱0 seat fee against ₱0 rep fee) "Not numbered" → contradiction 60
- Added open question 25: taxes, "responsible for applicable taxes" against "The price you see is the price you pay" (contradiction 51)
- Added open question 26: "SMS and email reminders" in every plan, but SMS not yet live (contradiction 50)
**Remains:**
- The per-plan "Included" and "Not included" rows repeat parts of the plan limits table (AI visit notes, teleconsult, API and webhooks). The C3 prompt asks for both, so the repetition was kept. The owner should decide whether the rows should just point to the table.

### Teams and Responsibilities (`01-company-foundations/Teams and Responsibilities.md`)
**Fixed:**
- "Who handles what" began with a bare table and grew to 315 words after the fixes → split into "Who handles what: support, billing and configuration" and "Who handles what: privacy, legal and security", each with a subject sentence; open question 16 updated to refer to both sections
- Platform admins "get an email for every new request" (wrong for rep requests; app/api/medical-representatives/support/route.ts emails support@ only) → now says this applies to clinic requests, and that rep requests go to the support mailbox (contradiction 59); added that route as a source
- Open question 18 (legal@ against support@ for security concerns) "Not numbered" → contradiction 49
- Open question 19 (support chat) "Not numbered" → contradiction 53
- Added open question 21: the "Pricing or a demo" contact topic against "Demos aren't offered" (contradiction 52); Sales cites that topic
**Remains:**
- none

### Communication and Conduct Standards (`01-company-foundations/Communication and Conduct Standards.md`)
**Fixed:**
- "testimonials, case studies and pricing figures must not be fabricated" appeared in both "Promises and commitments" and "Prohibited behaviour" → removed from "Promises and commitments"
- The refund rule appeared in both "Promises and commitments" and the complaints table → the complaints row now points to "Promises and commitments" (the [TO CONFIRM] marker is kept)
- Open question 14 ("DPA compliant" FAQ) "Not numbered" → contradiction 46
- Open question 16 (demos) → contradiction 52; open question 17 (support chat) → contradiction 53; open question 18 (security routes) → contradiction 49
**Remains:**
- none

### Data Handling and Confidentiality (`01-company-foundations/Data Handling and Confidentiality.md`)
**Fixed:**
- Inconsistent spelling "anonymized", "unauthorized" (the other drafts use British spelling) → "anonymised", "unauthorised"
- The term "SOURCES" (internal drafting label) appeared in body text and open questions → "the source files"
- A repository file pattern for backup archives in the Restricted row (inventory lists it as a sensitive file location) → "backup files"
- Open question 18 (FAQ "Yes" to DPA compliance) → contradiction 46; open question 19 (retention "clears" records) → contradiction 47; open question 20 (legal@ against support@) → contradiction 49
**Remains:**
- Several open questions are written as plain questions without a [TO CONFIRM: …] tag at the start (for example 1–7, 13–14, 17), unlike the other drafts. The brief says to ignore the Open questions section, so this was left as it is.

### myclinicsoft: Project Brief (`02-project-documents/myclinicsoft - Project Brief.md`)
**Fixed:**
- Headings "## myclinicsoft: Document control" and "## myclinicsoft: Open questions" (did not match the required "## Document control" / "## Open questions" or the four sibling P-documents) → renamed without the prefix
- "Hosting on Vercel needs the Pro plan" appeared both in "Budget and cost limits" and "Constraints" → constraint bullet removed (the constraints list already points to "myclinicsoft: Risks, Assumptions and Constraints")
- Scope row "REST API and webhooks for Professional and Enterprise clinics" (plan limit) → "REST API and webhooks that let clinics connect their own systems"
- The portal removal date 2026-10-18 appeared in Background, Scope excluded and Timeline → the Scope excluded row now points to "myclinicsoft: Timeline and milestones"
**Remains:**
- none

### myclinicsoft: Requirements and Acceptance Criteria (`02-project-documents/myclinicsoft - Requirements and Acceptance Criteria.md`)
**Fixed:**
- Summary opened with "This document lists" → "myclinicsoft: Requirements and Acceptance Criteria lists"
- "eMCR MVP requirements (records)" opened with "These requirements come from" → "The eMCR MVP records requirements below come from"
- R4: the 72-hour NPC notice had no provisional marker, though the conventions mark it provisional → added [TO CONFIRM: breach notice wording (contradiction 31)] and open question 18
- R38: "indexes … before deploy" conflicts with other sources → added [TO CONFIRM: whether indexes are built before or after deploying (contradiction 61)] and open question 19
- R30 (rep app never calls checkout) conflicts with MOBILE_API.md → added open question 20 (contradiction 58)
**Remains:**
- none

### myclinicsoft: Stakeholders and Communication Plan (`02-project-documents/myclinicsoft - Stakeholders and Communication Plan.md`)
**Fixed:**
- Summary opened with "This plan lists" → "myclinicsoft: Stakeholders and Communication Plan lists"
- The support hours were written out in full, though the Company Overview holds them → replaced with a reference to the Company Overview (the time-zone marker is kept); Company Overview added to Related documents
- Escalation table: the 72-hour NPC notice had no provisional marker → added [TO CONFIRM: breach notice wording (contradiction 31)] and open question 16
- Jargon "crons paused" → "scheduled jobs paused"
**Remains:**
- none

### myclinicsoft: Decision Log (`02-project-documents/myclinicsoft - Decision Log.md`)
**Fixed:**
- Summary opened with "This log records" → "myclinicsoft: Decision Log records"
- D5 says rep registration "stays on the web" while D9 says it is paused (inconsistent within the document) → D5 now notes the pause and points to D9 (contradiction 57)
- Open question 15 cited contradiction 17 for the conflict between registration on the web and the paused page; the inventory numbers it 57 → "(contradiction 57; see also contradiction 17)"
- Added open question 17: D6 against MOBILE_API.md, which says to open checkout "in the browser" (contradiction 58)
**Remains:**
- The decision IDs D1–D9 use the same labels as the catalogue numbers for department documents (D1 = Customer Support Playbook, and so on), which may confuse readers. Renaming them (for example to DL1–DL9) is an editorial choice for the owner and was not made.

### myclinicsoft: Risks, Assumptions and Constraints (`02-project-documents/myclinicsoft - Risks, Assumptions and Constraints.md`)
**Fixed:**
- Summary opened with "This register lists" → "myclinicsoft: Risks, Assumptions and Constraints lists"
- Four risk sections opened with "These risks come from…" → each now names its subject ("The architecture risks below…", and so on)
- "Risks from backups and owner decisions", "Assumptions", "Legal and brand constraints" and "Technical and operational constraints" began with no subject sentence → added one to each, naming the subject and its sources (docs/BACKUP_RESTORE.md, lib/backups.ts, docs/PUBLIC_SITE_FOLLOWUPS.md for the backup risks)
- The 72-hour NPC constraint had no provisional marker → added [TO CONFIRM: breach notice wording (contradiction 31)] and open question 22
- RK15 "Create the missing indexes before deploying" → added [TO CONFIRM: whether indexes are built before or after deploying (contradiction 61)] and open question 23
**Remains:**
- The Assumptions table heading "How we will check it" uses the first person. The wording appears to come from the P5 prompt's table layout, so it was not changed.

### Customer Support Agent: Lesson Pack (`04-training-material/Customer Support Agent - Lesson Pack.md`)
**Fixed:**
- The term "SOURCES" in open question 1 → "the source files"
- The common-mistakes row "Promising phone, chat or 24/7 support" ignores the in-app support chat that exists (lib/support-chat.ts) → added [TO CONFIRM: whether in-app support chat counts as a support channel (contradiction 53)] and open question 7
- Checked against SOURCES with no change needed: the "Billing or subscription" category label, the "Waiting on us" view, "Send and resolve", 10 activation tries an hour and the 30-second delay
**Remains:**
- Worked example 1 restates the 7-day read-only grace period, which the Products and Services Catalogue (billing terms) also holds. The figure was kept because the example needs it to make sense. It should be updated together with the catalogue if it changes.

### Customer Support Playbook (`03-department-documents/Customer Support Playbook.md`)
**Fixed:**
- "Enterprise support hours and response times are agreed in each clinic's contract" in "Support channels and hours" repeated "Response and resolution targets" → removed from "Support channels and hours"
- "The plan-by-plan support level uses the provisional public wording: email support on the Free trial and Basic…" (a plan limit restated) → now refers to "Products and Services Catalogue"; the contradiction 6 marker is kept
- "The support team, or an AI employee answering support questions, hands a request…" (text that names an AI) → "Anyone answering support questions hands a request…"
- "[TO CONFIRM: SMS go-live date]" and Open question 16 "New contradiction, not in the inventory" → numbered as contradiction 50
- "phone, chat and round-the-clock support are not offered" conflicts with lib/support-chat.ts → added contradiction 53 to Open question 4
- legal@ and support@ both listed for security and unauthorised-access reports with no note → added Open question 21 (contradiction 49)
**Remains:**
- The draft uses the word "SOURCES" in reader-facing text ("not set in SOURCES"). The same happens in every draft in this batch, so it was left for a decision across all documents.

### Customer FAQ (`03-department-documents/Customer FAQ.md`)
**Fixed:**
- "the account becomes read-only for a 7-day grace period" was stated in two answers → "What happens when the free trial ends?" now refers to "What happens if my subscription is not renewed?"
- "The 14-day free trial is there so…" repeated the trial length → "The free trial is there so…"
- "It suits small clinics with 1–3 doctors" (a plan limit) → doctor and user limits are now referred to "Products and Services Catalogue"
- "The Professional and Enterprise plans also include API access" was stated twice → the lab-systems answer now refers to "Can I customise MyClinicSoft or connect my own systems?"
- The support level per plan was spelled out (a plan limit) → now refers to the Catalogue; the contradiction 6 marker is kept
- "Enterprise support hours and response times are agreed in the contract" duplicated the support-level answer → cut to "Enterprise support hours are agreed in the clinic's contract"
- The VAT marker, the SMS markers (3) and Open questions 2, 7 and 19 said "New contradiction" → numbered as contradictions 51, 50 and 46
- Added contradiction 53 (chat support) to Open question 11, and contradiction 49 (legal@ vs support@ for security reports) as Open question 22
**Remains:**
- The question headings use "I", "my" and "you" ("What payment methods do you accept?"). This is FAQ format; the answers are in third person.

### Sales Playbook (`03-department-documents/Sales Playbook.md`)
**Fixed:**
- "Ideal customer profile" was 306 words → the poor-fit table moved to a new section "## Signals of a poor fit" that names its subject
- "Plan fit: Basic for 1–3 doctors, Professional for up to 10 doctors" and "1–3 doctors" / "up to 10 doctors" in Value messages (plan limits, stated twice) → now refer to the plan limits in "Products and Services Catalogue"; doctor counts removed from the value-message labels
- "14-day free trial" was repeated in three objection sections → "the free trial" (the length stays in the Summary)
- Open question 13 "New contradiction, not in the inventory" (demos) → contradiction 52
- The "DPA compliant" row in "What may not be promised" → contradiction 46 added
- Added contradiction 53 (chat support) to Open question 10
**Remains:**
- The fact that phone, chat and 24/7 support are not offered appears in "Signals of a poor fit", the objection section and the do-not-promise table. Each section needs it to stand alone, so it was kept; contradiction 53 is still open.

### Brand Voice and Writing Style Guide (`03-department-documents/Brand Voice and Writing Style Guide.md`)
**Fixed:**
- Open question 8 "New contradiction, not in the inventory" ("DPA compliant") → contradiction 46
- The "24/7, phone or chat support" row in "Claims we may not make" → contradictions 6 and 53 added; Open question 14 added on in-app chat (lib/support-chat.ts)
**Remains:**
- The headings and example tables use "we" ("Who we write for", "We write like this"). This follows the section titles set by the prompt, so it was left.
- The draft uses "SOURCES" in reader-facing text ("SOURCES contain no social media rules"). This is the same decision across all documents as in the Customer Support Playbook.

### Pricing and Discount Rules (`03-department-documents/Pricing and Discount Rules.md`)
**Fixed:**
- The price list gave "Free trial … 14 days" without a marker, although the value is provisional → added [TO CONFIRM: trial length (contradictions 12 and 42)] and Open question 17
- The medical representative ₱0 rows ("booking is free", "not sold online") have conflicting meanings in SOURCES → added Open question 18 (contradictions 60 and 19)
- The taxes rule conflicts with the FAQ's "The price you see is the price you pay" → added Open question 19 (contradiction 51)
**Remains:**
- The voucher prices ₱80 and ₱60 and the ₱20 / 25% margin appear in the Summary, the Price list and "Costs and target margins". This is one confidential document and each section needs the figures, so they were kept.

### Standard Contract Terms Summary (`03-department-documents/Standard Contract Terms Summary.md`)
**Fixed:**
- "The Free trial lasts 14 days" had no marker although the value is provisional → added [TO CONFIRM: trial length (contradictions 12 and 42)] and Open question 16
- The taxes row → added [TO CONFIRM: whether prices include VAT (contradiction 51)] and Open question 17
- "at least 15 days before they take effect" was stated twice (in the liability table and in contract handling step 3) → step 3 now refers to the "Changes to the terms" row
- Open question 15 (legal@ vs support@) → contradiction 49 added
**Remains:**
- none

### Handling a Clinic Support Request (`03-department-documents/Handling a Clinic Support Request.md`)
**Fixed:**
- "Procedure: receiving a request" was 301 words → step 4 and step 6 tightened (now 297)
- The support hours were repeated from the Customer Support Playbook → now refer to "Customer Support Playbook", section "Support channels and hours"; the Asia/Manila marker is kept
- "Enterprise response times are agreed in each contract" was stated twice → "Time targets" now refers to "Exceptions and what to do"
- The Rep-request markers and Open questions 3–5 said "New contradiction, not in the inventory" → contradiction 59; the marker wording in Open question 3 now matches the body
**Remains:**
- Step numbers run on across two sections (steps 7–11 in "answering and resolving", and step 9 says "Go to step 3"). This follows the S1 split; the section still reads on its own with that reference.

### Onboarding a New Clinic (`03-department-documents/Onboarding a New Clinic.md`)
**Fixed:**
- "Procedure: self-service sign-up (normal path)" was 359 words → steps 7–10 moved to a new section "## Procedure: first sign-in after self-service sign-up" that names its subject; the cross-reference in the command-line path was updated
- "[TO CONFIRM: correct the email wording (new contradiction, see Open questions)]" → contradiction 42; defaults marker → contradictions 12 and 43
- Open questions 3–6 said "New" → numbered as contradictions 43, 42, 44 and 45
- Open question 7 talked about "The brief" (a note to the drafter) → reworded as a page-naming fact about `/onboard` and `/tenant-onboard`
- "extends the trial … and gives a reason" and "with the platform admin's email and reason" did not match the source: the console sends no reason (components/platform/ClinicActions.tsx; app/api/platform/tenants/[id]/route.ts) → corrected to "any reason given (the console does not ask for one)"
- The 72-hour link time was repeated in the Exceptions row heading → "Set-password link has expired"
**Remains:**
- Trial length, warning days and link validity appear in the steps, the Summary and "Time targets". The S1 template asks for a "Time targets" table, so those repeats were kept.
- "Procedure: command-line set-up (staff path)" is 285 words, close to the limit.

### Issuing eMCR Activation Voucher Batches (`03-department-documents/Issuing eMCR Activation Voucher Batches.md`)
**Fixed:**
- "eMCR account lookup described in … and in 'Handling a Clinic Support Request'" was wrong: that document does not describe the lookup → reworded so the lookup is in "Exceptions in voucher batches" and the request follows "Handling a Clinic Support Request"
- A table cell began "It cannot be redeemed" → "The code cannot be redeemed"
**Remains:**
- The days-per-voucher range (1–1,098) appears both in Inputs and in Approvals. Each table needs it, so it was kept.

### Handling an SMS Opt-Out (`03-department-documents/Handling an SMS Opt-Out.md`)
**Fixed:**
- "Stops at 80% of the clinic's monthly quota" was stated twice → the Approvals row now refers to "Text categories and what an opt-out blocks"
- Open question 1 (SMS not live, opt-outs only logged) → contradiction 50 added, with the FAQ and pricing promises
**Remains:**
- "Within one minute" and "365 days" appear both in the steps and in "Time targets". The S1 template asks for that table, so they were kept.

### Systems Overview (`03-department-documents/Systems Overview.md`)
**Fixed:**
- "(Professional and Enterprise)" for the AI scribe, and "for Professional and Enterprise clinics" for the API (plan availability belongs in the Catalogue) → replaced with a reference to "Products and Services Catalogue"
- "MyClinicSoft has three environments described in SOURCES", "There is no shared staging environment in SOURCES", "as described in SOURCES", "found in SOURCES" (drafting jargon a reader cannot use) → reworded to "the engineering documentation", "No shared staging environment is documented", "as documented in the code and engineering notes"
- Known limitations table repeated facts already stated in the system sections (free tier and Cloud Backup, encryption at rest, SMS not live, Turnstile keys, per-instance rate limits, Sentry inactive, indexes not built, Vercel Pro, Rep has no EAS project) → replaced with a sentence pointing to each system's section; kept only the limitations not stated elsewhere
- "Vercel calls the 41 scheduled jobs" and "audit-log months older than about 90 days" in the data-flow list (stated twice) → number and age removed from the data-flow list
- Index rule in the MongoDB Atlas table → added "(timing is contradiction 61)"
- Open question 18 "(Not numbered in the inventory.)" → "(contradiction 64)"
**Remains:**
- Owner role for every system, account holders, and all other [TO CONFIRM] items (no owner answers yet)
- `.env.prod.local` is named as the scripts' settings file; it is a file name needed for steps, not a value, so it was kept (flag only)
- More than one subject is not an issue; one section ("Upstash Redis ... and Cloudflare Turnstile") covers two systems in one table, which the prompt allows

### Engineering Standards and Release Procedure (`03-department-documents/Engineering Standards and Release Procedure.md`)
**Fixed:**
- "Code style and review rules" was 305 words → split into "Code style rules" and "Code review rules"
- "This is observed in git history" → "The pattern is observed in git history"
- Seven uses of "SOURCES" ("written in SOURCES", "not in SOURCES", "as far as SOURCES describe them", "not defined in SOURCES") → reworded to "written down" / "the repository"
- Rollback step 5 repeated "no over-the-air updates" from "Release steps: mobile apps" → replaced with a reference to that section
- Release step 7 index timing → added "contradiction 61"
- Open question 17 Next.js version → added "(contradiction 65)"
**Remains:**
- Reviewer, operator and approver roles; branch protection; deploy method; rollback; change approvals; on-call (none in SOURCES)

### Invoicing and Expenses Procedure (`03-department-documents/Invoicing and Expenses Procedure.md`)
**Fixed:**
- "medical representative fees (default ₱0)" (price outside the Catalogue) → "(prices in "Products and Services Catalogue")"
- "Vercel, which must be on the Pro plan or higher" (belongs in Systems Overview) → removed the plan detail
- "No bank details are kept in this document." stated twice (Summary and "Recording a payment") → removed from "Recording a payment"
- "SOURCES describe nothing about…", "not in SOURCES", "SOURCES give no purchase rules", "not named in SOURCES" → reworded to "No written material…" / "not written down"
- Taxes row conflicts with the FAQ ("The price you see is the price you pay") → added [TO CONFIRM: contradiction 51] and Open question 13
**Remains:**
- Expense, purchase and month-end rules, finance role, Enterprise invoice terms (none in SOURCES)

### Restoring the Database After an Incident (`03-department-documents/Restoring the Database After an Incident.md`)
**Fixed:**
- Step 7 repeated the drill's check steps "(sign in as staff…, compare `pnpm db:stats` counts)" (procedure steps belong in their own S1) → now refers only to "Running the Backup Restore Drill"
- Exceptions row "`restore.sh` | It writes into…" → "The script writes into…"
- "SOURCES do not state any approval rule" → "No approval rule for these steps is written down."
**Remains:**
- The 72-hour NPC notice also appears in "Responding to a Suspected Data Breach" (Time targets); kept here as a time target with its contradiction 31 marker, since the owner has not settled the wording
- Production tier and backups (contradiction 30), role titles, incident log location

### Running the Backup Restore Drill (`03-department-documents/Running the Backup Restore Drill.md`)
**Fixed:**
- Step 6 "That is the real recovery time." repeated the Purpose section → removed
- "It must not be shared or left running…" ("must" not a rule in SOURCES) → reworded as following step 8 and the dump-handling rule in `docs/BACKUP_RESTORE.md`
- Frequency "once now, then quarterly" stated in "When this procedure applies" and "Time targets" → Time targets now refers to the first section
- "not stated in SOURCES", "not described in SOURCES", "SOURCES do not state…" → reworded to "not written down"
**Remains:**
- Production tier and Cloud Backup (contradiction 30), role titles, drill log location, recovery time target

### Going Live with SMS and Phone Codes (`03-department-documents/Going Live with SMS and Phone Codes.md`)
**Fixed:**
- "6-digit codes" stated in Inputs 1 and step 3 → Inputs 1 now says the Verify Service is created in step 3
- "10-minute expiry" in Exceptions repeated "Time targets" → "code lifetime"
- Exceptions cell "They refuse to send" → "Public phone codes refuse to send"
- "SOURCES do not state who approves…", "not written in SOURCES" → "No written rule states…", "not written down"
- Stage 1 step 1 indexes before deploy conflicts with other sources → added [TO CONFIRM: … (contradiction 61)] and Open question 13
- Public pages already promise SMS → added Open question 14 (contradiction 50)
**Remains:**
- Go-live date, sender registration, Turnstile keys, per-text rate and quotas, role titles, log-only days (none in SOURCES)

### Running a Production Data Migration (`03-department-documents/Running a Production Data Migration.md`)
**Fixed:**
- "cannot run through `pnpm prod`" stated in both the script table and Exceptions → the table now refers to "Exceptions and what to do"
- Exceptions cells "It cannot run…" and "They hold real patient data…" → name the subject ("The script…", "Backup files…")
- Open questions 10 and 11 "(Not numbered in the inventory.)" → contradictions 61 and 62; Open question 9 and the matching exception marker → contradiction 63; index-timing marker in Time targets → contradiction 61
- "not recorded in SOURCES", "SOURCES do not state who approves…" → "not recorded anywhere", "No written rule states…"
**Remains:**
- Migration run history, role titles, approval channel, rollback (none in SOURCES)

### Responding to a Suspected Data Breach (`03-department-documents/Responding to a Suspected Data Breach.md`)
**Fixed:**
- "72 hours" stated in the Summary, step 2, step 10, Exceptions and Time targets → steps 2 and 10 and the Exceptions row now refer to the deadline in "Time targets" (Summary and Time targets keep it)
- "unauthorized" and "anonymized" (the library uses "unauthorised" and "anonymised" in prose) → changed to the library spelling
- Open question 14 "Both must reach the Data Protection Officer" ("must" is not a stated rule) → "Both channels need to reach…" and added "(contradiction 49)"
**Remains:**
- Named DPO, deputy, incident register, NPC form and channel, key rotation, time targets (none in SOURCES)
- Conventions do not set British or American spelling; the library mixes them (flag for the conventions owner)

### Deleting a Closed Clinic's Data (`03-department-documents/Deleting a Closed Clinic's Data.md`)
**Fixed:**
- "Procedure: run the deletion" was 386 words → split into "Procedure: run the deletion" (steps 6–10) and "Procedure: check and confirm" (steps 11–15)
- "30 days" repeated in Inputs, step 4, step 5 and Exceptions → these now refer to the deadline in "Time targets" (Summary and Time targets keep it)
- "anonymized local development database" → "anonymised"
- Step 13 marker and Open question 6 (audit-log archive files, audit trail) → added "contradictions 54 and 55"; backups marker quoting "overwritten on a rolling basis" → added "contradiction 32"
- "statuses in SOURCES" → "statuses in the code"
**Remains:**
- What counts as "closed", request owner and channels, approver, retention periods, backup retention (none in SOURCES)

### Handling a Patient Data Erasure Request (`03-department-documents/Handling a Patient Data Erasure Request.md`)
**Fixed:**
- "Procedure" was 324 words → split into "Procedure: receive the request and decide" (steps 1–5) and "Procedure: run the erasure and reply" (steps 6–8)
- Step 6 marker and Open question 4 (no screen for erasure) → added "contradiction 48"; Open question 12 (patient notes and referrals kept in anonymise mode) → added "contradiction 56"
- "none in SOURCES", "SOURCES give none." → "none written down", "None is written down."
**Remains:**
- Who may ask for a patient, close-account path for eMCR, identity proof, response period, how administrators reach the erasure function (none in SOURCES)

