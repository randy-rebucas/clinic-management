# MyClinicSoft public API and webhooks

For developers connecting another system (a lab system, a booking site, an accounting tool, a data warehouse) to one clinic's MyClinicSoft account.

Clinics on the **Professional** and **Enterprise** plans get the REST API and webhooks. A clinic admin creates keys and webhook endpoints under **Admin → Developers**.

## Authentication

Every request carries a clinic API key as a bearer token:

```
Authorization: Bearer mcs_<key id>_<secret>
```

- **Shown once.** The key appears only when it is created. MyClinicSoft stores only a hash of it.
- **One clinic.** A key belongs to one clinic and only ever sees that clinic's records.
- **Scopes.** A key carries the scopes it was given:

| Scope | Allows |
|---|---|
| `patients:read` | List and fetch patients |
| `patients:write` | Register patients |
| `appointments:read` | List and fetch appointments |
| `appointments:write` | Book appointments |
| `doctors:read` | List doctors |
| `invoices:read` | List and fetch invoices |

- **Revocation.** Revoking a key in Admin → Developers takes effect immediately.
- **Lapsed plans.** If the clinic's plan lapses or drops below Professional, requests are refused with `403 plan_required` until it is renewed.

**Rate limit:** 120 requests a minute per key. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit you get a `429` with `Retry-After`.

## Errors

Errors use this shape:

```json
{ "error": { "code": "insufficient_scope", "message": "This key does not have the `patients:write` scope." } }
```

| Status | Codes |
|---|---|
| 400 | `invalid_json`, `validation_failed` (with `details[]`), `invalid_parameter`, `invalid_cursor` |
| 401 | `unauthenticated` |
| 403 | `insufficient_scope`, `plan_required`, `plan_limit` |
| 404 | `not_found` |
| 409 | `slot_taken` |
| 429 | `rate_limited` |

## Pagination

Lists return results newest first:

```json
{ "data": [ … ], "has_more": true, "next_cursor": "6716…" }
```

Pass `?cursor=<next_cursor>` to get the next page. `?limit=` takes 1–100 and defaults to 25.

## Endpoints

The base URL is `https://<your domain>/api/v1`.

### `GET /me`

Returns the clinic and scopes behind the key. Any valid key can call it.

### Patients

**`GET /patients`** takes these query parameters:
- `q`: matches name, patient code, phone or email.
- `updated_since`: an ISO 8601 date.

**`GET /patients/{id}`** returns one patient.

**`POST /patients`** registers a patient. The clinic's plan patient limit applies, and no welcome message is sent.

```json
{
  "first_name": "Ana", "last_name": "Cruz", "date_of_birth": "1990-04-02", "sex": "female",
  "phone": "+639171234567", "email": "ana@example.com",
  "address": { "street": "12 Rizal St", "city": "Quezon City", "state": "Metro Manila", "zip_code": "1100" }
}
```

A patient record looks like this:

```json
{
  "id": "…", "object": "patient", "patient_code": "CLINIC-0042",
  "first_name": "Ana", "middle_name": null, "last_name": "Cruz", "suffix": null,
  "date_of_birth": "1990-04-02", "sex": "female", "email": "ana@example.com", "phone": "+639171234567",
  "address": { "street": "…", "city": "…", "state": "…", "zip_code": "…" },
  "active": true, "created_at": "…", "updated_at": "…"
}
```

Medical history, allergies, identifiers (PhilHealth, government ID), guardians and sign-in details are never exposed.

### Appointments

**`GET /appointments`** takes these query parameters:
- `date_from` and `date_to`: YYYY-MM-DD, inclusive.
- `status`: one of `pending`, `scheduled`, `confirmed`, `rescheduled`, `no-show`, `completed`, `cancelled`.
- `patient_id` and `doctor_id`.

**`GET /appointments/{id}`** returns one appointment.

**`POST /appointments`** books an in-person appointment:

```json
{ "patient_id": "…", "doctor_id": "…", "date": "2026-11-03", "time": "14:30", "duration_minutes": 30, "reason": "Follow-up" }
```

- `date` and `time` are in the clinic's timezone. `GET /me` returns that timezone.
- `duration_minutes` defaults to the clinic's default appointment length.
- `status` may be `pending`, `scheduled` (the default) or `confirmed`.
- If the doctor already has an overlapping appointment, the response is `409 slot_taken`.

An appointment record looks like this:

```json
{
  "id": "…", "object": "appointment", "appointment_code": "APT-000123",
  "patient_id": "…", "doctor_id": "…", "date": "2026-11-03", "time": "14:30", "duration_minutes": 30,
  "status": "scheduled", "modality": "in-person", "is_walk_in": false, "queue_number": null,
  "reason": "Follow-up", "created_at": "…", "updated_at": "…"
}
```

Staff notes and video-visit links are never exposed.

### Doctors

**`GET /doctors`** returns active doctors. Pass `?status=all` to include inactive doctors and those on leave. Each doctor has `id`, `title`, `first_name`, `last_name`, `specialization`, `department` and `status`.

### Invoices

**`GET /invoices`** takes `status` (`unpaid`, `partial`, `paid` or `refunded`), `patient_id` and `updated_since`.

**`GET /invoices/{id}`** returns one invoice with these fields:
- `invoice_number`, `patient_id`, `visit_id` and `status`
- `subtotal`, `total`, `total_paid` and `outstanding_balance`
- `items[]`: each with `description`, `quantity`, `unit_price` and `amount`

## Webhooks

A clinic admin adds an HTTPS endpoint in Admin → Developers and picks which events to send to it. The signing secret is shown once.

### Events

Every event is sent no matter where the change was made: the clinic app, the patient app, online booking, automations or this API.

| Event | When | `data.object` |
|---|---|---|
| `patient.created` | A patient is registered | patient |
| `appointment.created` | An appointment is booked | appointment |
| `appointment.status_changed` | An appointment's status changes | appointment, plus `previous_status` |
| `invoice.paid` | An invoice becomes fully paid | invoice |
| `ping` | **Send test** in Admin → Developers | `{ "message": … }` |

### Request

Each event arrives as a `POST` with a JSON body:

```json
{ "id": "evt_…", "type": "appointment.status_changed", "created_at": "2026-10-20T08:15:00.000Z", "data": { "object": { … } } }
```

The request carries these headers:

```
MCS-Event: appointment.status_changed
MCS-Delivery: <delivery id>
MCS-Signature: t=1760948100,v1=5f2b…
```

### Verifying the signature

`v1` is the hex HMAC-SHA256 of `"<t>.<raw request body>"`, keyed with your signing secret. To verify a request:

1. Compute the HMAC over the raw bytes you received, before parsing the JSON.
2. Compare it to `v1` in constant time.
3. Reject timestamps more than 5 minutes old.

```js
import crypto from 'node:crypto';

function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

### Delivery and retries

- **Acknowledging.** Answer with any 2xx within 10 seconds. Redirects are not followed.
- **Retries.** Anything else is retried after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours and 12 hours. That is 7 attempts over about 21 hours, after which the delivery is marked failed.
- **Duplicates.** A delivery can arrive more than once, so de-duplicate on the event `id`.
- **Order.** Events can arrive out of order. Use `updated_at` on the object to tell which is newer.
- **Auto-disable.** After 25 failed deliveries in a row the endpoint is switched off, and a clinic admin has to switch it back on.
- **History.** Admin → Developers lists recent deliveries and can send any of them again. Deliveries are kept for 30 days.
- **Address restrictions.** Endpoints must be HTTPS and resolve to public addresses. Private, loopback and cloud-metadata addresses are refused.
