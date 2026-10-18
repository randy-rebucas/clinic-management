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
| `POST /api/patients/me/login-qr` | Issue a login QR to sign in on another device (replaces any unused one). Single use, 15 minutes. A scoped session issues a QR with the same `tid` |
| `DELETE /api/patients/me/login-qr` | Revoke the login QR **and sign out every session** (a QR that was already scanned can't be told apart). The caller gets a new `token`, `expiresIn`, `refreshToken`, `refreshExpiresIn`. Optional `{ deviceId }` keeps this device's push |
| `POST /api/patients/me/devices` | `{ deviceId, platform: "ios"\|"android", pushToken?, appVersion? }`. Call after sign-in, after a password change, and when the Expo token changes. **Changed:** a device or push token belongs to one patient at a time; registering it removes any other patient's registration of the same `deviceId` or `pushToken` |
| `DELETE /api/patients/me/devices?deviceId=…` | Unregister from push |

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
| `GET /api/patients/appointments?date=YYYY-MM-DD&doctorId=…` | Adds `data.availableSlots: ["09:00", …]`: 30-minute slots inside that doctor's hours for the day (today's past slots dropped). `data.dayOff: true` with an empty list when the doctor doesn't work that date, or the date is past the 60-day booking horizon. Each doctor in `data.doctors` carries `hoursSummary` (weekly hours) and `bookableDates` (the dates they can be booked) |
| `POST /api/patients/appointments` | `{ doctorId, appointmentDate: "YYYY-MM-DD", appointmentTime: "HH:mm", reason? }`. `409` = slot taken. **New** `400` codes: `SLOT_PAST` (time already passed), `SLOT_BEYOND_HORIZON` (more than 60 days ahead), `SLOT_NOT_WORKING` (outside the doctor's hours that day), `SLOT_OFF_GRID` (not on the 30-minute grid) |
| `DELETE /api/patients/appointments/[id]` | Cancel. Refused for past, completed or no-show appointments |

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

`PATCH /api/patients/me/notifications` with `{ ids: [...] }` or `{ markAllRead: true }`.
**Fixed:** `markAllRead` used to clear the read list, which made every notification unread again.
It now marks the current feed as read.

**Fixed:** lab-result notifications never appeared. The feed filtered on statuses LabResult
doesn't have (`available`/`abnormal`/`critical`). It now uses `completed`/`reviewed`, takes the test
name from `request.testType`, and flags results with any value marked high or low. Appointment and
booking doctor objects now carry a real `specialization` name, which was always blank before.

Push payloads (Expo) carry `data.tag` and sometimes `data.url`. Treat both as hints and refresh the
relevant list.

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
  own, and the platform's PayPal account must not collect clinic money. Invoices are view-only.
  Show "Pay at the clinic".
- **Lab-result PDFs.** Lab results come back as structured data. A PDF only exists if the clinic
  uploaded one as a document.
