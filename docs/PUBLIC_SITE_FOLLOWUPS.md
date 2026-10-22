# Public site follow-ups

Open items from the `app/(public)` audit of 2026-10-22. The high-priority fixes shipped on
`fix/public-site-audit`: booking/registration rate limits, the `/onboard` clinic picker, the paused
rep sign-up, removal of fake testimonials and stats, the install-reset lock, the terms/privacy rewrite,
Turnstile wiring, copy and accessibility fixes. Everything below is still open.

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

## Promises the legal pages now make (need tooling)

- [ ] **Delete a closed clinic's data within 30 days of a written request** (`/terms`, `/privacy`, FAQ).
      No tenant purge exists; the only `Tenant.deleteOne` is the onboarding rollback. Build a platform-admin
      purge (all tenant collections plus Cloudinary files) or document the manual runbook.
- [ ] **eMCR accounts kept until the patient asks to close them** (`/privacy`). Confirm there is a
      close-account path, in-app or by support.
- [ ] **15 days' notice of material term changes.** Needs a way to email all clinic admins.

## Security / data integrity

- [ ] **Self-registered records can merge into someone's eMCR.** `/book` and `/onboard` store
      unverified phone numbers, and eMCR claiming (`lib/emcr/claim.ts`) merges records on verified
      phone + first name + DOB. Flag self-registered records as unverified and keep them out of claim
      matching until staff confirm them.
- [ ] **Booking attaches to an existing patient by email alone** (`app/api/appointments/public/route.ts`,
      the `Patient.findOne({ email })` lookup). Match on email + phone, or create a new record for staff
      to merge.
- [ ] **`/api/tenants/public`** returns every active clinic's email and phone with no paging or rate
      limit. The booking picker shows phone; drop email and add `rateLimiters.public`.
- [ ] **`/install`** shows whether `INSTALL_SECRET` is set. Low risk now that reset is locked, but
      remove the secret entirely after setup.

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

## Booking page polish (`components/PublicBookingClient.tsx`)

- [ ] The apex domain and `*.vercel.app` hosts are treated as clinic subdomains, giving an empty doctor
      list with no message.
- [ ] `handleClinicSelect` builds the root domain from the last two hostname labels, which breaks on
      `.com.ph`. Pass `ROOT_DOMAIN` from the server.
- [ ] The slot list has no loading state and keeps the previous day's slots while new ones load or
      after a failed load.

## Product claims to back up or remove

- [ ] `lib/subscription-packages.ts` sets `mfa`, `auditLogs` (trial/basic) and `automatedBackups`
      (trial) to `false`, but `/pricing` says every plan includes them. Nothing enforces these flags.
      Align the config with the page.
- [ ] About page: "We aim for 99.9% uptime". There's no uptime monitoring yet; add a status page or
      soften the wording.
- [ ] Features/about use Unsplash stock photos captioned as clinic teams. Replace with product
      screenshots or real photos.

## SEO / performance / cleanup

- [ ] `app/layout.tsx` calls `await connection()`, so no marketing page is ever statically rendered.
      Consider static marketing pages if TTFB matters (it's tied to the CSP nonce).
- [ ] `PublicLayout` is entirely a client component because of the menu. Split the menu and
      active-link nav into client islands and keep the footer on the server.
- [ ] `/pricing` JSON-LD: add `UnitPriceSpecification` with `billingDuration: 'P1M'`; stop emitting the
      trial as a ₱0 Offer; keep the `#software` node consistent between `/` and `/pricing`.
- [ ] `/resources` is in the sitemap but linked from neither nav nor footer.
- [ ] Footer column headings are `<h3>` with no `<h2>` above them.
- [ ] Redundant `export const dynamic = 'force-dynamic'` in `download/page.tsx` and `install/page.tsx`.
