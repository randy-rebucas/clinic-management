# myclinicsoft: Requirements and Acceptance Criteria

## myclinicsoft: Summary

myclinicsoft: Requirements and Acceptance Criteria lists the requirements of the myclinicsoft project (the MyClinicSoft web platform, the eMCR (Electronic MyClinic Record) patient app, the MyClinicSoft Rep app and the go-live work), each with checks that can be answered yes or no. It is for the people who build, test and accept the work. Every requirement comes from a named source file: the product principles and constraints in PRODUCT.md, the patient-app MVP in MOBILE_ROADMAP.md, the rules in MOBILE_API.md, the plan definitions in lib/subscription-packages.ts, docs/SMS_TWILIO.md, docs/PUBLIC_SITE_FOLLOWUPS.md, docs/BACKUP_RESTORE.md, mobile/RELEASE_NOTES.md and rep/README.md. The project scope is provisional: [TO CONFIRM: project scope]. Priorities are provisional: a requirement is "Must" where the source says must, never, compulsory or required, "Should" where the source recommends it, and "Could" where the source calls it optional [TO CONFIRM: priorities]. Requirements that seem to be missing are listed under Open questions, not added.

## myclinicsoft: Access control and audit requirements

### R1: Role-based access in every module
- **Requirement:** Every MyClinicSoft module controls access by role (RBAC).
- **Why it matters:** PRODUCT.md states "RBAC across all modules" as a capability and constraint.
- **Priority:** Must
- **Acceptance criteria:**
  1. Each module checks the user's role before showing or changing data.
  2. A user without the needed role is refused.

### R2: Audit logging of data access and changes
- **Requirement:** MyClinicSoft logs access to and changes in patient data.
- **Why it matters:** PRODUCT.md: audit logging "is a compliance requirement, not optional".
- **Priority:** Must
- **Acceptance criteria:**
  1. Viewing and changing a patient record each create an audit log entry.
  2. Audit-relevant actions are visible and traceable in the interface, "never hidden" (PRODUCT.md principle 2).

### R3: Two-factor sign-in and audit logs on every plan
- **Requirement:** Two-factor sign-in and audit logs are available on every plan, including the Free trial.
- **Why it matters:** lib/subscription-packages.ts: "2FA and audit logs are not plan-gated".
- **Priority:** Must
- **Acceptance criteria:**
  1. A Free trial clinic and a Basic clinic can both turn on two-factor sign-in.
  2. A Free trial clinic and a Basic clinic can both see audit logs.

## myclinicsoft: Data privacy requirements

### R4: Data handling under the Data Privacy Act
- **Requirement:** All handling of personal data follows the Data Privacy Act of 2012 (RA 10173).
- **Why it matters:** PRODUCT.md calls it "a hard constraint on data handling".
- **Priority:** Must
- **Acceptance criteria:**
  1. Each new feature that touches personal data has been checked against the Data Privacy Act before release [TO CONFIRM: who performs the check].
  2. A suspected personal data breach is assessed, and the NPC is notified within 72 hours of discovery where required (docs/BACKUP_RESTORE.md) [TO CONFIRM: breach notice wording (contradiction 31)].

### R5: Deleting a closed clinic's data on request
- **Requirement:** A closed clinic's data is deleted within 30 days of a written request from a clinic administrator.
- **Why it matters:** The Terms of Service, Privacy Policy and FAQ promise it; docs/PUBLIC_SITE_FOLLOWUPS.md says it "need[s] tooling".
- **Priority:** Must
- **Acceptance criteria:**
  1. A documented way exists to delete all of a clinic's collections and its stored files (see "Deleting a Closed Clinic's Data").
  2. The deletion can be completed within 30 days of the request.

### R6: Closing an eMCR account on request
- **Requirement:** A patient can ask to close their eMCR account, in the app or through support.
- **Why it matters:** The Privacy Policy says "eMCR accounts are kept until you ask us to close them"; docs/PUBLIC_SITE_FOLLOWUPS.md asks to confirm a close-account path exists.
- **Priority:** Must
- **Acceptance criteria:**
  1. A close-account path exists and is documented.
  2. A closed account can no longer sign in.

## myclinicsoft: Product principle requirements

