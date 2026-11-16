# Build prompt: Lab Partner App

Paste everything below the line into Claude Code, started in a new, empty folder
(for example `C:\Users\corew\projects\lab-partner-app`).

---

You are building **Lab Partner App**, a new standalone web app for diagnostic laboratories in the Philippines. It receives lab orders from MyClinicSoft (a separate multi-clinic system), takes them through the lab's workflow, and sends signed results back to the ordering clinic. It has its own repo, database, login and deployment. It talks to MyClinicSoft **only** through the HTTP contract below. Do not assume any shared code or database.

## How to work

1. Read this whole prompt and the MyClinicSoft design system it points to (see "Branding"). Then write `docs/PLAN.md`, covering the stack, folder layout, data model, routes, the design tokens you will set up, and a build order for Phase 1. Stop and show me the plan before writing app code.
2. Build Phase 1 only (the P0 requirements below), one module at a time, in the order you planned. After each module, run the type check, lint and tests, and fix failures before moving on.
3. Write tests for every API route and for the signing, idempotency, flagging and retry logic. Business logic must be covered by unit tests, not only by UI checks.
4. Ask me before adding any paid service, changing the contract below, or making a decision listed under "Open questions". Otherwise pick a sensible default and record it in `docs/DECISIONS.md`.
5. Never commit secrets. Use `.env.local` for local values and keep an up-to-date `.env.example`.
6. At the end, write `README.md` covering setup, how to run locally against the mock clinic, and how to connect a real MyClinicSoft clinic.

## Stack (default, change only with a reason)

- Next.js (App Router) with TypeScript in strict mode, pnpm, Tailwind CSS.
- MongoDB with Mongoose. Add indexes in the schema, and a script that syncs them.
- Auth: email and password with required TOTP two-factor sign-in, using server sessions in an httpOnly cookie. Sessions expire after 12 hours, or 30 minutes idle.
- zod for every request body. vitest for tests.
- A background job runner for webhook retries that works on a single server. A Mongo-backed queue polled by a worker route or a cron is fine. Do not require Redis in v1.
- Times are stored in UTC and shown in Asia/Manila. Dates use the Philippine format. The UI is in English.

Before writing code, read the docs that ship in `node_modules/next/dist/docs/` for the Next.js version you install. APIs may differ from what you remember.

## Branding (must match MyClinicSoft exactly)

This app is part of the MyClinicSoft family. It must look like the MyClinicSoft staff console: same fonts, colours, logo mark, shapes and component patterns. Do not invent a new look.

**Reference files (read-only, on this machine):** read `C:\Users\corew\projects\clinic-management\DESIGN.md` in full before building any UI. It is the design system. Also read these files, and copy them unchanged into this repo:

- `lib/brand-mark.ts` (logo geometry and gradient) → copy to `lib/brand-mark.ts`
- `components/BrandLogo.tsx` (the logo component) → copy to `components/BrandLogo.tsx`
- `app/globals.css`: copy only the `:root` brand and gray tokens and the `@theme inline` block

Never edit anything in that folder. If the files can't be read, use the values below, which are the same.

### Fonts

- **Geist Sans** for all words, and **Geist Mono** with `tabular-nums` for every figure, time, date, accession number, code and result value. No third typeface.
- Load both with `next/font/google` as CSS variables `--font-geist-sans` and `--font-geist-mono` (`display: "swap"`, latin subset). Map them in `@theme inline` as `--font-sans` and `--font-mono`.
- Type scale:

| Style | Size | Weight | Other |
| --- | --- | --- | --- |
| Page title | 1.5rem (phone) / 1.875rem | 800 | −0.025em tracking, set directly on the gray ground, never in a card |
| Panel title | 1rem | 700 | −0.025em tracking |
| Body | 0.875rem | 400 | line-height 1.43 |
| Label | 0.75rem | 600 | 0.05em tracking; uppercase only for sidebar group headers; badges use sentence case |
| Figure | 1.875rem | Mono 600 | tabular |
| Figure small | 0.875rem | Mono 500 | tabular |

### Colours

