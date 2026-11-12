# Onboarding a New Clinic

## Summary

The procedure "Onboarding a New Clinic" describes how a new clinic gets a MyClinicSoft account and starts its Free trial. It is for the support team, platform admins and the engineer who may set up a clinic by hand. The normal path is self-service: a clinic administrator registers the clinic on the public sign-up page, receives an email link, sets a password and starts a 14-day Free trial [TO CONFIRM: trial length (contradictions 12 and 42)] with no credit card. A second, command-line path (`pnpm tenant:onboard`) exists for staff, but it uses different defaults (a 7-day trial, UTC time and USD currency) and is kept under [TO CONFIRM] until the owner decides when it may be used. The procedure also covers help with importing existing records and the trial-expiry warnings sent 3 days and 1 day before the trial ends.

## Purpose

The purpose of the procedure "Onboarding a New Clinic" is to give every new clinic a working account with the right time zone and currency, a clinic administrator who can sign in, and a clear path from the Free trial to a paid plan. Plan limits and prices are not repeated here; they are in "Products and Services Catalogue".

## When the clinic onboarding procedure applies

The clinic onboarding procedure applies when:

- a clinic owner or administrator wants to start using MyClinicSoft;
- a clinic asks the support team for help signing up, or for help bringing existing records over;
- a clinic in its Free trial needs more time (trial extension by a platform admin).

The clinic onboarding procedure does not apply to:

- patients registering with a clinic (the public page `/onboard` is patient registration, not clinic sign-up);
- patients joining eMCR, and medical representatives (rep registration is paused);
- an existing clinic adding staff, which the clinic administrator does inside the clinic account;
- closing a clinic or deleting its data (see "Deleting a Closed Clinic's Data").

## Roles involved in onboarding a new clinic

| Role | Responsibility |
|---|---|
| Clinic administrator | Registers the clinic, sets the password from the emailed link, checks time zone and currency, adds staff, chooses a plan before the trial ends |
| Support team | Answers sign-up questions through support@myclinicsoft.solutions or support requests, collects records for import, escalates problems [TO CONFIRM: company role title] |
| Platform admin | Views new clinics in Platform → Clinics, extends a trial, suspends or reactivates a clinic, approves use of the command-line path |
| Engineer | Runs the command-line path when it is approved, and imports existing records [TO CONFIRM: company role title and who does imports] |

## Inputs needed before starting a clinic onboarding

| Input | Required | Notes |
|---|---|---|
| Clinic name | Yes | Shown in the account; an optional display name can be added |
| Subdomain | Yes | The clinic's own web address. 2–63 characters, lowercase letters, numbers and hyphens; must not be taken or reserved (for example "admin", "support", "billing", "emcr", "myclinicsoft") |
| Clinic administrator's full name and email | Yes | The email must not already belong to a MyClinicSoft account |
| Clinic contact email, phone and address | No | Optional on the form |
| Time zone, currency, date format | No | The form tries to fill them from the visitor's country; for Philippine clinics they should be Asia/Manila and PHP |
| Existing records to import | No | For example CSV or Excel exports (faq page) |

## Procedure: self-service sign-up (normal path)

1. The clinic administrator opens the public page "Register Your Clinic" (`/tenant-onboard`) on the MyClinicSoft website. System: MyClinicSoft web app.
2. The clinic administrator enters the clinic name. The subdomain is filled in from the name and can be changed. MyClinicSoft checks it when the form is sent. If the subdomain is taken or reserved, then the clinic administrator chooses another one and repeats step 2.
3. The clinic administrator enters optional contact details and checks the settings. If the clinic is in the Philippines and the time zone or currency shown is not Asia/Manila and PHP, then the clinic administrator changes them before going on, because the server falls back to UTC and USD when no value is sent.
4. The clinic administrator enters their own full name and email and selects "Create Clinic". When the Cloudflare Turnstile bot check is switched on, it must be passed first (Turnstile is pending, so it may not show). The sign-up form accepts 10 attempts per 15 minutes from one IP address.
5. MyClinicSoft creates the clinic with a 14-day Free trial, the six clinic roles (Administrator, Doctor, Nurse, Receptionist, Accountant, Medical technologist), the clinic settings and the clinic administrator account, and emails a set-password link. The page shows "Check your email". System: MyClinicSoft and Resend.
6. If the email address already has a MyClinicSoft account, then no clinic is created; the page still shows "Check your email", and the owner of that address receives "You already have a MyClinicSoft account". The support team helps the person sign in or use "Forgot password".

## Procedure: first sign-in after self-service sign-up

The first sign-in after self-service sign-up continues from step 6 of "Procedure: self-service sign-up (normal path)".