### R7: One integrated system
- **Requirement:** Patients, billing, inventory and scheduling share one consistent set of data across modules.
- **Why it matters:** PRODUCT.md principle 3: cross-module consistency "is a core value, not a nice-to-have".
- **Priority:** Must
- **Acceptance criteria:**
  1. A patient created in one module appears in scheduling, visits and billing without being entered again.
  2. A patient's details changed in one module show the same in every other module.

### R8: Holding up for a single practice and a network
- **Requirement:** Flows work for both a single practice and a healthcare network with several clinics.
- **Why it matters:** PRODUCT.md principle 4: multi-clinic scale "must not be an afterthought".
- **Priority:** Should
- **Acceptance criteria:**
  1. Data of one clinic is never visible to another clinic.
  2. One patient can link records from several clinics in eMCR (MOBILE_API.md, "one login for every clinic").

### R9: Speed and low error rate for every role
- **Requirement:** No role's workflow is made slower or more error-prone to favour another role.
- **Why it matters:** PRODUCT.md principle 1.
- **Priority:** Should
- **Acceptance criteria:**
  1. Each role's main workflow meets an agreed time and error target [TO CONFIRM: measurable targets per role].

### R10: General good accessibility practice
- **Requirement:** Screens follow general good accessibility practice.
- **Why it matters:** PRODUCT.md: no formal standard is mandated, "follow general good accessibility practice".
- **Priority:** Could
- **Acceptance criteria:**
  1. Interactive elements have accessibility labels (eMCR 1.1.4 added these "throughout").

## myclinicsoft: Brand and public claim requirements

### R11: Fixed brand identity
- **Requirement:** The existing MyClinicSoft name, logo and colours are kept as they are.
- **Why it matters:** PRODUCT.md: the brand identity "is fixed and binding".
- **Priority:** Must
- **Acceptance criteria:**
  1. No release changes the name, logo component or brand colours without owner approval.

### R12: No fabricated or unbacked claims
- **Requirement:** Public pages carry no fabricated testimonials, case studies, uptime figures, or claims the service cannot back.
- **Why it matters:** PRODUCT.md: "future work must not fabricate these"; docs/PUBLIC_SITE_FOLLOWUPS.md removed 24/7, phone and chat support, proration, add-ons, multi-location, white-label and "DPA compliant" claims.
- **Priority:** Must
- **Acceptance criteria:**
  1. No public page shows a testimonial, customer count or uptime figure.
  2. No public page promises 24/7, phone or chat support, or says "DPA compliant".
  3. "Encrypted at rest" appears only once the owner confirms it for the production database.

### R13: eMCR fee disclosure before activation is enforced
- **Requirement:** The home, features, FAQ, about and compare pages state the eMCR activation fee before activation enforcement is switched on.
- **Why it matters:** Those pages present eMCR as included (docs/PUBLIC_SITE_FOLLOWUPS.md). The fee is in "Products and Services Catalogue".
- **Priority:** Must
- **Acceptance criteria:**
  1. All five pages mention the yearly activation fee.
  2. Activation enforcement is switched on only after check 1 is met.

## myclinicsoft: Plan limit requirements

### R14: Plan limits enforced
- **Requirement:** Each clinic is held to the limits of its plan (doctors, staff users, patients, appointments, visits, storage, file size, texts).
- **Why it matters:** lib/subscription-packages.ts defines a set of limits for each plan. The customer-facing limits are in "Products and Services Catalogue".
- **Priority:** Must
- **Acceptance criteria:**
  1. Adding a record beyond a limit is refused with a clear message.
  2. An Enterprise clinic meets no limit marked unlimited.

### R15: Features gated by plan
- **Requirement:** AI visit notes, teleconsult, the MyClinicSoft public API and webhooks are available only on the plans that include them.
- **Why it matters:** lib/subscription-packages.ts sets these per plan; "Products and Services Catalogue" holds the table.
- **Priority:** Must
- **Acceptance criteria:**
  1. A Basic clinic cannot create an API key or webhook.
  2. A Professional clinic can use AI visit notes, teleconsult, the API and webhooks.

## myclinicsoft: eMCR sign-in and session requirements

### R16: Bearer tokens kept in secure storage
- **Requirement:** eMCR and MyClinicSoft Rep sign in with a Bearer access token and a refresh token, and keep both in secure storage only.
- **Why it matters:** MOBILE_API.md: "Keep both in secure storage only"; MOBILE_ROADMAP.md lists device loss as a Data Privacy Act risk.
- **Priority:** Must
- **Acceptance criteria:**
  1. Tokens are stored only in the phone's secure storage.
  2. No patient health information is kept in plain, unencrypted app storage.