```css
:root {
  --background: #f8fafc;  --foreground: #0f172a;
  --brand-teal: #0ea5a4;        /* rings, borders, icons, spinners; never behind small text */
  --brand-teal-dark: #0a7f7e;   /* fill of every text-bearing teal control; teal text on white */
  --brand-teal-deep: #086362;   /* hover/pressed of teal-dark; text on teal-light */
  --brand-teal-light: #e3f6f5;  /* active nav fill, icon chips, "received" badge, hover washes */
  --brand-blue: #2563eb;        /* chart second series only; never an action colour */
  --brand-navy: #0b2136;        /* drawer backdrop at 40%, selection tray, ::selection text */
  --chart-teal: #0e9594;  --chart-blue: #2563eb;  --chart-ochre: #b45309;
  --state-pending: #d97706;  --state-critical: #be123c;
  /* grays: Tailwind gray-50 #f9fafb … gray-900 #111827 */
}
```

Rules from the design system, all binding:

- **One teal rule.** Teal is the only colour that means "act here" or "you are here": primary buttons, the active nav row, selected segments, focus rings. Primary buttons are teal-dark with white semibold text, teal-deep on hover.
- **Teal contrast rule.** Small text never sits on bright `--brand-teal`. Text on teal-light uses teal-deep.
- **No gradients** anywhere, except the logo mark itself. Never extend the logo gradient to UI, and never flatten the mark to solid teal.
- Green, amber and red mean status only. Red means "needs attention" and is never decoration.
- Do not use the old blue → indigo accent anywhere.

### Logo

- The mark is a white heart with a teal-dark pulse line on a rounded square filled with `linear-gradient(135deg, #16B9B7 0%, #0A7F7E 55%, #075E5D 100%)`.
- Heart path (24×24 viewBox): `M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z`
- Pulse path: `M3.5 11.5H8L9.5 8.5L11.5 15L13.5 7L15 11.5H20.5`, stroke `#0A7F7E`, width 1.6, round caps and joins.
- The sidebar logo row is 64px tall, with the mark at 32px beside the wordmark: "MyClinicSoft" over a small gray-500 "Lab" line. The product name stays an open question, so keep it in one constant (`lib/brand.ts`).
- Generate the favicon, apple icon and Open Graph image from the same mark with `app/icon.tsx`, `app/apple-icon.tsx` and `app/opengraph-image.tsx`.

### Shapes, depth and icons

- Corners: badges 4px; buttons, nav rows, icon chips and menu items 6px; panels, fields and menus 8px. Borders are 1px.
- Flat at rest: white surfaces with gray-200 hairlines on a gray-50 ground. Shadows appear only on floating layers. Menus use `0 8px 30px rgb(15 23 42 / 0.1)`; the mobile drawer uses `0 20px 50px rgb(15 23 42 / 0.18)`.
- Hover is a tint, never a lift: teal-light at 40–60% on tiles, gray-50 on rows. Nothing scales or gains a shadow.
- Focus: a 2px `--brand-teal` `focus-visible` ring with offset on every interactive element, inset on full-bleed rows.
- Icons: `lucide-react` outline icons at `strokeWidth={1.75}`. No icon fonts, no emoji.

### Layout and components (follow DESIGN.md for the details)

- **App shell:** a white sidebar, 280px wide, that collapses to an 80px icon rail on `lg` and becomes an off-canvas drawer below `lg`. A sticky 64px header in white at 90% with backdrop blur holds the breadcrumb on the left and the user menu on the right, with a 36px teal-dark avatar chip.
- **Active nav row:** teal-light fill with teal-deep semibold text. No side stripe, no dot.
- **Content:** a `max-w-7xl` column; 32px under the title row, 24px between blocks; cells padded 20px.
- **Lists:** the roster pattern. A toolbar with search, filters and Mono counts; one 8px panel with `divide-y` gray-100 rows; Mono codes and times; a Mono "1–20 of 340" pager; skeleton rows on first load, and the list dimmed to 60% on refetch.
- **Record pages:** the name in the title, the status badge and Mono code beside it, and a plain subtitle. One teal-dark primary action. Consequential steps confirm in an AlertDialog that says what follows. Successes and errors show as a status line, never `alert()`.
- **Live lists** (the order inbox and worklists): refresh every 30 s only while the tab is visible, show "Updated 9:41 AM" in Mono, and keep the last good list if a poll fails.
- **Forms:** white fields with a gray-300 hairline, 8px corners and a teal focus ring. Errors show as a red ring plus a red-50 message.
- **Charts** (Phase 2 reporting): hand-drawn SVG following DESIGN.md's Data Visualization rules. Chart Teal first, Chart Blue second; Mono tick labels; a "View as table" twin for every chart.

