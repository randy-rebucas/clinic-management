# Tenant Integration API

**Purpose:** Third-party app integration — clinic selection and validation  
**Base URL:** `https://{ROOT_DOMAIN}/api/tenants`  
**Last updated:** 2026-04-04

These two endpoints are the recommended integration surface for any external app that needs to let users pick a clinic and confirm it is active and subscribed.

---

## Flow

```
Third-party app
      │
      ├─── 1. Show clinic picker
      │         GET /api/tenants/directory?search=sunshine
      │         → paginated list of active clinics
      │
      ├─── 2. User selects a clinic
      │
      └─── 3. Validate before proceeding
                GET /api/tenants/validate?subdomain=sunshine
                → { valid: true, tenant: {...}, subscription: {...} }
                  or
                → { valid: false, reason: "...", message: "..." }
```

---

## Endpoints

### GET /api/tenants/directory

Returns a paginated, searchable list of active clinics. Use this to populate the clinic-selection UI in your app.

**Auth required:** No  
**Rate limit:** 100 requests / minute per IP

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Case-insensitive partial match on clinic name, display name, or subdomain |
| `city` | string | — | Filter by city (case-insensitive) |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page (max 50) |

**Examples:**

```
GET /api/tenants/directory
GET /api/tenants/directory?search=sunshine
GET /api/tenants/directory?city=Manila&page=1&limit=10
GET /api/tenants/directory?search=clinic&page=2&limit=20
```

**Success response — 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "664abc123def456789000001",
      "name": "Sunshine Clinic",
      "displayName": "Sunshine Medical Clinic",
      "subdomain": "sunshine",
      "city": "Manila",
      "state": "NCR",
      "country": "Philippines",
      "logo": "https://res.cloudinary.com/.../logo.png"
    },
    {
      "id": "664abc123def456789000002",
      "name": "Riverdale Health Center",
      "displayName": "Riverdale Health Center",
      "subdomain": "riverdale",
      "city": "Quezon City",
      "state": "NCR",
      "country": "Philippines",
      "logo": null
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Field descriptions:**

| Field | Description |
|---|---|
| `id` | MongoDB ObjectId (string) — use this as an opaque reference |
| `name` | Official clinic name |
| `displayName` | Public-facing name (falls back to `name` if not set) |
| `subdomain` | Unique identifier — **pass this to `/validate`** |
| `city` / `state` / `country` | Location for display; may be `null` |
| `logo` | Cloudinary URL or `null` |

> Only `status: "active"` clinics are returned. Inactive and suspended clinics are excluded.

---

### GET /api/tenants/validate

Validates that a specific clinic:
1. Exists in the system
2. Has `status: "active"`
3. Has a subscription record
4. Subscription is not cancelled
5. Subscription has not expired

**Auth required:** No  
**Rate limit:** 20 requests / minute per IP  
**Always returns HTTP 200** — check the `valid` boolean and `reason` code in your app logic.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `subdomain` | string | Yes | The `subdomain` value from the directory listing |

**Examples:**

```
GET /api/tenants/validate?subdomain=sunshine
GET /api/tenants/validate?subdomain=riverdale
```

---

#### Valid clinic response — 200

```json
{
  "success": true,
  "valid": true,
  "tenant": {
    "id": "664abc123def456789000001",
    "name": "Sunshine Clinic",
    "displayName": "Sunshine Medical Clinic",
    "subdomain": "sunshine",
    "status": "active",
    "city": "Manila",
    "state": "NCR",
    "country": "Philippines",
    "logo": "https://res.cloudinary.com/.../logo.png"
  },
  "subscription": {
    "plan": "pro",
    "status": "active",
    "billingCycle": "monthly",
    "isActive": true,
    "isTrial": false,
    "isExpired": false,
    "expiresAt": "2026-05-04T00:00:00.000Z",
    "daysRemaining": 30
  }
}
```

#### Trial clinic response — 200

```json
{
  "success": true,
  "valid": true,
  "tenant": { ... },
  "subscription": {
    "plan": "trial",
    "status": "active",
    "billingCycle": "monthly",
    "isActive": true,
    "isTrial": true,
    "isExpired": false,
    "expiresAt": "2026-04-11T00:00:00.000Z",
    "daysRemaining": 7
  }
}
```

#### Invalid clinic response — 200

```json
{
  "success": true,
  "valid": false,
  "reason": "subscription_expired",
  "message": "This clinic's subscription has expired. Please contact the clinic to renew."
}
```

---

#### Reason codes

When `valid: false`, the `reason` field tells your app exactly why validation failed so you can show an appropriate message.

| `reason` | Meaning | Suggested action |
|---|---|---|
| `missing_subdomain` | No `subdomain` query param provided | Fix your API call |
| `not_found` | No clinic exists with this subdomain | Show "clinic not found" message |
| `inactive` | Clinic is inactive or suspended | "Contact the clinic for assistance" |
| `no_subscription` | Clinic has no subscription record | "Contact the clinic" |
| `subscription_cancelled` | Subscription was cancelled | "Contact the clinic to reactivate" |
| `subscription_expired` | `expiresAt` is in the past | "Contact the clinic to renew" |

#### Subscription fields

| Field | Type | Description |
|---|---|---|
| `plan` | string \| null | `"trial"`, `"basic"`, `"pro"`, etc. |
| `status` | string \| null | `"active"`, `"cancelled"`, `"expired"` |
| `billingCycle` | string \| null | `"monthly"` or `"yearly"` |
| `isActive` | boolean | `true` only when all checks pass |
| `isTrial` | boolean | `true` when `plan === "trial"` |
| `isExpired` | boolean | `true` when `expiresAt < now` |
| `expiresAt` | ISO 8601 string \| null | When the subscription ends (null = no expiry set) |
| `daysRemaining` | number \| null | Days until expiry; null if no `expiresAt` |

---

## Integration Example

### JavaScript / TypeScript (fetch)

```typescript
// Step 1 — fetch clinic list as the user types
async function searchClinics(query: string) {
  const res = await fetch(
    `https://myclinicsoft.com/api/tenants/directory?search=${encodeURIComponent(query)}&limit=10`
  );
  const data = await res.json();
  if (!data.success) throw new Error('Failed to load clinics');
  return data.data; // array of clinics
}