### R17: Single-use rotating refresh tokens
- **Requirement:** Each refresh issues a new token pair; reusing a spent refresh token revokes the whole chain.
- **Why it matters:** MOBILE_API.md treats a reused refresh token as theft.
- **Priority:** Must
- **Acceptance criteria:**
  1. The app refreshes once on a 401 and retries the request.
  2. Two requests that both get a 401 share one refresh call.
  3. A reused refresh token signs the user out everywhere in that chain.

### R18: Sign-in rate limits
- **Requirement:** Sign-in endpoints are limited per IP address and per account.
- **Why it matters:** MOBILE_API.md states the limits; a 429 answer means wait.
- **Priority:** Must
- **Acceptance criteria:**
  1. Repeated failed sign-ins from one IP address or for one account receive a 429 answer.

## myclinicsoft: eMCR MVP requirements (records)

The eMCR MVP records requirements below come from the patient-app MVP list in MOBILE_ROADMAP.md (2026-09-21). Parts of that file are out of date; see Open questions.

### R19: Upcoming appointments
- **Requirement:** Patients can view upcoming appointments, cancel them and ask to reschedule.
- **Why it matters:** MVP item 2.
- **Priority:** Must
- **Acceptance criteria:**
  1. Upcoming appointments show in the app with the clinic's time.
  2. A patient can cancel an appointment and request a new time.

### R20: Live queue position
- **Requirement:** Patients can see their live queue position, refreshed by polling.
- **Why it matters:** MVP item 3. There is no real-time channel; Socket.IO was removed.
- **Priority:** Must
- **Acceptance criteria:**
  1. The queue screen refreshes while the app is open (the shell used a 15-second poll).

### R21: Lab results
- **Requirement:** Patients can read their lab results, with a document view where a file exists.
- **Why it matters:** MVP item 4. MOBILE_API.md lists "Lab-result PDFs" as not built yet.
- **Priority:** Must
- **Acceptance criteria:**
  1. Lab results show as read-only data.
  2. A document the clinic uploaded can be opened in the app.

### R22: Prescriptions
- **Requirement:** Patients can view active and past e-prescriptions.
- **Why it matters:** MVP item 5.
- **Priority:** Must
- **Acceptance criteria:**
  1. Active and past prescriptions are listed.
  2. A cancelled prescription cannot be opened as a document (MOBILE_API.md: `409`).

## myclinicsoft: eMCR MVP requirements (payments, alerts and profile)

### R23: Invoices paid to the clinic's own account
- **Requirement:** Patients can view invoices and pay them into the clinic's or doctor's own payment account, never the platform's.
- **Why it matters:** MVP item 6; MOBILE_API.md: "Never the platform's account".
- **Priority:** Must
- **Acceptance criteria:**
  1. The pay link opens the clinic's own checkout or manual payment details.
  2. No patient payment goes to DevCom Digital's account.

### R24: Push notifications
- **Requirement:** Patients receive appointment reminders, result-ready alerts and queue-turn alerts by push.
- **Why it matters:** MVP item 7.
- **Priority:** Must
- **Acceptance criteria:**
  1. Each of the three alerts reaches a registered phone.
  2. Signing out removes the phone's push registration.

### R25: Profile and consent
- **Requirement:** Patients can edit basic profile details and record consent and Data Privacy Act acknowledgements.
- **Why it matters:** MVP item 8.
- **Priority:** Must
- **Acceptance criteria:**
  1. A patient can change basic profile details.
  2. A patient's consent acknowledgement is stored [TO CONFIRM: whether consent acknowledgements are built].

### R26: Device unlock
- **Requirement:** The app can be locked on the phone and unlocked with the device's own unlock method.
- **Why it matters:** MVP item 1 ("biometric unlock"); eMCR 1.1.4 describes App Lock.
- **Priority:** Should
- **Acceptance criteria:**
  1. App Lock covers every screen, including screens opened from links.

## myclinicsoft: eMCR privacy and selling requirements

### R27: Discreet lock-screen text
- **Requirement:** Push text on the lock screen never names the doctor, a medicine, an amount or an invoice number.
- **Why it matters:** MOBILE_API.md states it as a rule.
- **Priority:** Must
- **Acceptance criteria:**
  1. No push template contains a doctor's name, medicine, amount or invoice number.

