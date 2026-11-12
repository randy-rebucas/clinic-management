# myclinicsoft: Decision Log

## myclinicsoft: Decision log summary

myclinicsoft: Decision Log records the decisions already made in the myclinicsoft project (provisionally the MyClinicSoft web platform, the eMCR (Electronic MyClinic Record) patient app, the MyClinicSoft Rep app and the go-live work [TO CONFIRM: project scope]). It is for anyone who needs to know why the product works the way it does before proposing a change. Only decisions that the source files clearly state as made are recorded; each entry names its sources. The material never says who made a decision, so every "Decided by" is [TO CONFIRM]. The nine decisions cover the mobile strategy, repositories, real-time updates, payments, the removal of the web portals, selling in apps, refunds, public claims and rep self sign-up. Questions that are still undecided are listed under Open questions.

## myclinicsoft decision D1: Patient app first, web app kept for staff

- **Date:** 2026-09-21 (date of MOBILE_ROADMAP.md)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** DevCom Digital keeps the existing web app for clinic staff and builds a dedicated patient mobile app first, with a narrow staff app only as an optional later phase.
- **Reasons:** Patients are "the role with the clearest mobile-native use case". The staff surface is "too dense and desktop-oriented … to be worth re-platforming to mobile now" (MOBILE_ROADMAP.md).
- **Options rejected:** Porting the full admin surface (billing, inventory, reports, clinic settings) to mobile: "that stays web-only by design" (MOBILE_ROADMAP.md).
- **What it affects:** The eMCR app, built and released on Android (mobile/RELEASE_NOTES.md); the scope of any staff app (phase 8, separate track).
- **Status:** In force. MOBILE_ROADMAP.md states this as a recommendation; the patient app was then built, which shows it was acted on [TO CONFIRM: that the recommendation was formally adopted].

## myclinicsoft decision D2: Mobile apps in sibling repositories

- **Date:** [TO CONFIRM: date] (recorded in MOBILE_ROADMAP.md, section 9)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** The eMCR app lives in its own repository next to the web platform, "chosen over a subfolder"; MyClinicSoft Rep also has its own repository.
- **Reasons:** "to keep the RN/Expo toolchain out of the Next.js repo" (MOBILE_ROADMAP.md).
- **Options rejected:** A subfolder inside the web platform repository, for the reason above.
- **What it affects:** Builds and releases run per app. MyClinicSoft Rep copied eMCR's shared code "on purpose (no shared package yet)" (rep/README.md), so that code exists in both app repositories.
- **Status:** In force.

## myclinicsoft decision D3: Socket.IO removed, polling used instead

- **Date:** [TO CONFIRM: date] (recorded in MOBILE_ROADMAP.md, prepared 2026-09-21)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** The Socket.IO real-time server was deleted, and both the web app and the mobile apps refresh data by polling.
- **Reasons:** The custom Socket.IO server "could not run on Vercel and no API route ever emitted events, so the real-time channel was dead code". Keeping a socket alive across phone background and foreground states is "materially harder than a 15-second foreground poll" (MOBILE_ROADMAP.md).
- **Options rejected:** The "earlier socket-auth fix", which this decision supersedes (MOBILE_ROADMAP.md).
- **What it affects:** Live queue updates use polling; "Push-triggered refresh is the natural next step" (MOBILE_ROADMAP.md).
- **Status:** In force.

## myclinicsoft decision D4: PayPal removed, subscriptions in pesos through PayMongo

- **Date:** [TO CONFIRM: date] (after 2026-04-04, when AUDIT.md still listed the PayPal SDK)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** PayPal was removed; clinic subscriptions are paid in Philippine pesos only, through PayMongo.
- **Reasons:** [TO CONFIRM: reasons] (not stated in the material).
- **Options rejected:** PayPal, for reasons not stated.
- **What it affects:** If PayMongo is not configured in production, "plans can't be paid for online" (docs/PUBLIC_SITE_FOLLOWUPS.md). Patient invoices are paid into the clinic's own payment account, not the platform's (MOBILE_ROADMAP.md; MOBILE_API.md).
- **Status:** In force.

## myclinicsoft decision D5: Patient and rep web portals removed

- **Date:** 2026-10-18
- **Decided by:** [TO CONFIRM: role]
- **Decision:** The web portals for patients and for medical representatives were removed; patients and medical representatives use the mobile apps only.
- **Reasons:** [TO CONFIRM: reasons] (not stated in the material).
- **Options rejected:** The earlier position "Medical representative portal: out of scope" of the mobile work, which this decision supersedes (MOBILE_ROADMAP.md).
- **What it affects:** "The staff web login now refuses rep accounts and points them to the app" (MOBILE_API.md). Rep registration "stays on the web" (MOBILE_API.md), although that registration is now paused (see decision D9; contradiction 57). PRODUCT.md and DESIGN.md still describe the portals and are out of date (contradiction 15).
- **Status:** In force.

## myclinicsoft decision D6: The mobile apps never sell anything

- **Date:** [TO CONFIRM: date]
- **Decided by:** [TO CONFIRM: role]
- **Decision:** Neither eMCR nor MyClinicSoft Rep takes payment: eMCR activation vouchers are sold at clinic counters, and medical representatives pay on the web.
- **Reasons:** App Store and Google Play payment rules (rep/README.md).
- **Options rejected:** Calling the backend checkout endpoints from MyClinicSoft Rep: "not called"; "Ask for a payment link" opens a prefilled billing support request instead (rep/README.md).
- **What it affects:** eMCR shows no prices or "buy" wording (MOBILE_API.md). MyClinicSoft Rep shows plan status and prices but no checkout (rep/README.md). When the web has a page where a rep can pay, the rep app's buttons will point there.
- **Status:** In force.

