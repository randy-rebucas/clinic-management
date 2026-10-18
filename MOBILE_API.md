# Mobile API — Patient & Medical Representative apps

The web portals for patients (`/patient/portal`) and medical representatives
(`/medical-representative/*`) have been removed. Both audiences use the mobile app, which talks
to the endpoints below. Staff keep the web app.

## Conventions

- **Base URL:** the apex domain (e.g. `https://myclinicsoft.com`). Don't call a clinic subdomain
  from the app: the patient endpoints read the patient's clinics from their record, and reps
  aren't tied to one clinic.
- **Auth:** `Authorization: Bearer <token>` on every authenticated call. The app never needs
  cookies. Requests with no cookies skip the CSRF check, so no `Origin` header is needed.
- **Envelope:** `{ "success": true, "data": … }` or `{ "success": false, "error": "message", "code"?: "…" }`.
- **Pagination** (list endpoints): `?page=1&limit=…` →
  `"pagination": { "total", "page", "limit", "totalPages" }`. `GET /api/patients/me/appointments`
  is the one exception: it returns `pages` instead of `totalPages`.
- **Tokens:** every sign-in returns an access `token` (Bearer, valid 7 days, `expiresIn`) and a
  `refreshToken` (valid 60 days, `refreshExpiresIn`). Keep both in secure storage only.
  - On a `401` from any endpoint, call the audience's refresh endpoint **once**, store **both** new
    tokens, and retry the request. Refresh tokens are single-use and rotate on every refresh.
  - Only one refresh may be in flight at a time. If two requests both get a `401`, they share one
    refresh call. Sending the same refresh token twice counts as theft (`REFRESH_REUSED`): every
    token in that chain is revoked and the user must sign in again.
  - A refresh `401` (`REFRESH_INVALID` / `REFRESH_REUSED`) means: go to sign-in.
  - A password change or "sign out everywhere" kills every existing token and refresh token. The
    password-change response carries a new `token` and `refreshToken` for the current device.

  | Audience | Refresh endpoint |
  |---|---|
  | Patient | `POST /api/patients/auth/refresh` `{ refreshToken }` |
  | Medical representative | `POST /api/medical-representatives/auth/refresh` `{ refreshToken }` |

  Both return `{ token, tokenType, expiresIn, refreshToken, refreshExpiresIn }`.
- **401 means the token is bad, nothing else.** A wrong *current* password on change-password or
  setup-credentials is `400 { code: "WRONG_CURRENT_PASSWORD" }`, so don't refresh on it.
- **Rate limits:** sign-in endpoints are limited per IP and per account. `429` means wait.
- **Dates:** ISO 8601 strings. Appointment times are `HH:mm` in the clinic's timezone.

---

## Patient app

### Sign-in

| Method & path | Body | Notes |
|---|---|---|
| `POST /api/patients/auth/token` | `{ method: "password", email, password, tenantId? }` | → `{ token, tokenType: "Bearer", expiresIn, refreshToken, refreshExpiresIn, patient }` |
| `POST /api/patients/auth/token` | `{ method: "otp", phone, otp, tenantId? }` | Request the code first with the OTP endpoint below |
| `POST /api/patients/auth/token` | `{ method: "qr", qrCode }` | **New.** `qrCode` is the raw scanned string `{"type":"patient_login","token":"…"}` (the registration QR, or one from `POST /me/login-qr`) |
| `POST /api/patients/auth/otp/request` | `{ phone, tenantId? }` | Sends a 6-digit SMS code, valid for 5 minutes |
| `POST /api/patients/auth/setup-credentials` | `{ email?, password, currentPassword? }` | Sets an email and password after an OTP or QR sign-in. May return a new `token` |
| `DELETE /api/patients/session?deviceId=…` | `{ refreshToken }` | **Changed.** Sign out on this device: revokes the refresh token (even if the access token has expired) and unregisters the device from push |
| `DELETE /api/patients/session?all=true` | — | **New.** Sign out everywhere: revokes every token and the login QR |

### Profile & devices

| Method & path | Notes |
|---|---|
| `GET /api/patients/me` | Own profile |
| `PATCH /api/patients/me` | Only `contacts.{email,address}`, `address.{street,city,state,zipCode}` and `emergencyContact.{name,phone,relationship}` |
| `POST /api/patients/me/change-password` | `{ currentPassword?, newPassword }` (min 8). Returns a new `token` |
| `POST /api/patients/me/login-qr` / `DELETE` | Issue or revoke the patient's login QR |
| `POST /api/patients/me/devices` | `{ deviceId, platform: "ios"\|"android", pushToken?, appVersion? }`. Call after sign-in and when the Expo token changes |
| `DELETE /api/patients/me/devices?deviceId=…` | Unregister from push |

### Records (read-only, paginated, newest first)

| List | Detail | Filters |
|---|---|---|
| `GET /api/patients/me/appointments` | `GET /api/patients/me/appointments/[id]` **new** | `status`, `tenantId` |
| `GET /api/patients/me/lab-results` | `GET /api/patients/me/lab-results/[id]` **new** | `tenantId` |
| `GET /api/patients/me/prescriptions` | `GET /api/patients/me/prescriptions/[id]` **new** | `tenantId` |
| `GET /api/patients/me/invoices` (+ `summary.outstandingBalance`) | `GET /api/patients/me/invoices/[id]` **new** (+ `summary.{paid,balance}`) | `status`, `tenantId` |
| `GET /api/patients/me/visits` | `GET /api/patients/me/visits/[id]` | `tenantId` |
| `GET /api/patients/me/documents` | `GET /api/patients/me/documents/[id]` **new**: the file bytes, inline. Add `?download=true` for an attachment | `category`, `tenantId` |
| `GET /api/patients/me/vitals` | — | |
| `GET /api/patients/me/queue` | — | Poll every ~15 s while the screen is in the foreground |

Opening a document is an authenticated GET that returns the file itself, so download it with the
Bearer header (e.g. `expo-file-system` `downloadAsync` with `headers`). Don't hand the URL to a
browser, because the browser won't send the token. Confidential and deleted documents return 404.

### Appointments (write)

| Method & path | Notes |
|---|---|
| `GET /api/patients/appointments` | `data.doctors` at the patient's clinic. Pass `?tenantId=` for a clinic other than their first |
| `GET /api/patients/appointments?date=YYYY-MM-DD&doctorId=…` | Adds `data.availableSlots: ["09:00", …]` (30-minute slots, 09:00–17:00) |
| `POST /api/patients/appointments` | `{ doctorId, appointmentDate: "YYYY-MM-DD", appointmentTime: "HH:mm", reason? }`. `409` = slot taken |
| `DELETE /api/patients/appointments/[id]` | Cancel. Refused for past, completed or no-show appointments |

### Notifications

`GET /api/patients/me/notifications?unreadOnly=true` returns a feed built from the last 90 days of
appointments, lab results, unpaid invoices and prescriptions, plus `unreadCount`.

**Changed:** each item now carries `target: { screen, id }` instead of the old `actionUrl`, which
linked into the web portal. `screen` is one of `appointments | lab-results | invoices | prescriptions`,
and `id` is the record id for the matching detail endpoint.

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