### R28: No prices or "buy" wording in eMCR
- **Requirement:** eMCR never shows prices or "buy" wording; activation vouchers are sold at clinic counters.
- **Why it matters:** MOBILE_API.md; app store payment rules.
- **Priority:** Must
- **Acceptance criteria:**
  1. No eMCR screen shows a price or the word "buy".
  2. The activation screen only asks for a voucher code or QR scan.

### R29: Activation gate
- **Requirement:** When activation is enforced, the features listed in MOBILE_API.md answer "activation required", while profile, lists, notifications, clinics and family stay free.
- **Why it matters:** MOBILE_API.md, "Activation gate".
- **Priority:** Must
- **Acceptance criteria:**
  1. With enforcement on, booking, check-in, queue, health summary, documents, vitals, visit detail and lab-result detail show the "Enter activation code" screen without an active year.
  2. With enforcement off, everything stays open.

## myclinicsoft: MyClinicSoft Rep requirements

### R30: The rep app never sells
- **Requirement:** MyClinicSoft Rep never takes payment; "Ask for a payment link" opens a prefilled billing support request.
- **Why it matters:** rep/README.md: "The app never sells anything (App Store / Play payment rules)".
- **Priority:** Must
- **Acceptance criteria:**
  1. The app never calls the checkout endpoints.
  2. "Ask for a payment link" creates a billing support request.

### R31: Free visit log, paid clinic booking
- **Requirement:** Logging visits and products is always free; booking with clinics needs a rep plan, a team seat or booking being free; clinics never pay for rep visits.
- **Why it matters:** MOBILE_API.md and rep/README.md (see contradiction 19).
- **Priority:** Must
- **Acceptance criteria:**
  1. A rep without a plan can log visits and products.
  2. A rep without a plan or seat gets "subscription required" when booking, unless booking is free.
  3. No clinic is charged for a rep visit.

### R32: Daily rep reminders
- **Requirement:** A daily job at 10:00 UTC (18:00 Asia/Manila) sends each rep at most one push per kind for upcoming visits and products expiring within 30 days.
- **Why it matters:** MOBILE_API.md, "Push".
- **Priority:** Should
- **Acceptance criteria:**
  1. Each visit or product is reminded once, unless its date changes.
  2. Reps with notifications off get no push.

## myclinicsoft: SMS rule requirements

### R33: Clinic SMS rules in order
- **Requirement:** Every outbound text passes the clinic rules in this order: clinic and subscription active, the clinic's text switch, plan feature, opt-out, promotional consent, monthly quota.
- **Why it matters:** docs/SMS_TWILIO.md, "How it works".
- **Priority:** Must
- **Acceptance criteria:**
  1. A text to an opted-out number is blocked.
  2. A text beyond the monthly quota is blocked.

### R34: Message categories
- **Requirement:** Sign-in codes are never blocked or counted; promotional texts need consent, stop at 80% of quota and carry a stop link.
- **Why it matters:** docs/SMS_TWILIO.md.
- **Priority:** Must
- **Acceptance criteria:**
  1. A sign-in code is sent even when the quota is used up.
  2. Every promotional text carries a stop link.
  3. Promotional texts stop at 80% of the monthly quota.

### R35: SMS delivery log without bodies
- **Requirement:** The SMS delivery log is kept 60 days and stores no message bodies.
- **Why it matters:** docs/SMS_TWILIO.md.
- **Priority:** Must
- **Acceptance criteria:**
  1. No log entry holds message text.
  2. Entries older than 60 days are removed.

## myclinicsoft: SMS go-live requirements

### R36: Phone codes through Twilio Verify
- **Requirement:** In production, 6-digit phone codes go through Twilio Verify and last 10 minutes.
- **Why it matters:** docs/SMS_TWILIO.md: Verify is "Required in production".
- **Priority:** Must
- **Acceptance criteria:**
  1. Code sign-in works on the web and in eMCR on Globe, Smart and DITO handsets.
  2. A rollback to the local sender is documented (see "Going Live with SMS and Phone Codes").

### R37: SMS quotas from the confirmed rate
- **Requirement:** Monthly SMS quotas per plan are set from the confirmed Philippine rate.
- **Why it matters:** docs/SMS_TWILIO.md: "The current numbers are placeholders".
- **Priority:** Must
- **Acceptance criteria:**
  1. The confirmed rate is recorded [TO CONFIRM: Philippine SMS rate].
  2. The quotas in lib/subscription-packages.ts are updated from it.