// Step 2 — validate when user selects a clinic
async function validateClinic(subdomain: string) {
  const res = await fetch(
    `https://myclinicsoft.com/api/tenants/validate?subdomain=${encodeURIComponent(subdomain)}`
  );
  const data = await res.json();

  if (!data.valid) {
    // Show data.message to the user
    throw new Error(data.message);
  }

  if (data.subscription.isTrial) {
    // Optional: warn user that the clinic is on a trial plan
    console.warn('Clinic is on trial — expires in', data.subscription.daysRemaining, 'days');
  }

  return data; // { tenant, subscription }
}
```

### React hook example

```tsx
const [clinics, setClinics] = useState([]);
const [selected, setSelected] = useState(null);
const [validation, setValidation] = useState(null);
const [error, setError] = useState('');

// Search as user types
const handleSearch = async (query: string) => {
  const res = await fetch(`/api/tenants/directory?search=${encodeURIComponent(query)}`);
  const data = await res.json();
  setClinics(data.data);
};

// Validate on selection
const handleSelect = async (clinic) => {
  setSelected(clinic);
  const res = await fetch(`/api/tenants/validate?subdomain=${clinic.subdomain}`);
  const data = await res.json();

  if (!data.valid) {
    setError(data.message);
    return;
  }

  setValidation(data);
  setError('');
  // Proceed with clinic.subdomain or data.tenant.id
};
```

---

## Rate Limit Headers

Both endpoints return standard rate limit headers:

```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 99
X-RateLimit-Reset:     2026-04-04T12:01:00.000Z
```

On limit exceeded (HTTP 429):
```json
{
  "success": false,
  "error": "Rate limit exceeded, please slow down",
  "retryAfter": 45
}
```
Header: `Retry-After: 45`

---

## Notes

- The `subdomain` from the directory listing is the canonical identifier — always use it for the validate call, not the `id`.
- `daysRemaining` is `null` when the plan has no expiry date set (perpetual/lifetime plans).
- Trial clinics (`isTrial: true`) are **valid** — they pass all checks while the trial is active. Your app can choose to display a warning.
- The validate endpoint does **not** require authentication. Do not use it to gate sensitive operations on your side — use it only as a pre-check before directing a user to the clinic's subdomain.
