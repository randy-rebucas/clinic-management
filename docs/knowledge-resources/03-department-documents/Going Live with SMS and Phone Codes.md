# Going Live with SMS and Phone Codes

## Summary

"Going Live with SMS and Phone Codes" is the procedure for switching MyClinicSoft's text messages and phone sign-in codes on in production through Twilio. It is written for the engineers who operate production and the people who tell clinics about the change. The go-live runs in three stages: database work before the code is deployed, checks and gradual rule enforcement after it is deployed, and the registered sender once Twilio approves it. Every step is a setting change that can be reverted on its own. As of `docs/SMS_TWILIO.md` (last changed 2026-11-06), SMS is built but not yet live [TO CONFIRM: go-live date].

## Purpose

The purpose of "Going Live with SMS and Phone Codes" is to start real texting without blocking sign-ins, without sending texts that clinic rules forbid, and without leaving the monthly SMS quota uncapped. The source runbook is `docs/SMS_TWILIO.md`, section "Going live".

The SMS system that the go-live switches on, as described in `docs/SMS_TWILIO.md`, has these parts:

| Part | What it does |
|---|---|
| Outbound texts (`lib/sms.ts`) | Every text names its clinic, a category and a template |
| Clinic rules (`lib/sms-policy.ts`) | Checked in this order: clinic and subscription active, the clinic's text switch, plan feature, opt-out, promotional consent, monthly quota |
| Categories | `auth` (codes; never blocked or counted), `transactional`, `promotional` (needs consent, stops at 80% of quota, carries a stop link) |
| Phone codes (`lib/otp.ts`) | Sent through Twilio Verify in production (code lifetime: see "Time targets") |
| Delivery log (`SmsMessage`) | Kept 60 days, with no message bodies; only failures are written back |
| Preferences (`SmsPreference`) | Kept by phone number; a row with no clinic means every clinic |

Patients cannot reply to an alphanumeric sender. STOP and START replies only work if an inbound long code is pointed at `/api/webhooks/twilio`.

## When this procedure applies (and when it does not)

The go-live procedure applies once, to the first production rollout of Twilio texts and Twilio Verify phone codes, and again if the steps are rolled back and repeated.

The go-live procedure does not apply to:

| Situation | Where it is covered |
|---|---|
| A patient or clinic asking to stop texts | "Handling an SMS Opt-Out" |
| Database migrations in general | "Running a Production Data Migration" |
| Choosing SMS quotas per plan as a commercial decision | "Products and Services Catalogue" [TO CONFIRM: who decides quotas] |
| Local development, where codes appear in the development server log | `docs/SMS_TWILIO.md`; `.env.example` |

## Roles involved

| Role | Responsibility |
|---|---|
| Operator [TO CONFIRM: role title] | An engineer with access to Vercel environment variables, the Twilio account and the production settings file; runs the steps |
| Release approver [TO CONFIRM: role title] | Decides to start each stage and to switch on enforcement |
| Testers [TO CONFIRM: who] | Sign in with codes on Globe, Smart and DITO handsets |
| Platform admin or support team | Tells clinics that promotional texts need consent [TO CONFIRM: who sends the notice and how] |
| Commercial owner [TO CONFIRM: role title] | Confirms the Philippine SMS rate used to set plan quotas |

## Inputs needed before starting

1. Access to the Twilio account (the Verify Service is created in step 3).
2. Access to Vercel production environment variables.
3. The production settings file `.env.prod.local`, used by `pnpm prod <script>`.
4. Handsets on Globe, Smart and DITO for sign-in tests.
5. The confirmed Philippine per-text rate, to set quotas [TO CONFIRM: rate].
6. For stage 3: Twilio's approval of the registered alphanumeric sender on a Messaging Service, plus Cloudflare Turnstile keys and Upstash Redis for production [TO CONFIRM: sender registration status; Turnstile keys are pending].

The environment variables involved are `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_MESSAGING_SERVICE_SID`, `OTP_PROVIDER`, `SMS_POLICY_MODE`, `REQUIRE_PUBLIC_PHONE_VERIFICATION` and `NEXT_PUBLIC_APP_URL` (which must be the public `https://` address for delivery callbacks and stop links).

## Procedure: stage 1, before deploying the SMS code

