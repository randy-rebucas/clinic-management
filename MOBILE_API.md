# Mobile API — Patient & Medical Representative apps

The web portals for patients (`/patient/portal`) and medical representatives
(`/medical-representative/*`) have been removed. Both audiences use the mobile app, which talks
to the endpoints below. Staff keep the web app.

### Staff endpoints the app depends on (web app, not called by the app)

| Method & path | Notes |
|---|---|
| `POST /api/patients/[id]/login-qr` | Staff issue a sign-in QR from the patient record. Single use, valid 15 minutes, scoped to the issuing clinic (`tid`). Issuing a new one cancels the previous unused one |
| `DELETE /api/patients/[id]/login-qr` | Staff cancel the QR. **Also signs the patient out of the app everywhere** (sessions from an already-scanned QR can't be singled out) |
| `POST /api/patients/[id]/app-credentials` | Staff set the patient's password (and email). Password sign-ins with it are scoped to that clinic (`tid`) until the patient proves their phone and sets their own. Signs the patient out everywhere |
| `GET/POST/DELETE /api/patients/[id]/guardians` | **New.** Family access from the patient record: who may manage this patient's records from their own app login. The manager must be registered at the same clinic. Removing a manager removes them at every clinic |
| `GET /api/queue/check-in-qr` | **New.** The clinic's rotating self check-in QR (`{ enabled, qrImage, expiresAt }`), shown from Queue → Check-in QR |

## Conventions

- **Base URL:** the main domain, `https://www.myclinicsoft.solutions`. Don't call a clinic subdomain
  from the app: the patient endpoints read the patient's clinics from their record, and reps
  aren't tied to one clinic.
- **Auth:** `Authorization: Bearer <token>` on every authenticated call. The app never needs
  cookies. Requests with no cookies skip the CSRF check, so no `Origin` header is needed.
- **Envelope:** `{ "success": true, "data": … }` or `{ "success": false, "error": "message", "code"?: "…" }`.
- **Pagination** (list endpoints): `?page=1&limit=…` →
  `"pagination": { "total", "page", "limit", "totalPages" }`. `GET /api/patients/me/appointments`
  is the one exception: it returns `pages` instead of `totalPages`. **Changed:** invalid `page` /
  `limit` values (non-numbers, zero, negative) fall back to the defaults instead of erroring.
- **Clinic filter** (`?tenantId=` on every `/me/*` list route and on booking `GET`): a malformed id
  is `400`; a clinic outside the session's scope (`tid`, see below) is `403`.
- **Tokens:** every sign-in returns an access `token` (Bearer, valid 7 days, `expiresIn`) and a
  `refreshToken` (valid 60 days, `refreshExpiresIn`). Keep both in secure storage only.
  - On a `401` from any endpoint, call the audience's refresh endpoint **once**, store **both** new
    tokens, and retry the request. Refresh tokens are single-use and rotate on every refresh.
  - Only one refresh may be in flight at a time. If two requests both get a `401`, they share one
    refresh call. Sending the same refresh token twice counts as theft (`REFRESH_REUSED`): every
    token in that chain is revoked and the user must sign in again.
  - A refresh `401` (`REFRESH_INVALID` / `REFRESH_REUSED`) means: go to sign-in.
  - **New (patients):** a refresh `403 { code: "ACCOUNT_INACTIVE" }` means the clinic deactivated
    the account. Show the server's `error` and go to sign-in; don't retry.
  - A password change or "sign out everywhere" kills every existing token and refresh token. The
    password-change response carries a new `token`, `expiresIn`, `refreshToken` and
    `refreshExpiresIn` for the current device (**`expiresIn` is new**; it was missing before).
    It also removes every *other* device's push registration (send `deviceId` in the body to keep
    this one, or call `POST /me/devices` again).

  | Audience | Refresh endpoint |
  |---|---|
  | Patient | `POST /api/patients/auth/refresh` `{ refreshToken }` |
  | Medical representative | `POST /api/medical-representatives/auth/refresh` `{ refreshToken }` |

  Both return `{ token, tokenType, expiresIn, refreshToken, refreshExpiresIn }`.
- **401 means the token is bad, nothing else.** A wrong *current* password on change-password or
  setup-credentials is `400 { code: "WRONG_CURRENT_PASSWORD" }`, so don't refresh on it. Same for
  `400 CURRENT_PASSWORD_REQUIRED` and `400 OTP_REQUIRED` (see below).
- **Rate limits:** sign-in endpoints are limited per IP and per account. `429` means wait.
- **Dates:** ISO 8601 strings. Appointment times are `HH:mm` in the clinic's timezone.

---

## Patient app

### Token claims: `amr` and `tid` (new)

Patient access tokens are JWTs; the app may decode (not verify) them.