### Lab-specific mappings (use the design system's meaning map)

| Thing | Treatment |
| --- | --- |
| Order `received` / `accepted` | Teal-light badge with teal-deep text (the "scheduled" style) |
| `collected`, `in-progress`, `awaiting-validation` | Amber badge (partly done) |
| `released`, `delivered` | Emerald badge |
| `rejected`; delivery flagged | Red badge, with the reason in words |
| Superseded result version | White badge with a gray outline; the row is struck through and labelled "Replaced by v2" |
| Result flag high / low | **H** / **L** beside the Mono value, in amber-800 |
| Critical value | **C** beside the Mono value in red-700 semibold, plus a red-50 row wash. The letter is always shown, so colour is never the only signal |
| Overdue against turnaround target | Mono elapsed time, amber-800 past the target, red-700 past twice the target, with the words "Overdue" |
| Barcode labels | Black on white only, for scanner contrast; no brand colour |
| Printed result report | Logo mark and lab header at the top, black text, gray-300 hairline rules, Geist Mono for values. Teal only in the logo |

### Voice

Plain, specific words from the lab's side of the counter: "Release results", "Recollect specimen", "Sent to Reyes Family Clinic at 9:41 AM". No jargon in the UI that the front desk wouldn't use. Errors say what went wrong and what to do next.

## Users and roles

| Role | Does | Can release results |
| --- | --- | --- |
| Lab admin | Lab setup, users, test catalog, connected clinics, API keys | No, unless also a signatory |
| Front desk | Checks patients in, prints barcodes and reports | No |
| Phlebotomist | Collects and labels specimens, records collection time | No |
| Medical technologist | Runs tests, enters results, submits them for validation | No |
| Pathologist / signatory | Validates, releases and amends results; signs reports | Yes |

A user can hold several roles. Every route checks roles on the server. Shared logins are not supported. Every action is tied to a named user.

## The MyClinicSoft contract (must match exactly)

### 1. Orders in: MyClinicSoft calls the lab

`POST /v1/orders` over HTTPS. Headers: `Authorization: Bearer <apiKey>`, and `X-API-Secret: <secret>` when that clinic has one. MyClinicSoft gives up after 15 seconds, so answer within 2 seconds. It treats any non-2xx response, and any redirect, as a failure.

Body exactly as MyClinicSoft sends it today:

```json
{
  "request": {
    "requestCode": "LR-000481",
    "patient": { "firstName": "Ana", "lastName": "Reyes", "dateOfBirth": "2019-04-02", "gender": "female", "patientCode": "P-01234" },
    "test": { "type": "CBC", "code": "58410-2", "urgency": "routine" },
    "clinicalInfo": { "diagnosis": "Fever, unspecified", "chiefComplaint": "Fever for 3 days" },
    "instructions": "Fasting not required"
  }
}
```