### R38: Database indexes before deploy
- **Requirement:** Missing production database indexes are created before the SMS code is deployed.
- **Why it matters:** docs/SMS_TWILIO.md: without the unique usage index, "monthly usage is not capped".
- **Priority:** Must
- **Acceptance criteria:**
  1. The index check reports nothing missing in production before deploy [TO CONFIRM: whether indexes are built before or after deploying (contradiction 61)].

## myclinicsoft: Public site and configuration requirements

### R39: Bot check, shared rate limits and online payment in production
- **Requirement:** Production runs with Cloudflare Turnstile (both keys), Upstash Redis and PayMongo configured.
- **Why it matters:** docs/PUBLIC_SITE_FOLLOWUPS.md: with only one Turnstile key every public booking is refused; without Upstash, rate limits are per server instance; without PayMongo, plans cannot be paid online.
- **Priority:** Must
- **Acceptance criteria:**
  1. Public booking and registration work with the bot check on.
  2. Rate limits are shared across instances.
  3. A clinic can pay for a plan online.

### R40: Notice of term changes to all clinic administrators
- **Requirement:** Material changes to the Terms of Service are sent to every clinic administrator at least 15 days before they take effect.
- **Why it matters:** The Terms of Service promise it; docs/PUBLIC_SITE_FOLLOWUPS.md says it "needs a way to email all clinic admins".
- **Priority:** Must
- **Acceptance criteria:**
  1. A way exists to email all clinic administrators.

### R41: Conditions for re-enabling rep self sign-up
- **Requirement:** Rep self sign-up stays paused until the six items in docs/PUBLIC_SITE_FOLLOWUPS.md are done.
- **Why it matters:** They fix account creation, email squatting, account disclosure, payment retry, return URLs and success copy.
- **Priority:** Must
- **Acceptance criteria:**
  1. All six items are checked off before sign-up is switched back on.

## myclinicsoft: Backup and release requirements

### R42: Production backups and restore drill
- **Requirement:** Production uses Atlas Cloud Backup with the recommended policy, and a restore drill runs once and then quarterly.
- **Why it matters:** docs/BACKUP_RESTORE.md: "The app does not back itself up".
- **Priority:** Must
- **Acceptance criteria:**
  1. Cloud Backup is on, with snapshots every 6 hours, daily, weekly and monthly as recommended.
  2. A drill has been run and its restore time recorded (see "Running the Backup Restore Drill").
  3. Point-in-time restore covers at least 2 days.

### R43: Audit-log archive
- **Requirement:** Audit log entries older than about 90 days move to a private archive kept for 5 years [TO CONFIRM: log retention wording (contradiction 32)].
- **Why it matters:** docs/BACKUP_RESTORE.md, "Audit log archive".
- **Priority:** Must
- **Acceptance criteria:**
  1. An entry is deleted from the database only after its archive file was checked.

### R44: Backend before app release
- **Requirement:** The backend changes for an eMCR release are deployed before the store build.
- **Why it matters:** mobile/RELEASE_NOTES.md 1.1.3 and 1.1.4: "Deploy the backend first". There is no over-the-air update.
- **Priority:** Must
- **Acceptance criteria:**
  1. The backend is live in production before the store build is submitted.
  2. The Google Play "What's new" text is under 500 characters.

## myclinicsoft: Definition of done

The myclinicsoft project as a whole is done when every check below is answered yes [TO CONFIRM: definition of done]:

1. Every "Must" requirement in this document meets all its acceptance criteria.
2. The web platform runs in production with Turnstile, Upstash Redis and PayMongo configured (R39).
3. Atlas Cloud Backup is on and one restore drill has been run (R42).
4. SMS and phone codes are live through Twilio Verify (R36 to R38).
5. eMCR 1.1.4 is on Google Play [TO CONFIRM: whether iOS is part of done].
6. MyClinicSoft Rep is released [TO CONFIRM: whether the rep app release is part of done].
7. Every owner decision in docs/PUBLIC_SITE_FOLLOWUPS.md has an answer, recorded in "myclinicsoft: Decision Log".
8. Every requirement has a named owner role [TO CONFIRM: owner roles].

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | myclinicsoft: Project Brief; myclinicsoft: Decision Log; myclinicsoft: Risks, Assumptions and Constraints; Products and Services Catalogue; Systems Overview; Engineering Standards and Release Procedure; Going Live with SMS and Phone Codes; Running the Backup Restore Drill; Deleting a Closed Clinic's Data |