7. The clinic administrator opens the link within 72 hours, sets a password and signs in at the clinic's subdomain. If the link has expired or never arrived, then go to "Exceptions in clinic onboarding".
8. The clinic administrator checks Settings (time zone, currency, clinic details) and adds staff. System: MyClinicSoft web app.
9. If the clinic wants existing records imported, then go to "Procedure: help with importing existing records".
10. Before the trial ends, the clinic administrator chooses a plan in Admin → Subscription (`/admin/subscription`) and pays through PayMongo. Plans are listed in "Products and Services Catalogue".

## Procedure: command-line set-up (staff path)

The command-line set-up is a script in the main repository, `scripts/onboard-tenant.ts`, run with `pnpm tenant:onboard`. Its use for real clinics is [TO CONFIRM: whether and when the command-line path may be used instead of self-service].

1. The engineer gets a platform admin's approval to set up the clinic by hand [TO CONFIRM: who approves]. System: [TO CONFIRM: where the approval is recorded].
2. The engineer runs the script against production with `pnpm prod tenant:onboard`. A plain `pnpm tenant:onboard` uses the local development database. `pnpm prod` asks for confirmation before it runs.
3. The engineer answers the prompts: clinic name, display name, subdomain, contact details, address, time zone, currency, date format, clinic administrator name and email, and a password of at least 8 characters.
4. The engineer types "Asia/Manila" for the time zone and "PHP" for the currency. The script's defaults are UTC and USD [TO CONFIRM: correct defaults (contradictions 12 and 43)].
5. If the script says the email is already registered, then the engineer stops and goes back to the self-service path or asks the clinic for another email.
6. The script creates the clinic with a 7-day trial [TO CONFIRM: 7 days in the script against 14 days everywhere else (contradiction 12)]. The engineer then asks a platform admin to extend the trial by 7 days in Platform → Clinics so the clinic gets the published 14 days [TO CONFIRM: whether this correction is wanted].
7. The engineer gives the clinic administrator the sign-in details through [TO CONFIRM: a secure way to hand over the password], and the clinic administrator changes the password at first sign-in [TO CONFIRM].
8. The clinic administrator continues from step 8 in "Procedure: first sign-in after self-service sign-up".

## Procedure: help with importing existing records

For help with importing existing records, the FAQ promises: "Send us your existing records — for example as CSV or Excel exports — and we'll help you bring them over. Larger migrations from other systems are handled together with our team." No self-service import tool was found in the source files.

1. The clinic administrator sends the support team a support request (Admin → Support) or an email to support@myclinicsoft.solutions asking for an import.
2. The support team confirms what records are involved and how they will be sent [TO CONFIRM: approved secure transfer method for patient records].
3. The support team passes the request to the engineer [TO CONFIRM: who imports, with which tool, and whether a fee applies to larger migrations].
4. The engineer imports the records into the clinic's account and the clinic administrator checks a sample.
5. The support team closes the support request and records the result.

Handling of patient data during import follows "Data Handling and Confidentiality".

## Trial expiry warnings and the end of the Free trial

A scheduled job runs every day at 22:00 UTC (06:00 Asia/Manila). For each clinic in its Free trial, MyClinicSoft emails every clinic administrator and adds an in-app notification 3 days and 1 day before the trial ends, each warning once, with a link to Admin → Subscription. When the trial end has passed, the same job marks the trial as expired and sends "Trial Period Expired - Action Required" to every clinic administrator; access is then limited until a plan is bought. The email text says "7-day trial period" although the self-service trial is 14 days [TO CONFIRM: correct the email wording (contradiction 42)].

## Approvals required for clinic onboarding

| What | Who approves | Limit |
|---|---|---|
| Self-service sign-up | None | Every clinic can start one Free trial [TO CONFIRM: whether one clinic may start more than one trial] |
| Using the command-line path for a real clinic | Platform admin [TO CONFIRM] | [TO CONFIRM] |
| Extending a trial | Platform admin (Platform → Clinics → "Extend the current period") | The system accepts 1–365 days per change [TO CONFIRM: policy limit and who may approve longer extensions] |
| Importing records for a clinic | [TO CONFIRM: approving role] | [TO CONFIRM: size or cost limit for "larger migrations"] |

## Exceptions in clinic onboarding

