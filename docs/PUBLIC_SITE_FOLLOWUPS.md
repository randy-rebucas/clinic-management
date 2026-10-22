# Public site follow-ups

Open items from the `app/(public)` audit of 2026-10-22. The fixes so far are on `fix/public-site-audit`
(see "Done" at the bottom). Everything unchecked is still open.

## Owner decisions

- [ ] **NPC registration.** Confirm whether DevCom Digital is registered with the National Privacy
      Commission (likely required once processing sensitive data of 1,000+ people). If yes, add the
      registration to `/privacy` and `/security`.
- [ ] **Named DPO.** `/privacy` lists `privacy@myclinicsoft.solutions` as the Data Protection Officer
      contact. Designate a person and decide whether to publish the name.
- [ ] **Enterprise support terms.** The site now says "agreed in your contract". Decide the real
      hours and response times before publishing any again.
- [ ] **eMCR ₱80 fee disclosure.** Home, features, FAQ, about and compare present eMCR as included.
      Before `EMCR_ACTIVATION_ENFORCED=true`, say on those pages that activation costs ₱80/year.
- [ ] **"Encrypted at rest" claim** (`/security`, FAQ). Confirm MongoDB Atlas encryption at rest is on
      for the production cluster.
- [ ] **`robots.ts` blocks `/pay/` and `/install`.** Kept on purpose (payment URLs carry invoice
      numbers). Revisit only if those URLs show up in search results.

## Configuration

- [ ] **Turn on Turnstile.** Create a Cloudflare Turnstile widget and set *both*
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. With only the secret set, every public
      booking and registration is refused.
- [ ] **Upstash Redis in production.** Without `UPSTASH_REDIS_REST_URL`/`_TOKEN`, rate limits are per
      serverless instance. The per-phone pending-booking cap is the only database-backed limit.
- [ ] **PayMongo always on in production.** If it's unset, checkout falls back to PayPal in USD
      ($29/$79/$199), which doesn't match the peso prices on the site.
- [ ] **`/download` on iPad** needs `NEXT_PUBLIC_EMCR_APP_STORE_URL` once the iOS app ships.
- [ ] **Remove `INSTALL_SECRET` after setup.** `/install` shows whether it's set; reset is locked anyway.

## Promises the legal pages now make (need tooling)

- [ ] **Delete a closed clinic's data within 30 days of a written request** (`/terms`, `/privacy`, FAQ).
      No tenant purge exists; the only `Tenant.deleteOne` is the onboarding rollback. Build a platform-admin
      purge (all tenant collections plus Cloudinary files) or document the manual runbook.
- [ ] **eMCR accounts kept until the patient asks to close them** (`/privacy`). Confirm there is a
      close-account path, in-app or by support.
- [ ] **15 days' notice of material term changes.** Needs a way to email all clinic admins.

## Self-registered records (follow-through)

Public-form records now carry `Patient.selfRegistered` and stay out of eMCR claiming, cross-clinic
linking and family suggestions until staff save the record (any save in the patient form clears it).

- [ ] **Tell clinics.** Patients who booked or registered online won't be able to claim those records in
      eMCR until front desk opens and saves them. Worth a line in the staff help docs.
- [ ] **Older records aren't flagged.** Records created from public forms before this change have no
      flag. They can't be told apart reliably; leave as-is unless abuse shows up.

## Before re-enabling rep sign-up (`MEDREP_SELF_SIGNUP_ENABLED`)

- [ ] On payment or activation, create the rep's `User` and send a set-password invite. Today
      `lib/paymongo-apply.ts` only flips `isActivated`.
- [ ] Let clinics link an existing rep instead of failing with "already exists" (prevents email squatting).
- [ ] Stop the onboard route revealing that an email belongs to a staff account. Return a generic
      response.
- [ ] Add a "resume payment" path; today a failed or cancelled checkout can't be retried (re-registering
      returns 409).
- [ ] Build PayMongo return URLs from `NEXT_PUBLIC_APP_URL`, not the request's `Origin` header.
- [ ] Update `medical-representatives/onboard/success` copy ("clinics can see your profile").

## Content / performance

- [ ] Features/about use Unsplash stock photos captioned as clinic teams. Replace with product
      screenshots or real photos.
- [ ] `app/layout.tsx` calls `await connection()`, so no marketing page is ever statically rendered.
      Consider static marketing pages if TTFB matters (it's tied to the CSP nonce).

## Done

- [x] Rate limits on public booking and registration (per IP, per phone) and a pending-booking cap per phone.
- [x] Turnstile wired into booking and registration (off until keys are set).
- [x] `/onboard` clinic picker on the root domain; Back button fixed.
- [x] Rep self sign-up paused behind `MEDREP_SELF_SIGNUP_ENABLED`.
- [x] Install reset locked once any clinic exists (`INSTALL_ALLOW_RESET`).
- [x] Fake testimonials and unsourced usage/uptime stats removed.
- [x] Terms (no refunds) and privacy policy rewritten.
- [x] Unbacked claims removed (24/7, phone/chat, proration, add-ons, multi-location, white-label, "DPA compliant").
- [x] Self-registered records kept out of eMCR claiming, linking and family suggestions.
- [x] Online booking reuses an existing patient only when email *and* phone match.
- [x] `/api/tenants/public` rate-limited; clinic email no longer returned.
- [x] Booking and onboarding use the server-resolved subdomain (`ROOT_DOMAIN`): apex, `.com.ph` and
      Vercel previews work; unknown clinic subdomains return 404.
- [x] Booking slots: loading state, error with retry, never shows a previous day's times.
- [x] Plan config: `mfa` and `auditLogs` on for trial and basic, matching `/pricing`.
- [x] About page no longer quotes 99.9% uptime.
- [x] `PublicLayout` is a server component; only `PublicHeader` (menu + active link) runs on the client.
- [x] `/pricing` JSON-LD: monthly `UnitPriceSpecification`, no ₱0 trial offer.
- [x] Footer links `/resources`; footer column headings are `<h2>`.
- [x] Skip link, reduced motion, mobile-nav focus/close, brand-teal error and 404, noindex fixes, iPad detection.