## Open questions

1. [TO CONFIRM: project scope] Is the project the whole MyClinicSoft platform, or a narrower piece of work such as the eMCR mobile rollout?
2. [TO CONFIRM: priorities] Priorities are derived from the wording of the sources, not set by the owner.
3. [TO CONFIRM: who performs the check] Who checks new features against the Data Privacy Act (R4)?
4. [TO CONFIRM: measurable targets per role] R9 has no measurable target in the material.
5. [TO CONFIRM: whether consent acknowledgements are built] MOBILE_ROADMAP.md MVP item 8 lists "consent/PH DPA acknowledgments"; no other source describes them in eMCR.
6. [TO CONFIRM: Philippine SMS rate] Needed to set quotas (R37).
7. [TO CONFIRM: definition of done], [TO CONFIRM: whether iOS is part of done], [TO CONFIRM: whether the rep app release is part of done] and [TO CONFIRM: owner roles].
8. [TO CONFIRM: owner role, effective date, review date] for this document.
9. Out of date: MOBILE_ROADMAP.md excludes "booking new appointments" from the MVP, but mobile/RELEASE_NOTES.md 1.0.0 lists "Book, view and cancel appointments" (contradiction 24). Booking is therefore not a requirement here; confirm whether it should be added.
10. Contradictory: MOBILE_ROADMAP.md MVP: "Lab results — read-only, PDF/document view"; MOBILE_API.md "Not built yet": "Lab-result PDFs" (contradiction 25). R21 asks only for the document view of uploaded files.
11. Out of date: MOBILE_ROADMAP.md: "long-lived (30-day) Bearer tokens", "No refresh-token rotation"; MOBILE_API.md: access token valid 7 days, refresh token valid 60 days, rotated on every refresh (contradiction 26). R16 and R17 follow MOBILE_API.md.
12. Out of date: MOBILE_ROADMAP.md and rep/README.md say Expo SDK 57 "(versions match eMCR)"; mobile/README.md and mobile/package.json use Expo SDK 58 (contradiction 27).
13. Contradictory: MOBILE_API.md says booking with clinics can be free because the platform's default rep fee is nothing (the figure is in "Products and Services Catalogue"); rep/README.md says booking needs "a rep plan (or a team seat)" with no free default (contradiction 19).
14. Contradictory: the plan limits for locations and support level in lib/subscription-packages.ts differ from the public pricing and FAQ pages (contradictions 5 and 6). R14 and R15 do not cover locations or support level.
15. Contradictory: docs/PUBLIC_SITE_FOLLOWUPS.md says "No tenant purge exists"; scripts/delete-tenant.ts deletes a clinic's data from the command line (contradiction 34). R5 may already be partly met.
16. Contradictory: the Privacy Policy says "Backups and logs are overwritten on a rolling basis"; lib/audit-archive.ts and docs/BACKUP_RESTORE.md keep audit-log archives for 5 years (contradiction 32).
17. Likely missing requirements (not added, because the material does not state them): uptime or response-time targets for the web platform; support response times; the eMCR iOS release; data export for every plan (contradiction 4); offline read-only caching for eMCR (MOBILE_ROADMAP.md phase 6 and risks table); rules for the MyClinicSoft public API (rate limit and webhook retries, which are in "Products and Services Catalogue"); BIR sales invoice rules (lib/bir.ts); test coverage goal (`__tests__/README.md` says "70%+ coverage"); encryption at rest (contradiction 29).
18. [TO CONFIRM: breach notice wording] docs/BACKUP_RESTORE.md: the NPC is notified "within 72 hours of discovery"; app/(public)/privacy/page.tsx: "within the periods set by its rules" (contradiction 31).
19. [TO CONFIRM: whether indexes are built before or after deploying] docs/SMS_TWILIO.md: run the index sync "Before deploying this code"; scripts/sync-indexes.ts: "run this after deploying a change that adds or removes an index"; docs/BACKUP_RESTORE.md: "After deploying" (contradiction 61). R38 follows docs/SMS_TWILIO.md.
20. Contradictory: MOBILE_API.md says the rep app opens the checkout URL "in the browser"; rep/README.md says the checkout endpoints "are not called" and the app opens a billing support request instead (contradiction 58). R30 follows rep/README.md.