- `urgency` is `routine`, `urgent` or `stat`. `test.code`, `clinicalInfo`, `instructions`, `gender` and `patientCode` may be missing. `dateOfBirth` may be an empty string.
- Accept extra fields without failing. Future versions may add `orderCode`, `tests[]`, `clinicName` and `orderingDoctor`. Store them when present.
- The clinic is identified by its API key. Keys are stored only as hashes.
- Reply `201 { "requestId": "<lab order id>", "status": "received" }`. MyClinicSoft reads `requestId` (or `id`).
- **Idempotent:** the same clinic sending the same `requestCode` again returns `200` with the existing `requestId`. It never creates a second order.
- Errors use the shape `{ "error": { "code", "message" } }`:
  - `401 UNAUTHORIZED`
  - `403 CLINIC_INACTIVE`
  - `422 UNKNOWN_TEST` (no catalog mapping for this clinic's test)
  - `422 INVALID_PATIENT`
  - `429 RATE_LIMITED` (limit: 60 requests per minute per clinic)
- `GET /v1/health` returns liveness only. It needs no auth and returns no data.

### 2. Results out: the lab calls MyClinicSoft

`POST https://<clinic platform host>/api/lab-results/third-party/webhook`, sent on release and on every amendment.

Headers:

- `Content-Type: application/json`
- `X-Lab-Code: <this lab's code at MyClinicSoft>`
- `X-Webhook-Timestamp: <unix seconds>`. MyClinicSoft rejects timestamps more than 5 minutes from its clock.
- `X-Webhook-Signature: sha256=<hex>`, where the hex is the HMAC-SHA256 of the string `"<timestamp>.<raw body>"` using that clinic connection's webhook secret. Sign the exact bytes you send.

Body:

```json
{
  "requestId": "<the lab's requestId from the order reply>",
  "requestCode": "LR-000481",
  "resultId": "<accession>-v1",
  "testType": "CBC",
  "results": { "hb": 13.2, "wbc": 6.5 },
  "referenceRanges": { "hb": "12-16 g/dL", "wbc": "4.5-11 x10^9/L" },
  "abnormalFlags": { "hb": "normal", "wbc": "normal" },
  "interpretation": "Within normal limits",
  "resultDate": "2026-11-16T09:30:00+08:00",
  "labName": "<lab name>"
}
```

- Always include `requestCode`. Without it MyClinicSoft may answer `409` (ambiguous match).
- `resultId` is unique per result version (`<accession>-v<n>`). MyClinicSoft ignores a repeat of the same `resultId`, and applies a new one on the same order as a correction that needs a fresh review by the doctor.
- `abnormalFlags` values are only `high`, `low` or `normal`. Send a critical value as `high` or `low`, and name it in `interpretation`.
- Responses from MyClinicSoft:
  - `200`: applied, or a duplicate. Mark the delivery delivered.
  - `400`, `404`, `409`: stop retrying and flag the delivery for staff.
  - `401`: bad signature or stale timestamp. Stop retrying and flag it, showing "check the server clock and webhook secret".
  - `503`: webhook not configured on their side. Retry.
  - `5xx`, a timeout or a network error: retry after 1, 5, 15 and 60 minutes, then hourly, for up to 24 hours. Then flag it.
- Outbound calls go only to the platform host configured for each connected clinic. Use HTTPS only and do not follow redirects.

### 3. Local development

Build a **mock clinic** in `scripts/mock-clinic/` (or a dev-only route). It can send sample orders to `/v1/orders` with a test key, and it receives and verifies results webhooks with the same signature rules, logging what arrived. Every end-to-end test runs against it.

## Phase 1 requirements (P0, build these)

| ID | Module | Requirement |
| --- | --- | --- |
| FR-1 | Order inbox | Receive orders on `POST /v1/orders` and show them in an inbox grouped by clinic and urgency, with `stat` and `urgent` first |
| FR-3 | Order inbox | Reject an order with a reason (test not offered, details missing). The order closes, and the reason is kept for the status feed in Phase 2 |
| FR-4 | Check-in | Match the arriving patient to the order by name and birth date, and record the ID type checked |
| FR-5 | Specimens | Generate an accession number and print barcode labels (Code 128) for each container from the browser |
| FR-6 | Specimens | Record collector, collection time, container and condition. Reject and recollect with a reason |
| FR-7 | Test catalog | Tests with code (LOINC where known), section, specimen type, analytes with units, reference ranges by sex and age band, and a turnaround target in hours |
| FR-8 | Test catalog | Map each connected clinic's test names and codes to catalog tests. An unmapped test returns `422 UNKNOWN_TEST` |
| FR-9 | Worklists | A worklist per section (hematology, chemistry, urinalysis, and so on), with items past the turnaround target highlighted |
| FR-10 | Result entry | Enter values per analyte. Flag high, low and critical values automatically from the reference range for the patient's age and sex |
| FR-12 | Result entry | Attach a PDF or image to a result (max 10 MB, stored in GridFS or local storage behind an interface) |
| FR-13 | Validation | A signatory reviews and releases. The person who entered a result can never release it, even if they are also a signatory |
| FR-14 | Validation | A critical value blocks release until a call to the clinic is recorded: who called, who took the call, and when |
| FR-15 | Delivery | On release, send the signed webhook within 30 seconds, retry as above, and show delivery status on each order |
| FR-16 | Corrections | Amend a released result with a required reason. Create version n+1, mark the old version superseded but still visible, and resend it with the new `resultId` |
| FR-17 | Reports | A printable A4 result report (HTML print view) with lab header, patient, tests, values, flags, ranges, signatory name and licence number, and a serial that anyone can check at `/verify/<serial>` (the check shows only lab, date, test names and status, never values) |
| FR-19 | Admin | Manage users and roles, the lab profile, connected clinics (lab code at MyClinicSoft, platform host, API key, optional API secret, webhook secret), and key rotation with a 7-day overlap. Show keys once at creation |

**Order status:** `received` → `accepted` or `rejected` → `collected` → `in-progress` → `awaiting-validation` → `released` → `delivered`. An amendment moves the order back to `awaiting-validation`. Enforce allowed transitions in one place, with tests.

## Data model (starting point)

- **Lab**: name, licence number, address, report header.
- **User**: name, email, password hash, TOTP secret (encrypted), roles, licence number, active.
- **ConnectedClinic**: name, MyClinicSoft lab code, platform host, API key hash(es) with expiry, API secret hash, webhook secret (encrypted), active.
- **TestDefinition**: code, LOINC, name, section, specimen type, turnaround hours, and analytes (key, name, unit, ranges by sex and age band, critical low and high).
- **TestMapping**: clinic, clinic test type or code, test definition.
- **Order**: requestId, clinic, requestCode (unique with clinic), urgency, clinical info, instructions, status, timestamps, raw payload.
- **PatientSnapshot**: copied from the order and embedded in it. Never merge patients across clinics.
- **Specimen**: accession number (unique), order, container, collected by and at, condition, rejection reason.
- **Result**: order, version, values, flags, interpretation, attachments, entered by, released by and at, superseded by, amendment reason, critical call record.
- **Delivery**: result version, attempts, last status code, last error, next retry at, delivered at, flagged.
- **AuditEvent**: append-only record of user, action, entity, before and after, time and IP, covering views of results too.

## Security and privacy (Philippine Data Privacy Act, RA 10173)

- Store only fields from the order payload. Do not store patient phone, email or address.
- Encrypt secrets at rest with a key from the environment. Hash API keys.
- Require two-factor sign-in for everyone. Use a CSRF-safe session setup, rate-limit sign-in, and lock the account after repeated failures.
- Log every view, entry, release, amendment, print and delivery to the audit trail.
- Add security headers (CSP, HSTS, frame-ancestors none).
- Provide a per-patient export and delete script for privacy requests that come through a clinic.

## Non-functional

- `POST /v1/orders` answers in under 2 seconds at p95. Do the order write and nothing slow in the request.
- Design for one lab, up to 50 clinics and 2,000 orders a day.
- The bench UI runs on desktop browsers, front desk on a tablet. Barcode scanners act as keyboard input, so every lookup field accepts a scanned accession number.
- Meet WCAG 2.1 AA: labelled inputs, visible focus, and no information carried by colour alone (flags show H, L or C as well as colour).

## Out of scope for Phase 1 (do not build)

- Analyzer interfacing (HL7 or ASTM).
- CSV result import.
- Status webhooks to the clinic.
- Walk-in orders from a scanned slip.
- Billing.
- A patient app.
- Inventory.
- Send-outs to reference labs.

Leave clean seams for status webhooks and CSV import, but do not implement them.

## Open questions (ask me; don't decide)

- Product name and domain.
- Whether this becomes a multi-lab SaaS (one deployment, many labs) or one deployment per lab. Build single-lab, but keep a `labId` on every collection so either is possible.
- The DOH retention period for results, and whether reports must print a DOH licence number.
- Which pilot lab, and its most common tests, to seed the catalog. Until then, seed CBC, urinalysis, fasting blood sugar, lipid profile and creatinine, and mark them as sample data.

## Done means

- Type check, lint and all tests pass.
- The mock clinic can send an order. The order can be accepted, collected, given results (including one critical value with its call logged), released by a different user, and delivered with a valid signature. It can then be amended and delivered as version 2. Delivery is retried when the mock answers 500, and flagged on 401.
- The README explains setup and connecting a real clinic.
- The UI uses only Geist Sans and Geist Mono, the brand tokens above and the BrandLogo mark. It has no gradients other than the mark, no blue or indigo actions, and no shadows on resting surfaces. Every figure, code and result value is in Mono with tabular numerals.