## myclinicsoft decision D7: Payments are non-refundable

- **Date:** 2026-10-22 (Terms of Service update)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** "All payments are final and non-refundable, including for unused time in a billing period, downgrades, and accounts closed early, except where Philippine law requires otherwise" (terms page). eMCR vouchers are also non-refundable and cannot be exchanged for cash.
- **Reasons:** Clinics can "use the free trial to decide whether the Service fits your clinic before you pay" (terms page).
- **Options rejected:** Proration; the claim was removed from the public site (docs/PUBLIC_SITE_FOLLOWUPS.md).
- **What it affects:** Pricing, FAQ and terms pages; support answers on refunds. The code still removes paid time when PayMongo reports a full refund or chargeback (contradiction 11).
- **Status:** In force.

## myclinicsoft decision D8: Unbacked public claims removed

- **Date:** 2026-10-22 (public-site audit)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** The public site no longer makes claims the service cannot back: 24/7 support, phone and chat support, proration, add-ons, multi-location, white-label, "DPA compliant", fake testimonials, unsourced usage figures and uptime figures.
- **Reasons:** PRODUCT.md: no testimonials, case studies or pricing figures are on hand, and "future work must not fabricate these".
- **Options rejected:** Keeping the claims.
- **What it affects:** All public pages; wording rules in "Brand Voice and Writing Style Guide". Enterprise support is now described as "agreed in your contract" until the owner decides real terms.
- **Status:** In force.

## myclinicsoft decision D9: Rep self sign-up paused

- **Date:** [TO CONFIRM: date] (listed as done in docs/PUBLIC_SITE_FOLLOWUPS.md, from the 2026-10-22 audit)
- **Decided by:** [TO CONFIRM: role]
- **Decision:** Medical representatives cannot register themselves on the website; clinics that already work with a rep can still add them.
- **Reasons:** Six items must be done first, including creating the rep's account after payment, email squatting, revealing that an email belongs to a staff account, and retrying a failed payment (docs/PUBLIC_SITE_FOLLOWUPS.md).
- **Options rejected:** Keeping sign-up open with those problems.
- **What it affects:** The registration page says registration "is paused while we build it"; the home page says "Rep app: coming soon".
- **Status:** In force until the six items are done.

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | myclinicsoft: Project Brief; myclinicsoft: Requirements and Acceptance Criteria; myclinicsoft: Stakeholders and Communication Plan; myclinicsoft: Risks, Assumptions and Constraints; Products and Services Catalogue; Pricing and Discount Rules; Brand Voice and Writing Style Guide; Systems Overview |

## Open questions

1. [TO CONFIRM: project scope] Whole MyClinicSoft platform, or a narrower piece of work?
2. [TO CONFIRM: role] Who made each of decisions D1 to D9?
3. [TO CONFIRM: date] for D2, D3, D4, D6 and D9.
4. [TO CONFIRM: reasons] for D4 (PayPal removed) and D5 (web portals removed).
5. [TO CONFIRM: that the recommendation was formally adopted] for D1.
6. [TO CONFIRM: owner role, effective date, review date] for this log.
7. Undecided: the open owner decisions in docs/PUBLIC_SITE_FOLLOWUPS.md: NPC registration; a named Data Protection Officer and whether to publish the name; Enterprise support hours and response times; disclosing the eMCR activation fee before enforcement; confirming encryption at rest for the production database.
8. Undecided: whether to build the optional staff quick-access app (MOBILE_ROADMAP.md phase 8).
9. Undecided: which other automations should send push notifications; MOBILE_ROADMAP.md says each "should get a product decision".
10. Undecided: when to switch on eMCR activation enforcement, and the release dates for eMCR on iOS and for MyClinicSoft Rep.
11. Undecided: how production backups will meet the policy in docs/BACKUP_RESTORE.md, which needs an M10 or larger cluster (contradiction 30).
12. Possible further decisions stated as made in the material but not yet logged, for the owner to confirm: `proxy.ts` kept and not renamed, because it is the correct convention (MOBILE_ROADMAP.md; contradiction 37); the old nightly backup job removed "because it saved nothing" (docs/BACKUP_RESTORE.md); `robots.ts` keeps blocking payment and install pages "on purpose" (docs/PUBLIC_SITE_FOLLOWUPS.md); medicine-taking reminders scheduled on the phone, not pushed (MOBILE_API.md).
13. Contradictory (D7): the terms, pricing and FAQ pages say payments are non-refundable; lib/subscription.ts removes paid time on a full PayMongo refund or chargeback (contradiction 11).
14. Contradictory (D5): PRODUCT.md and DESIGN.md still describe the patient and rep web portals; MOBILE_API.md says they were removed (contradiction 15). MOBILE_ROADMAP.md also keeps the web app "for … medical reps", while MOBILE_API.md says the staff web login refuses rep accounts (contradiction 16).
15. Contradictory (D9): MOBILE_API.md says rep "Registration stays on the web (`/medical-representatives/onboard`, which needs payment)"; that page says registration "is paused" (contradiction 57; see also contradiction 17).
16. Contradictory (D4): AUDIT.md (2026-04-04) lists "Payments | PayPal SDK"; docs/PUBLIC_SITE_FOLLOWUPS.md says PayPal was removed (contradiction 36). AUDIT.md is out of date.
17. Contradictory (D6): MOBILE_API.md tells the rep app to open the checkout URL "in the browser"; rep/README.md says the checkout endpoints "are not called" and the app opens a billing support request instead (contradiction 58). D6 follows rep/README.md.
