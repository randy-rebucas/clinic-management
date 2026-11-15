# eMCR store readiness (Nov 2026)

What came out of the 2026-11-15 audit of the eMCR patient app (1.1.5) that code alone can't close: one decision, and the steps to do in the stores, Firebase, EAS and production before submitting 1.1.6.

Code changes for the rest are on `fix/store-readiness-audit` (clinic-management-mobile) and `feat/patient-store-readiness` (this repo). **Deploy the backend first.**

## 1. Decision needed: the activation voucher (App Store 3.1.1)

Any API call can answer `402 ACTIVATION_REQUIRED`, which opens "Activate eMCR". The patient buys a voucher at the clinic counter, and the code unlocks booking, check-in, results and documents for a year.

Apple's rule 3.1.1: features unlocked inside the app must be sold through in-app purchase. Codes, vouchers and QR codes that unlock features count, even when the payment happens outside the app. Google Play's payments policy is similar, for digital goods consumed in the app.

Options, from least to most work:

| Option | What changes | Risk |
|---|---|---|
| A. Clinic service, not app access | The clinic pays for eMCR (or includes it in the consultation fee); patients never buy app access. Reword the voucher as "clinic-provided access" and remove any patient-facing price. | Lowest if it's true in practice. Apple looks at who pays and for what. |
| B. Gate off on iOS | `EMCR_ACTIVATION_ENFORCED` off for iOS clients only (the server can branch on the app's platform header). iOS patients get everything free. | No App Store risk, but uneven revenue and the risk of patients telling each other. |
| C. Add in-app purchase | Sell the same one-year activation through StoreKit and Play Billing, next to the voucher. Apple and Google take 15–30%. Needs Restore Purchases. | Fully compliant; the most work (IAP products, server receipt checks). |
| D. Argue it as a real-world service | Keep the voucher; in App Review notes, explain that activation is part of the clinic's in-person care service. | Possible but uncertain (3.1.3(e) covers goods and services used outside the app; records viewed in the app are digital). |

Suggested App Review note if you choose A or D:

> eMCR is the patient portal for clinics using MyClinicSoft. Access is provided by the patient's clinic as part of its in-person care; patients don't buy anything in the app and no prices are shown in it. The demo account below is already active.

Before submitting, check whether `EMCR_ACTIVATION_ENFORCED` is on in production. If it's off, the gate doesn't apply yet and review won't see it.

## 2. Android push (release builds get no token today)

`getExpoPushTokenAsync` needs Firebase on Android. The app now reads `google-services.json` from the `GOOGLE_SERVICES_JSON` EAS file variable (app.config.js).

1. Firebase console → project → add an Android app with package `solutions.myclinicsoft.emcr` → download `google-services.json`.
2. `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --visibility secret` (also `preview` if you test with it).
3. Upload the FCM V1 service-account key: `eas credentials` → Android → production → Push Notifications: FCM V1. The gitignored `ServiceAccountEMCR.json` in the mobile repo root may be that key; check its `project_id` matches the Firebase project.
4. Build, install the release build on an Android phone, sign in, and confirm the device row in the backend has a push token. Send a test reminder.

## 3. Production steps before submitting

- [ ] Deploy this repo's branch, then `pnpm prod db:indexes --apply` (new SupportRequest index for patient requests).
- [ ] Set `EMCR_LATEST_VERSION=1.1.6` once 1.1.6 is live in both stores. Set `EMCR_MIN_VERSION` only when a backend change breaks older apps. Set `EMCR_IOS_STORE_URL` once the App Store listing exists. (Apps before 1.1.6 don't check.)
- [ ] `pnpm prod db:create-demo-patient` and test the demo sign-in from a release build: password sign-in, already activated, no forced password change, sample records. Put it in App Review notes and Play Console → App access.
- [ ] iPad is now off (`supportsTablet: false`). If an iPad build of eMCR was ever published, Apple won't allow removing iPad support: put it back and do iPad screenshots instead.
- [ ] Apple App Privacy: health and medical records, contact info (name, phone, email), photos (profile picture), device ID (push token). Not used for tracking.
- [ ] Google Play Data safety form with the same data, and the Health apps declaration.
- [ ] Apple developer account: healthcare apps must come from an Organization account (5.1.1(ix)). The Expo owner is the personal `randyreb` account; confirm the App Store Connect account is the organization.
- [ ] App Store Connect support URL (for example https://www.myclinicsoft.solutions/support or the contact page).
- [ ] Screenshots: none are in the repo. Screenshot-blocking (FLAG_SECURE) makes Android captures black: take them from a debug build or the emulator with App Lock and privacy guard off.
- [ ] Release through Play internal testing and TestFlight first; `eas.json` currently submits Android straight to production.

## 4. Account deletion in the app

More → Delete account files a request in the platform support queue (source "eMCR patient", category Account, subject "eMCR account deletion request"). Deletion itself is still done by hand, as with the web form, within 30 days of confirming identity. Requests from phone-only accounts show a mobile number instead of an email: replies typed in the console are only emailed when there's an email, so text or call those patients.

## 5. Left for later (not blockers)

- **Crash reporting.** There is none. Sentry (`@sentry/react-native` with the Expo plugin) is the usual choice; needs an account, a DSN and an auth token for source maps, and PHI scrubbing in `beforeSend`.
- **Universal Links / App Links** for texted invites (`myclinicsoft://invite` isn't tappable in most SMS apps). Needs the Apple Team ID and the Play app-signing SHA-256 fingerprint, `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` served from this site, and https invite links with a web fallback.
- **Predictive back** has been off since the first commit; turn it on after testing every screen's back behaviour on Android 14+.
- **Type scale migration.** Typography tokens now exist in `lib/theme.ts`; most screens still use raw font sizes.
- **Over-the-air updates** (`expo-updates`) so small fixes don't need store review.