1. **Operator (command line):** runs `pnpm prod db:indexes` to list missing indexes, then `pnpm prod db:indexes --apply` [TO CONFIRM: whether indexes are built before or after the deploy (contradiction 61)]. Production does not build indexes by itself. The monthly quota depends on the unique index on `SmsUsage`: without it, monthly usage is not capped. The `OtpChallenge` expiry index also needs it.
2. **Operator (command line):** runs `pnpm prod db:migrate:sms-enabled` (dry run), checks the count of clinics whose text switch will be turned on, then runs it again with `--apply`. See "Running a Production Data Migration" for how production scripts are run.
3. **Operator (Twilio, Vercel):** creates a Verify Service with 6-digit codes and sets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` in production. If these are missing, phone-code sign-in answers 503 and the app shows its maintenance screen. If Verify is not ready, then set `OTP_PROVIDER=local` to send codes through the normal sender for now.
4. **Release approver:** approves the deploy; the operator deploys the code (see "Engineering Standards and Release Procedure").

## Procedure: stage 2, after deploying

5. **Testers (web app and eMCR):** sign in with a phone code on the web and in the app, on Globe, Smart and DITO handsets. If codes do not arrive, then the operator sets `OTP_PROVIDER=local` to roll back and the stage stops here.
6. **Operator (Vercel logs):** leaves `SMS_POLICY_MODE` unset for a few days [TO CONFIRM: exact number of days]. With it unset, rules only log. The operator searches the logs for `SMS policy would block`, grouped by `reason`, and reports the result to the release approver.
7. **Operator (code change):** sets plan quotas (`maxSmsPerMonth` in `lib/subscription-packages.ts`) from the confirmed Philippine rate. The current numbers are placeholders. This is a code change and goes through a pull request.
8. **Platform admin or support team:** tells clinics that promotional texts need the patient's consent [TO CONFIRM: channel and wording].
9. **Operator (Vercel), with release approver approval:** sets `SMS_POLICY_MODE=enforce`.

## Procedure: stage 3, once the sender is approved

10. **Operator (Vercel):** sets `TWILIO_MESSAGING_SERVICE_SID`. The Messaging Service takes priority over `TWILIO_PHONE_NUMBER`.
11. **Testers:** test texts on Globe, Smart and DITO handsets. If texts fail, then the operator removes `TWILIO_MESSAGING_SERVICE_SID` [TO CONFIRM: rollback for this step is implied, not written].
12. **Operator (Vercel):** turns on Cloudflare Turnstile (both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`) and Upstash Redis, if they are not already on, then sets `REQUIRE_PUBLIC_PHONE_VERIFICATION=true` so online booking and self-registration confirm the phone by code.

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Starting each stage | Release approver [TO CONFIRM: role title] | [TO CONFIRM] |
| Switching `SMS_POLICY_MODE=enforce` | Release approver [TO CONFIRM] | After the log review in step 6 |
| Plan quotas | [TO CONFIRM: commercial owner] | Based on the confirmed rate |
| Twilio spending | [TO CONFIRM: role] | [TO CONFIRM: monthly spending limit in ₱ or USD] |

No written rule states who approves these steps.

## Exceptions and what to do

| Exception | What to do |
|---|---|
| Codes do not arrive after deploy | Set `OTP_PROVIDER=local` (rollback); investigate before trying Verify again |
| Too many texts would be blocked in the log review | Do not enforce; review the `reason` counts first |
| Only `TURNSTILE_SECRET_KEY` is set | Every public booking is refused; set both Turnstile keys together (`.env.example`) |
| Public phone codes in production without Turnstile | Public phone codes refuse to send (`docs/PUBLIC_SITE_FOLLOWUPS.md`); complete step 12 in order |
| Open behaviour of Twilio Verify | Check with real traffic: whether a resend extends the code lifetime, the response to a wrong code, and how Verify binds to the registered sender |

## Outputs and where they are recorded

| Output | Where recorded |
|---|---|
| Indexes created and migration counts | Operator's run notes [TO CONFIRM: where run notes are kept] |
| Environment variables set | Vercel project settings |
| Log review result (blocks by `reason`) | [TO CONFIRM: where] |
| Quota values | `lib/subscription-packages.ts`, through a pull request |
| Notice to clinics | [TO CONFIRM: where] |

After Verify has run cleanly, a later cleanup removes the old code fields (`otp`, `otpExpiry`, `otpAttempts`) from `Patient` and `EmcrAccount` off-peak, keeping the names in the `lib/backups.ts` and `lib/patient-erasure.ts` lists [TO CONFIRM: when].

## Time targets

| Target | Value | Source |
|---|---|---|
| Phone code lifetime | 10 minutes | `docs/SMS_TWILIO.md` |
| Log-only period before enforcing | "a few days" [TO CONFIRM: number of days] | `docs/SMS_TWILIO.md` |
| Go-live date | [TO CONFIRM] | |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Handling an SMS Opt-Out; Running a Production Data Migration; Engineering Standards and Release Procedure; Systems Overview; Products and Services Catalogue |

## Open questions

1. SMS go-live date.
2. Status of Twilio sender registration, and the Cloudflare Turnstile keys (pending).
3. Role titles for the operator, the release approver and the commercial owner; who tests on handsets.
4. Who tells clinics that promotional texts need consent, through which channel, and with what wording.
5. The confirmed Philippine per-text rate, the real plan quotas (`maxSmsPerMonth` values are placeholders), and who decides them.
6. Monthly Twilio spending limit and who approves it.
7. How many days "a few days" of log-only mode means.
8. Rollback for the registered sender step (step 11) is implied, not written down.
9. Where run notes, the log review and the clinic notice are recorded.
10. When the old code fields are cleaned up.
11. `app/(public)/privacy/page.tsx` lists Twilio as a sub-processor for "SMS reminders and one-time sign-in codes" while `docs/SMS_TWILIO.md` says SMS is not yet live (contradiction 33).
12. `README.md` ("SMS functionality will work without Twilio credentials but will only log messages") describes development behaviour; in production, phone-code sign-in answers 503 without the Verify settings (`docs/SMS_TWILIO.md`). Not a contradiction, but readers should not apply the README note to production.
13. Index timing: `docs/SMS_TWILIO.md` says to run `pnpm prod db:indexes --apply` "Before deploying this code"; `scripts/sync-indexes.ts` says "run this after deploying a change that adds or removes an index"; `docs/BACKUP_RESTORE.md` says "After deploying" (contradiction 61). This procedure follows `docs/SMS_TWILIO.md` until the owner decides.
14. Public pages already promise texts: `app/(public)/faq/page.tsx` "The clinic confirms your request by SMS" and `pricing/page.tsx` "SMS and email reminders" in every plan, while `docs/SMS_TWILIO.md` describes SMS as not yet live (contradiction 50).
