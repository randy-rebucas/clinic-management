# SMS and phone codes (Twilio)

How texts and sign-in codes work, and how to take them live.

## How it works

- **Outbound texts** go through `sendSMS` (`lib/sms.ts`). Each call names its clinic, a `category` and a `template`.
- **Clinic rules** live in `lib/sms-policy.ts`, in this order: clinic and subscription active, the clinic's text switch, plan feature, opt-out, promotional consent, monthly quota.
- **Categories:** `auth` (codes; never blocked or counted), `transactional`, `promotional` (needs consent, stops at 80% of quota, carries a stop link).
- **Phone codes** live in `lib/otp.ts`. `OtpChallenge` records what a code is for, because Twilio Verify only knows the number.
- **Delivery log:** `SmsMessage`, kept 60 days, with no message bodies. Only failures are written back, so `sent` means no failure was reported.
- **Preferences:** `SmsPreference`, kept by phone number. No clinic on a row means every clinic.

Patients can't reply to an alphanumeric sender. They stop texts through the link on promotional texts, the eMCR notification settings, or by asking the clinic. STOP and START replies only work if an inbound long code is pointed at `/api/webhooks/twilio`.

## Environment variables

| Variable | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Account credentials. The token also checks webhook signatures |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service holding the registered sender. Wins over `TWILIO_PHONE_NUMBER` |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service, 6-digit codes |
| `OTP_PROVIDER` | `verify`, or unset to send codes through `sendSMS` |
| `SMS_POLICY_MODE` | `enforce`, or unset to only log what would be blocked |
| `REQUIRE_PUBLIC_PHONE_VERIFICATION` | `true` makes `/book` and `/onboard` confirm the phone by code |
| `NEXT_PUBLIC_APP_URL` | Must be the public `https://` URL, for delivery callbacks and stop links |

## Going live

Run these in order. Each env change can be reverted on its own.

**Before deploying this code**

1. `pnpm prod db:indexes` to see what is missing, then `pnpm prod db:indexes --apply`. Production doesn't build indexes by itself, and the quota depends on the unique index on `SmsUsage`: without it, monthly usage is not capped. The `OtpChallenge` TTL index also needs it.
2. `pnpm prod db:migrate:sms-enabled`, check the count, then again with `--apply`.

**After deploying**

3. Sign in with a code on the web and in the app. Codes last 10 minutes now.
4. Leave `SMS_POLICY_MODE` unset for a few days. Search the logs for `SMS policy would block`, grouped by `reason`.
5. Set plan quotas in `lib/subscription-packages.ts` (`maxSmsPerMonth`) from the confirmed Philippine rate. The current numbers are placeholders.
6. Tell clinics that promotional texts need consent, then set `SMS_POLICY_MODE=enforce`.

**Once the sender is approved**

7. Set `TWILIO_MESSAGING_SERVICE_SID`, then test on Globe, Smart and DITO handsets.
8. Set `OTP_PROVIDER=verify` and `TWILIO_VERIFY_SERVICE_SID`, and repeat the tests.
9. Turn on Turnstile and Upstash if they aren't already, then set `REQUIRE_PUBLIC_PHONE_VERIFICATION=true`.

## Later cleanup

After `OTP_PROVIDER=verify` has run cleanly, remove `otp`, `otpExpiry` and `otpAttempts` from `Patient` and `EmcrAccount`, and `$unset` them off-peak. Keep the names in the `lib/backups.ts` and `lib/patient-erasure.ts` lists.

## To confirm with real Twilio traffic

- Whether a resend extends Verify's 10-minute expiry.
- The response to a wrong code. The code expects `200` with status `pending`.
- How Verify binds to the registered sender. Ask Twilio during registration.