| Situation | What to do |
|---|---|
| Set-password email did not arrive | The clinic administrator checks the spam folder. The support team checks that email sending works [TO CONFIRM: how support re-sends a set-password link] |
| Set-password link has expired | The clinic administrator uses "Forgot password" on the sign-in page [TO CONFIRM: that this works for an account whose password was never set] |
| Wrong time zone or currency chosen | The clinic administrator corrects it in Settings before entering bills |
| Subdomain wanted is taken or reserved | The clinic chooses another; a reserved word cannot be released |
| Clinic needs more trial time | A platform admin extends the trial in Platform → Clinics; the change is written to the audit log |
| Sign-up looks fraudulent or abusive | A platform admin suspends the clinic in Platform → Clinics; every staff member is signed out at once |
| Clinic has several locations | Each location runs as its own MyClinicSoft account today (faq page; contradiction 5) |

## Outputs of clinic onboarding and where they are recorded

| Output | Where it is recorded |
|---|---|
| Clinic account, subdomain and trial end date | MyClinicSoft database; visible to platform admins in Platform → Clinics |
| Six clinic roles with permissions, clinic settings, clinic administrator account | MyClinicSoft database |
| Set-password email | Resend |
| Trial extensions, suspensions and reactivations | Audit log, with the platform admin's email and any reason given (the console does not ask for one) |
| Import request and result | Support request (SR-XXXXXX) |

## Time targets for clinic onboarding

| Step | Target |
|---|---|
| Self-service sign-up | A few minutes ("basic setup takes a few minutes", faq page) |
| Set-password link | Must be used within 72 hours |
| Free trial | 14 days from sign-up (7 days on the command-line path) [TO CONFIRM: trial length (contradictions 12 and 42)] |
| Trial warnings | 3 days and 1 day before the trial ends |
| Reply to sign-up or import questions | [TO CONFIRM: response target] within support hours (see "Company Overview", section "Working hours, time zone and currency") |
| Completing an import | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Products and Services Catalogue; Customer Support Playbook; Handling a Clinic Support Request; Data Handling and Confidentiality; Deleting a Closed Clinic's Data; Systems Overview; Customer FAQ; Company Overview |

## Open questions

1. Company role titles for the support team and the engineer, and who imports records.
2. Trial length (contradiction 12): `app/api/tenants/onboard/route.ts` and the terms page give 14 days (`+ 14`); `scripts/onboard-tenant.ts` gives `+ 7 // 7 days from now`. Should the script be changed, and should platform admins extend command-line trials by 7 days meanwhile?
3. Default time zone and currency (contradictions 12 and 43): `scripts/onboard-tenant.ts` defaults to "UTC" and "USD"; `app/api/tenants/onboard/route.ts` also falls back to "UTC" and "USD" when the form sends no value, while `components/TenantOnboardClient.tsx` starts the form at "UTC" and "PHP" and then fills values from the visitor's detected country. Should the defaults be Asia/Manila and PHP?
4. Trial length in emails (contradiction 42): `lib/automations/trial-expiration.ts` emails say "Your 7-day trial period … will end soon" and "Your 7-day trial period … has ended", while self-service trials last 14 days (`app/api/tenants/onboard/route.ts`; `app/(auth)/tenant-onboard/page.tsx` "free 14-day MyClinicSoft trial").
5. Two set-up paths (contradiction 44): `scripts/onboard-tenant.ts` creates a seventh "medical-representative" role and five default medicines, uses a shorter reserved-subdomain list, has the engineer type the administrator's password, and, if the email already exists, overwrites that user's password and moves the user into the new clinic. `app/api/tenants/onboard/route.ts` creates six roles, refuses an existing email, and sends a set-password link instead. Which behaviour is intended?
6. Sign-up rate limit (contradiction 45): the code comment in `app/api/tenants/onboard/route.ts` says "5 attempts per 15 minutes per IP"; the limiter it uses (`lib/middleware/rate-limit.ts`, `auth`) allows 10.
7. Page naming: the public page `/onboard` (`app/(public)/onboard/page.tsx`) is "Patient Registration", not clinic sign-up; clinic sign-up is `/tenant-onboard` (`app/(auth)/tenant-onboard/page.tsx` with `components/TenantOnboardClient.tsx`).
8. Whether and when the command-line path may be used, who approves it, and where the approval is recorded.
9. How the command-line password is handed to the clinic administrator securely, and whether it must be changed at first sign-in.
10. Approved secure transfer method for records sent for import, the import tool, and any limit or fee for "larger migrations".
11. Whether one clinic may start more than one Free trial, and the policy limit for trial extensions (the system allows 1–365 days per change).
12. How the support team re-sends a set-password link, and whether "Forgot password" works before a password was ever set.
13. Whether a new subdomain needs a DNS step in production; `scripts/onboard-tenant.ts` prints "Configure DNS (production)" as a next step.
14. Response and completion targets for sign-up and import questions.
15. What the Free trial includes (contradiction 3): kept in "Products and Services Catalogue".
16. Effective date, review date and owner role of this document.