- `amr`: how the sign-in was proven, `"password"` | `"otp"` | `"qr"`. Refreshed tokens carry no
  `amr`, and tokens from a password change carry `"password"`. An `"otp"` token whose `iat` is
  less than 15 minutes old counts as proof of the patient's phone (used for password reset).
- `tid`: a clinic id. **Present only when the credential came from one clinic's staff**: a staff
  sign-in QR, or a password set by clinic staff. Such a session sees only that clinic's records,
  even if the patient is registered at other clinics, and refreshed tokens keep the same `tid`.
  An OTP sign-in is never scoped (it proves the patient's own phone). To get full access, the
  patient signs in with a code; setting their own password after a code sign-in lifts the scope
  for future password sign-ins too. Push notifications about other clinics skip a device
  registered from a scoped session.

### Sign-in

| Method & path | Body | Notes |
|---|---|---|
| `POST /api/patients/auth/token` | `{ method: "password", email, password, tenantId? }` | → `{ token, tokenType: "Bearer", expiresIn, refreshToken, refreshExpiresIn, patient }` |
| `POST /api/patients/auth/token` | `{ method: "otp", phone, otp, tenantId? }` | Request the code first with the OTP endpoint below |
| `POST /api/patients/auth/token` | `{ method: "qr", qrCode }` | **New.** `qrCode` is the raw scanned string `{"type":"patient_login","token":"…"}`, issued by clinic staff from the patient record (`POST /api/patients/[id]/login-qr`) or by `POST /me/login-qr`. **Changed:** a login QR works **once** and expires **15 minutes** after it is issued (it was reusable for 30 days); a second scan gets `401`. A staff-issued QR gives a session scoped to that clinic (`tid`). The staff "look up this patient" QR only encodes the patient code and is **not** a login QR |
| `POST /api/patients/auth/otp/request` | `{ phone, tenantId? }` | Sends a 6-digit SMS code, valid for 5 minutes. **Changed:** the number is matched in any common spelling (`09171234567`, `9171234567`, `639171234567`, `+639171234567`), and the per-number rate limit counts all spellings together. `auth/token` accepts any spelling too |
| `POST /api/patients/auth/setup-credentials` | `{ email?, password, currentPassword?, otp?, deviceId? }` | Sets an email and password. **Changed:** with no password yet, it needs proof of the patient's phone: call it within 15 minutes of an OTP sign-in (the activation flow: code sign-in, then set password), or send a fresh SMS code as `otp`. Otherwise `400 OTP_REQUIRED`; a QR sign-in alone can't set credentials. With a password already set: `currentPassword` (`400 CURRENT_PASSWORD_REQUIRED` / `WRONG_CURRENT_PASSWORD`) or the same phone proof. `409 EMAIL_IN_USE` when another patient already signs in with that email (any clinic). Returns `token`, `expiresIn`, `refreshToken`, `refreshExpiresIn` |
| `DELETE /api/patients/session?deviceId=…` | `{ refreshToken }` | **Changed.** Sign out on this device: revokes the refresh token (even if the access token has expired) and unregisters the device from push |
| `DELETE /api/patients/session?all=true` | `{ refreshToken }` | **New.** Sign out everywhere: revokes every token, the login QR and every device's push registration. **Fixed:** works even when the access token has expired, as long as the body carries a still-valid `refreshToken` (it used to return `401` and do nothing) |

Email sign-in tries every patient record with that email (it used to pick one arbitrarily), and
returns `403 { code: "ACCOUNT_INACTIVE" }` for a deactivated account.

**New: one login for every clinic.** Sign-in never needs a clinic (`tenantId` stays optional, the
app doesn't send it). Each clinic registers its own record for a patient, so the backend links
them: on every phone-code (OTP) sign-in, the patient's other active records with **the same own
phone number and the same date of birth** are joined to this login (a parent and children sharing
a number stay separate; a number listed only as an emergency contact links nothing). From then on
every `/me/*` route and booking reads across all linked records, for any sign-in method; a
clinic-scoped session (`tid`) still sees only its clinic. A clinic visited for the first time
after linking joins at the patient's next code sign-in.

| Method & path | Notes |
|---|---|
| `GET /api/patients/me/clinics` | **New.** The patient's clinics, most recently visited first: `[{ tenantId, name, subdomain, logo, address, phone, patientCode, lastVisitAt }]`. `patientCode` is the patient's code at that clinic. Pass `tenantId` to the list routes to filter by one clinic |

### Profile & devices

| Method & path | Notes |
|---|---|
| `GET /api/patients/me` | Own profile. **Changed:** a fixed field list: `_id, patientCode, firstName, middleName, lastName, suffix, dateOfBirth, sex, email, phone, contacts, address, emergencyContact, allergies, preExistingConditions`, plus `hasPassword` (boolean). Nothing else (internal fields, medical history, auth fields) is returned |
| `PATCH /api/patients/me` | Only `contacts.{email,address}`, `address.{street,city,state,zipCode}` and `emergencyContact.{name,phone,relationship}` |
| `POST /api/patients/me/change-password` | `{ currentPassword?, newPassword, otp?, deviceId? }` (min 8). Returns `token`, `expiresIn`, `refreshToken`, `refreshExpiresIn`. **Changed:** **forgot password** = OTP sign-in, then call this with only `newPassword` within 15 minutes (`amr: "otp"`, `iat` under 15 min old). Otherwise a patient with a password must send `currentPassword`: missing gives `400 CURRENT_PASSWORD_REQUIRED`, wrong gives `400 WRONG_CURRENT_PASSWORD`. A patient with **no** password (signed in by QR, or by code more than 15 minutes ago) needs the same phone proof to set one: on `400 OTP_REQUIRED`, request a code and resend with `otp`, or sign in with a code again |
| `POST /api/patients/me/phone-code` | **New.** Text a confirmation code to the signed-in patient's own phone, stored on their own record, for the `otp` field after `400 OTP_REQUIRED` (change-password, setup-credentials, adding a family member). → `{ phone }` (masked). `400 NO_PHONE` when the record has no usable mobile number. Prefer it over `auth/otp/request` when signed in: that one finds a record by number, so in a household sharing one phone the code can land on a child's record and then fail to verify |
| `POST /api/patients/me/login-qr` | Issue a login QR to sign in on another device (replaces any unused one). Single use, 15 minutes. A scoped session issues a QR with the same `tid` |
| `DELETE /api/patients/me/login-qr` | Revoke the login QR **and sign out every session** (a QR that was already scanned can't be told apart). The caller gets a new `token`, `expiresIn`, `refreshToken`, `refreshExpiresIn`. Optional `{ deviceId }` keeps this device's push |
| `POST /api/patients/me/devices` | `{ deviceId, platform: "ios"\|"android", pushToken?, appVersion? }`. Call after sign-in, after a password change, and when the Expo token changes. **Changed:** a device or push token belongs to one patient at a time; registering it removes any other patient's registration of the same `deviceId` or `pushToken` |
| `DELETE /api/patients/me/devices?deviceId=…` | Unregister from push |
| `GET /api/patients/me/devices/preferences?deviceId=…` | **New.** Which push categories this device gets → `{ appointments, labResults, queue, messages }` (booleans; unset = `true`). `404 DEVICE_NOT_FOUND` until the device is registered |
| `PATCH /api/patients/me/devices/preferences` | **New.** `{ deviceId, appointments?, labResults?, queue?, messages? }`, only the categories sent change. Returns the full set. A muted category is skipped at send time by its push tag (`appointment-`, `lab-result-`, `queue-`, `message-`); SMS, email and the in-app inbox are unaffected |

### Records (read-only, paginated, newest first)

| List | Detail | Filters |
|---|---|---|
| `GET /api/patients/me/appointments` | `GET /api/patients/me/appointments/[id]` **new** | `status`, `tenantId` |
| `GET /api/patients/me/lab-results` | `GET /api/patients/me/lab-results/[id]` **new** | `tenantId` |
| `GET /api/patients/me/prescriptions` (+ `visit: { _id, date, visitType, visitCode }` or `null`, for grouping by encounter) | `GET /api/patients/me/prescriptions/[id]` **new** | `tenantId` |
| `GET /api/patients/me/invoices` (+ `summary.outstandingBalance`) | `GET /api/patients/me/invoices/[id]` **new** (+ `summary.{paid,balance}`) | `status`, `tenantId` |
| `GET /api/patients/me/visits` | `GET /api/patients/me/visits/[id]` | `tenantId` |
| `GET /api/patients/me/documents` | `GET /api/patients/me/documents/[id]` **new**: the file bytes, inline. Add `?download=true` for an attachment | `category`, `tenantId` |
| `GET /api/patients/me/vitals` | — | |
| `GET /api/patients/me/queue` | — | Poll every ~15 s while the screen is in the foreground |

**Changed record shapes:**

- `prescribedBy` (prescriptions) and `provider` (visits) are now `{ _id, name }` only.
- Appointments no longer return `notes` or `createdBy`.
- Lab results no longer return `thirdPartyLab` or `attachments[].url`.
- An unknown `status` filter on the appointments or invoices list is `400` (it used to match nothing).
- A clinic-scoped session (`tid`) only ever gets that clinic's records, with or without `tenantId`.

Opening a document is an authenticated GET that returns the file itself, so download it with the
Bearer header (e.g. `expo-file-system` `downloadAsync` with `headers`). Don't hand the URL to a
browser, because the browser won't send the token. Confidential and deleted documents return 404.

### Appointments (write)

| Method & path | Notes |
|---|---|
| `GET /api/patients/appointments` | `data.doctors` at the patient's clinic. Pass `?tenantId=` (from `/me/clinics`) for a clinic other than their first. Booking at a linked clinic is made on the patient's record there |
| `GET /api/patients/appointments?date=YYYY-MM-DD&doctorId=…` | Adds `data.availableSlots: ["09:00", …]`: slots inside that doctor's hours AND the clinic's opening hours for the day, stepping by the clinic's usual appointment length (default 30 min; a doctor with no weekly hours follows the opening hours; today's past slots dropped, clinic time). `data.dayOff: true` with an empty list when the doctor doesn't work or the clinic is closed that date, or the date is past the 60-day booking horizon. Each doctor in `data.doctors` carries `hoursSummary` (weekly hours) and `bookableDates` (the dates they can be booked) |
| `POST /api/patients/appointments` | `{ doctorId, appointmentDate: "YYYY-MM-DD", appointmentTime: "HH:mm", reason?, modality? }`. **New** `modality: "teleconsult"` books a video visit; allowed only when the options `GET` returned `data.teleconsultAvailable: true`, else `403`. `409` = slot taken. **New** `400` codes: `SLOT_PAST` (time already passed), `SLOT_BEYOND_HORIZON` (more than 60 days ahead), `SLOT_NOT_WORKING` (outside the doctor's hours or the clinic's opening hours that day), `SLOT_OFF_GRID` (not on the slot grid) |
| `DELETE /api/patients/appointments/[id]` | Cancel. Refused for past, completed or no-show appointments |

**Video visits (new).** Appointments carry `modality` (`"in-person"` or `"teleconsult"`) and
`teleconsult`, which is `null` for in-person visits or
`{ joinUrl, opensAt, closesAt, joinable }`. `joinUrl` is only set while `joinable` is true: from
15 minutes before the start until 2 hours after the end, and never for cancelled, missed or
completed visits. Open it with `Linking.openURL`; the Jitsi app opens if installed, otherwise
the browser. The raw room name is never returned.

**E-prescription PDF (new).** `POST /api/patients/me/prescriptions/[id]/pdf-link` returns
`{ url, expiresAt }`: a 10-minute link to the sealed patient copy (`GET /api/rx/[token]`). Hand
that URL to the browser. Each open issues a new sealed, numbered copy. Cancelled prescriptions
return `409`.

### Notifications

`GET /api/patients/me/notifications?unreadOnly=true` returns a feed built from the last 90 days of
appointments, lab results, unpaid invoices and prescriptions, plus `unreadCount`.

**Changed:** each item now carries `target: { screen, id }` instead of the old `actionUrl`, which
linked into the web portal. `screen` is one of `appointments | lab-results | invoices | prescriptions`,
and `id` is the record id for the matching detail endpoint.

**Changed:** notification ids now include the record's status, so a status change shows up as a new
(unread) notification: `apt-<id>-<status>`, `lab-<id>-<status>`, `inv-<id>-<status>`. Prescription ids
stay `rx-<id>`. Ids marked read under the old format won't match; expect those items to show as
unread once. Invoice notifications carry `metadata.balance`.

**New: clinic messages.** The feed also holds messages the clinic sends the patient: a doctor's
note from the patient's page, or a clinic announcement to all patients. They have
`type: 'message'`, id `msg-<id>`, `target: { screen: 'messages', id }` and
`metadata: { from, kind }`. `from` is the sender's name ("Dr. Ana Reyes") or "Your clinic", and
`kind` is `message` or `announcement`. There is no detail screen, so show the whole `message` in
the feed. Each message is also pushed, with `data.tag = "message-<id>"` and `data.messageId`. Open
the notifications screen when it is tapped. Older app builds show these with the appointment icon,
and tapping them does nothing.

`PATCH /api/patients/me/notifications` with `{ ids: [...] }` or `{ markAllRead: true }`.
**Fixed:** `markAllRead` used to clear the read list, which made every notification unread again.
It now marks the current feed as read.

**Fixed:** lab-result notifications never appeared. The feed filtered on statuses LabResult
doesn't have (`available`/`abnormal`/`critical`). It now uses `completed`/`reviewed`, takes the test
name from `request.testType`, and flags results with any value marked high or low. Appointment and
booking doctor objects now carry a real `specialization` name, which was always blank before.

Push payloads (Expo) carry `data.tag` and sometimes `data.url`. Treat both as hints and refresh the
relevant list. **New:** pushes now reach every device of the person (devices registered from any of
their linked records) and the devices of family members who manage them (see below).

### Health summary (new)

| Method & path | Notes |
|---|---|
| `GET /api/patients/me/health-summary` | The patient's record across every clinic in the session's scope, merged and tagged with the clinic that recorded each item: `{ generatedAt, patient: { firstName, middleName, lastName, suffix, dateOfBirth, sex }, clinics: [{ tenantId, name, patientCode }], allergies: [{ substance, reaction, severity, clinics[] }], conditions: [{ condition, status, diagnosisDate, notes, clinics[] }], medications: { current: [...], recent: [...] }, immunizations: [{ name, date, batch, notes, clinic }] }` |
| `POST /api/patients/me/health-summary/pdf-link` | `{ url, expiresAt }`: a 10-minute link to the same summary as a PDF (`GET /api/health-summary/[token]`). Hand it to the browser or share sheet |

- **Merging:** one allergy per substance and one condition per name (case-insensitive); an active
  or chronic record outranks a resolved one. The same vaccine on the same day at two clinics is
  one dose. Open conditions come first; vaccinations newest first.
- **Medicines:** `current` = on a prescription that is still open (`active`, `dispensed`,
  `partially-dispensed`) whose course hasn't ended: issue date + `durationDays`, or 30 days when
  no duration is given (`endsAt` is set only when there is a duration). `recent` = the other
  medicines prescribed in the last 12 months. Each medicine appears once per list, from its
  latest prescription: `{ name, genericName, strength, dose, frequency, route, durationDays,
  instructions, issuedAt, endsAt, prescriptionId, prescriber, clinic }`.
- A clinic-scoped session (`tid`) gets a summary of that clinic only, PDF included.

### Self check-in and live queue (new)

Clinics that turn on **Settings → Queue → "Let patients check themselves in from the app"** show a
rotating check-in QR on a reception tablet (Queue → Check-in QR) or the waiting-room screen. The QR
holds `{"type":"clinic_checkin","tenantId":"…","code":"…"}`; the code changes every 5 minutes and
the previous one is still accepted.

| Method & path | Notes |
|---|---|
| `POST /api/patients/me/check-in` | `{ qrCode }` (the raw scanned string). Checks in the patient's queue entry at that clinic, or, when they have an in-person appointment there today but no queue entry yet, seats them in the queue already checked in. → `{ status: "checked-in" \| "already-checked-in", queue: { _id, queueNumber, status, checkedIn, checkedInAt, queuedAt, doctor, room, position, clinic: { tenantId, name } } }` |

Errors carry a `code`: `400 INVALID_QR` (not a clinic check-in QR, e.g. a login QR), `400
QR_EXPIRED` (scan again), `403 NOT_REGISTERED` (not a patient of that clinic, or outside a scoped
session's clinic), `403 SELF_CHECKIN_OFF`, `404 NO_APPOINTMENT` (walk-ins register at the desk).

**Changed:** `GET /api/patients/me/queue` now counts `position` within the patient's doctor's line
(unassigned patients share one line), the same number the staff queue screen shows. It used to
count everyone waiting at the clinic. Use `checkedIn` to decide whether to offer "Check in".

**Queue pushes (new).** As the line moves, waiting patients within 3 of the front get one push per
step: `"You're 3rd in line"`, `"You're 2nd in line"`, `"You're next"`, then `"It's Your Turn!"`
when called. `data: { type: "queue", queueId, position? }`, `url: "/queue"`. Refresh the queue
screen when one arrives.

### Family accounts (new)

One login can manage other people's records: a parent with their children, an adult child with an
elderly parent. To act for a family member, send **`X-Patient-Profile: <their record id>`** on any
patient request: every `/me/*` route, booking, check-in and the health summary then answer for
that person, within the caller's own clinic scope (`tid`). Without the header the caller is
themselves.

| Method & path | Notes |
|---|---|
| `GET /api/patients/me/family` | Always about the signed-in person (the header is ignored): `{ self: { id, firstName, lastName }, members: [{ id, firstName, lastName, dateOfBirth, sex, relationship, source, accessEndsAt, clinics[] }], suggestions: [{ key, firstName, lastInitial, birthYear, clinics[] }] }`. `members[].id` is the value for `X-Patient-Profile` |
| `POST /api/patients/me/family` | `{ key, relationship?, otp? }`: add a suggestion. Needs proof of the phone like setting a password: a code sign-in in the last 15 minutes, or a code from `POST /me/phone-code` as `otp`, else `400 OTP_REQUIRED`. `404` when the suggestion no longer applies. → `201 { members, addedId }` |
| `DELETE /api/patients/me/family/[id]` | Stop managing that person (removes the link at every clinic) |

How people join a family:

- **Children, in the app.** `suggestions` lists minors (under 18) registered at any clinic with the
  signed-in person's own phone number, one entry per child even when several clinics registered
  them. Only first name, last initial and birth year are shown before adding. Adding links all of
  that child's records together, so their profile shows every clinic. This access (`source:
  "phone"`) **ends on their 18th birthday** (`accessEndsAt`).
- **Anyone, at the clinic.** Staff add a family manager from the patient record (Family access),
  after confirming consent in person (`source: "clinic"`, no end date). Needed for adults such as
  elderly parents, and for children registered under another number. Staff can remove any link.

Rules for the header:

- A profile the caller doesn't (or no longer) manage gets `403 { code: "PROFILE_FORBIDDEN" }`.
  Keep the session: drop the header, switch back to the signed-in person and reload the family list.
- These always act for the signed-in person and refuse the header with `403 { code:
  "NOT_FOR_FAMILY_PROFILE" }`: `change-password`, `auth/setup-credentials`, `me/login-qr`, and
  adding/removing family members. `me/devices`, `session` (sign-out) and `GET /me/family` ignore it.
- Pushes about a family member also go to their managers' devices, with the title prefixed by the
  member's first name (`"Ana: You're next"`) and `data.profileId` set to the member's record id, so
  a tap can open that profile.

### eMCR sign-in, claim and activation (new)

eMCR is run separately from the clinics. **An eMCR account is one verified phone number**; the
clinics' patient records are attached to it once the caller answers "Is this your record?". These
endpoints replace `patients/auth/otp/*` + `auth/token {method:"otp"}` for phone sign-in (the old
ones still work, but they pick the most recently updated record on a shared household number).

| Method & path | Body | Notes |
|---|---|---|
| `POST /api/emcr/auth/otp/request` | `{ phone }` | Texts a 6-digit code (5 minutes) when any clinic has this number on file, as a patient's own number or a contact number. Always the same `200` answer. Rate limits as the old OTP |
| `POST /api/emcr/auth/otp/verify` | `{ phone, otp }` | → `{ claimToken, claimExpiresAt, peopleOnNumber, account, session }`. `session` is the Bearer fields (`token, tokenType, expiresIn, refreshToken, refreshExpiresIn, guardianOnly, patient`) when the account already has a profile (returning user); **`null` for a first sign-in**, then ask the questions with `claimToken` (valid 15 minutes). `peopleOnNumber`: how many people the clinics have on this number (never their names). Wrong code `401`, 5 wrong codes `429` |
| `POST /api/emcr/auth/claim` | `{ claimToken, relation: "self" \| "other", firstName, dateOfBirth: "YYYY-MM-DD", relationship? }` | "Is this your record?" → `{ status, profileId?, clinics?, account, session }`. `status`: `linked`, `already_linked`, or `pending_approval` (an **adult** someone else's: the clinic must approve; `clinics` = how many clinics were asked). A **minor** (`relation: "other"`, under 18) is added at once and lapses at 18. `session` once the account has any profile. Wrong answers: `400` with `code` `NO_MATCH` (first name + birth date don't match a record on this number; your own record must carry the number as its own phone), `AMBIGUOUS` (ask the clinic), `SELF_TAKEN` (the account already has its own record; use `"other"`). `401 CLAIM_EXPIRED`: start again from the code. 5 tries per 15 minutes, 10 per day |
| `POST /api/emcr/access-requests` | `{ tenantId, firstName, lastName, dateOfBirth, contactPhone?, contactEmail? }` | No sign-in. "Request access" for someone whose phone isn't on file. One of the contacts is required. Always the same `200` message. When the clinic has a single matching record with a phone/email, sign-in instructions go **to the contact on that record** (never to the one typed); otherwise the clinic's staff get the request. Clinics: `GET /api/tenants/directory?search=` |
| `GET /api/emcr/account` | | → `{ id, hasOwnRecord, guardianOnly, pendingRequests, activation }`. `activation`: `{ active, plan, activatedAt, expiresAt, daysLeft, enforced }` |
| `POST /api/emcr/activation/redeem` | `{ code }` | Voucher code (`ABCD-EFGH-JKMN`; dashes/spaces/case ignored). Adds a year (stacks on a running year). Always for the signed-in account (`X-Patient-Profile` ignored). → `{ message, activation, soldBy }`. `400` `code`: `INVALID`, `USED`, `NOT_PAID` (the clinic hasn't paid for that voucher batch yet). 10 tries per hour |

**Clinic invites** (the easiest way in). Staff tap "Send app invite" on the patient record and hand
over a printed slip (QR + code `ABCD-2345`) and/or text the link `https://<site>/i/ABCD2345`. That
page opens `myclinicsoft://invite?c=ABCD2345`. An invite is for the patient themselves (`self`) or
for a parent or carer (`guardian`, which can include siblings on the same number). It works once
and lasts 14 days. No name or birth-date questions are asked: the clinic already knows the person.
The sign-in code goes only to the number staff confirmed, so a found slip is useless without
that phone.

| Method & path | Body | Notes |
|---|---|---|
| `POST /api/emcr/invite/preview` | `{ code }` | `code` can be the typed code, the texted link or the scanned QR. → `{ clinicName, mode: "self" \| "guardian", people: ["Maria D.", …], phoneHint: "+63*******4567", expiresAt }`. Errors: `404 INVITE_INVALID` (unknown or cancelled), `410 INVITE_USED` / `INVITE_EXPIRED` |
| `POST /api/emcr/invite/send-code` | `{ code }` | Texts a 6-digit code to the invite's phone. → `{ sentTo, expiresInMinutes }`. Rate limits are the same as `otp/request` |
| `POST /api/emcr/invite/redeem` | `{ code, otp }` | Links what the invite names and signs in. → `{ account, session }` (shape as `otp/verify`). Errors: wrong code `401`; `409 RECORD_CHANGED` (the clinic changed the record since issuing; ask for a new invite); `409 SELF_TAKEN` (this number's account already holds someone else's own record); `410 INVITE_USED` |

**Sign-in credential: mobile number + password, on the eMCR account.** Patients have no password
until one is created:
- **When they verify:** after an invite is redeemed or a first SMS sign-in, `account.hasPassword` is `false`. The app must then ask for a password before going on.
- **By staff:** for a phone that can't get texts, staff tick "Their phone can't get texts" on the invite. That creates the account at once and prints a temporary password on the slip. Signing in with it returns `account.mustChangePassword: true`, and the app must have the person choose their own password.

The SMS code is still how the first password is set and how a forgotten one is reset.
Email + password on the patient record (`auth/token {method:"password"}`) still works for older
sign-ins.

| Method & path | Body | Notes |
|---|---|---|
| `POST /api/emcr/auth/password` | `{ phone, password }` | → `{ account, session }`. Wrong number or password: `401` (the same answer either way). `409 NO_PROFILE` when no records are linked yet. Same rate limits as `otp/verify` |
| `POST /api/emcr/account/password` | `{ newPassword, currentPassword? }` | Signed in; guardian sessions are allowed. Without `currentPassword`, the session must come from an SMS code in the last 15 minutes (first password or reset), else `400 OTP_REQUIRED` / `CURRENT_PASSWORD_REQUIRED`. With it: `400 WRONG_CURRENT_PASSWORD`. A temporary password has to be replaced, not reused. → `{ account }` |

`account` (in `otp/verify`, `claim`, `invite/redeem`, `auth/password`, `GET /api/emcr/account`) now has `hasPassword`, `mustChangePassword` and `loginId`.

**Login ID.** An account with its own record also gets a structured sign-in name once it has a
password, e.g. `qc01.jdc.19900425@myclinicsoft.solutions`:
- `qc01` is the clinic's **location code** (Clinic Settings, 2–6 letters/digits, unique).
- `jdc` is the first letter of each word of the patient's names.
- `19900425` is the birth date.
- A second person with the same parts gets `.2`, `.3`.

It is sent as `login` to `POST /api/emcr/auth/password`, in place of the mobile number. **It is not
a mailbox**; nothing is ever sent to it. It is given once and kept, even if the clinic later
changes its code. There is none for guardian-only accounts, or while no clinic of the person has
a location code. `auth/password` takes `{ login, password }`, where `login` is the mobile number
or the login ID; `phone` is still accepted.

`otp/verify`, `claim`, `redeem` and the invite endpoints return their fields at the top level (not under `data`);
`GET /api/emcr/account` returns them under `data`. After redeeming, other server instances may
still answer `402` for up to 30 seconds.

`DELETE /api/patients/session?all=true` refuses a guardian-only session (`403
NOT_FOR_FAMILY_PROFILE`): it would sign the managed person out everywhere. Sign out on this device.

Tokens from these endpoints carry two more claims:

- `acc`: the eMCR account id. Refresh keeps it.
- `rel: "guardian"`: the account has **no record of its own** (a parent who isn't a patient); the
  token is signed in on one of the records it manages (`guardianOnly: true`). `GET /me/family` then
  returns `self: null, guardianOnly: true` and every managed person in `members`; switch between
  them with `X-Patient-Profile` as usual. Credential routes (`change-password`,
  `setup-credentials`, `login-qr`, family add/remove, `phone-code`) refuse such a session with
  `403 NOT_FOR_FAMILY_PROFILE`; don't offer them.

**Activation gate.** Without an active year, these answer `402 { code: "ACTIVATION_REQUIRED" }`:
booking (`POST /api/patients/appointments`), `me/check-in`, `me/queue`, `me/health-summary` (+
`pdf-link`), `me/documents` (+ detail), `me/vitals`, `me/visits/[id]` and `me/lab-results/[id]`.
Free without activation: profile, the appointments, prescriptions, invoices, visits and lab-results
**lists**, notifications, clinics, family list. Show the "Enter activation code" screen on `402`.
The gate is only switched on when the server sets `EMCR_ACTIVATION_ENFORCED=true`
(`activation.enforced`); until then everything stays open. **Never show prices or "buy" wording
in the app**: vouchers are sold at clinic counters.

---

## Medical representative app

Reps sign in with the same staff account they set up from their invite email. The staff web login
now refuses rep accounts and points them to the app.

### Sign-in

| Method & path | Body | Response |
|---|---|---|
| `POST /api/medical-representatives/auth/token` **new** | `{ email, password }` | `{ token, tokenType: "Bearer", expiresIn, refreshToken, refreshExpiresIn, medicalRepresentative: { id, name, company, email } }` |
| ↳ when two-step sign-in is on | | `401 { requires2fa: true, pendingToken }` |
| `POST /api/medical-representatives/auth/2fa` **new** | `{ pendingToken, code }` | Same as a successful token sign-in. `pendingToken` expires after 5 min (`code: "PENDING_2FA_EXPIRED"`) |
| `DELETE /api/medical-representatives/session?deviceId=…` | `{ refreshToken }` | **Changed.** Sign out on this device: revokes the refresh token and unregisters the device from push |
| `DELETE /api/medical-representatives/session?all=true` | — | **New.** Revoke every token (sign out everywhere) |

Refusal codes on sign-in: `PASSWORD_SETUP_REQUIRED` (invite not accepted), `USER_INACTIVE`,
`MEDREP_INACTIVE` (registration not paid or activated).

### Profile & settings

| Method & path | Notes |
|---|---|
| `GET /api/medical-representatives/session` | Own profile (payment and internal fields removed) |
| `PUT /api/medical-representatives/profile` | `firstName, lastName, phone, company, territory, title, bio, profileImage` (base64 data URI, ≤ 2 MB, jpeg/png/gif/webp) |
| `PUT /api/medical-representatives/notifications` | `{ notificationsEnabled?, emailNotifications? }`. `notificationsEnabled: false` stops push. **Fixed:** these settings and `profileImage` were missing from the database schema and were silently discarded. They now save |
| `POST /api/medical-representatives/change-password` | `{ currentPassword, newPassword }`. **Changed:** returns a new `token` + `refreshToken` when called with Bearer auth |
| `POST /api/medical-representatives/devices` **new** | `{ deviceId, platform, pushToken?, appVersion? }`. Only one account at a time per device |
| `DELETE /api/medical-representatives/devices?deviceId=…` **new** | Unregister from push |

### Home

`GET /api/medical-representatives/dashboard` **new** returns:

```json
{
  "profile": { "firstName", "lastName", "company", "title", "territory", "profileImage", … },
  "stats": {
    "totalVisits", "visitsThisMonth", "completedThisMonth", "upcomingVisits",
    "activeProducts", "expiringProducts", "openSupportRequests"
  },
  "nextVisits": [ /* up to 5 scheduled visits from today on, soonest first */ ]
}
```

"This month" is the UTC calendar month. `expiringProducts` counts active products that expire
within 30 days.

### Visits, products, support

| Method & path | Notes |
|---|---|
| `GET /api/medical-representatives/visits` | **Changed:** now paginated (default 50, max 100). Filters: `status`, `from`, `to` |
| `POST /api/medical-representatives/visits` | `{ clinicName, clinicLocation, purpose, date, time: "HH:mm", duration?, status?, notes? }` |
| `GET /api/medical-representatives/visits/[id]` **new** · `PUT` · `DELETE` | `PUT` takes the full object |
| `GET /api/medical-representatives/products` | **Changed:** now paginated (default 50, max 100). Filter: `status` |
| `POST /api/medical-representatives/products` | `{ name, category, manufacturer, description, packaging, expiryDate, dosage?, strength?, status? }` |
| `GET /api/medical-representatives/products/[id]` **new** · `PUT` · `DELETE` | `PUT` takes the full object |
| `GET /api/medical-representatives/support` **new** | Own requests with `reference: "SR-…"` and `status` |
| `POST /api/medical-representatives/support` | `{ subject, message, category?, email? }`. **Changed:** `email` defaults to the account email |

### Push

A daily job at 10:00 UTC (18:00 in Manila) sends each rep at most one push per kind:

- **Upcoming visits:** scheduled visits from today through the next 24 hours.
  `data: { screen: "visits", id? }` (`id` when there's exactly one visit).
- **Products expiring soon:** active products within 30 days of expiry.
  `data: { screen: "products", id? }`.

Each visit or product is reminded once. Changing a visit's date or time, or a product's expiry
date, makes it eligible again. Reps with `notificationsEnabled: false` get no push.

Registration stays on the web (`/medical-representatives/onboard`, which needs payment) and calls
`POST /api/medical-representatives/onboard`.

---

## Not built yet

- **Paying invoices in the app** (deferred by decision). Clinics have no payment accounts of their
  own, and the platform's PayMongo account must not collect clinic money. Invoices are view-only.
  Show "Pay at the clinic".
- **Lab-result PDFs.** Lab results come back as structured data. A PDF only exists if the clinic
  uploaded one as a document.
