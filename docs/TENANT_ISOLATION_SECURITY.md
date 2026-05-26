# Tenant Isolation & Security Architecture

**Project:** MyClinicsoftSoft  
**Purpose:** Deep dive into multi-tenancy security model, isolation guarantees, and threat model  
**Last updated:** 2026-04-23

---

## Table of Contents

1. [Isolation Guarantees](#1-isolation-guarantees)
2. [Threat Model](#2-threat-model)
3. [Data Access Control](#3-data-access-control)
4. [Cross-Tenant Data Exposure Risks](#4-cross-tenant-data-exposure-risks)
5. [Authentication & Session Isolation](#5-authentication--session-isolation)
6. [Authorization & Permissions](#6-authorization--permissions)
7. [Subscription & Resource Limits](#7-subscription--resource-limits)
8. [Audit Logging](#8-audit-logging)
9. [Security Checklist](#9-security-checklist)
10. [Incident Response](#10-incident-response)

---

## 1. Isolation Guarantees

### Guarantee 1: Data is Logically Isolated by tenantId

Every document in collections includes a `tenantId` field (except Patient which uses `tenantIds` array).

```
┌─ Collection: Appointment
│  ├─ { _id: 1, name: "Patient X", tenantId: A, ... }
│  ├─ { _id: 2, name: "Patient Y", tenantId: B, ... }
│  └─ { _id: 3, name: "Patient Z", tenantId: A, ... }
│
└─ Tenant A only sees: [1, 3]
   Tenant B only sees: [2]
```

**Guarantee Level:** Application-enforced (**not** database-enforced)

### Guarantee 2: Query Filters Are Mandatory

Every API route must explicitly include `tenantId` in query conditions.

```typescript
// ✅ Compliant:
Appointment.find({ tenantId: A })

// ❌ Non-compliant (will expose cross-tenant data):
Appointment.find({})  // Returns all appointments!
```

**Risk:** A missing filter anywhere in the codebase is a data breach.

### Guarantee 3: Sessions Are Tenant-Scoped

Staff sessions carry `tenantId` in the JWT. A staff member of Clinic A cannot act on Clinic B data even if they guess an API endpoint.

```
┌─ Clinic A Staff
│  session = { userId: "U1", tenantId: "A" }
│  Calls: GET /api/appointments
│  Returns: Appointments with tenantId="A" only
│
└─ Clinic B Staff
   session = { userId: "U2", tenantId: "B" }
   Calls: GET /api/appointments
   Returns: Appointments with tenantId="B" only
```

### Guarantee 4: Physical Subdomain Routing

The request subdomain is extracted and used to look up the tenant, providing a second barrier:

```
Request: GET clinic-a.myclinicsoft.com/api/appointments
    ↓
Extract subdomain: "clinic-a"
    ↓
Resolve tenant: Tenant.findOne({ subdomain: "clinic-a" })
    ↓
tenantContext.tenantId = "A"
    ↓
Verify session.tenantId matches tenantContext.tenantId (or use one if other is null)
    ↓
Query: Appointment.find({ tenantId: "A" })
```

If subdomain and session disagree, the request is rejected.

---

## 2. Threat Model

### Threat 1: Malicious Query (No Tenant Filter)

**Scenario:** A developer forgets to add `tenantId` to a query.

```typescript
// Bug:
const allAppointments = await Appointment.find({ status: 'confirmed' });
// Returns ALL confirmed appointments across ALL tenants
```

**Impact:** Any staff member accessing this endpoint sees all clinic data.

**Mitigation:**
- Code review checklist (see section 9)
- Automated tests verify tenant isolation
- Pre-save hooks add tenantId if missing (but not foolproof)

### Threat 2: Modified JWT Token

**Scenario:** Staff member decodes JWT and modifies `tenantId` field.

```typescript
// Original JWT:
{ userId: "U1", tenantId: "A", ... }

// Modified JWT (attempted):
{ userId: "U1", tenantId: "B", ... }  // ← Attacker tries to access Clinic B
```

**Impact:** If signature validation fails, attacker gains unauthorized access.

**Mitigation:**
- JWT signed with `SESSION_SECRET` (HMAC-SHA256)
- Tampering invalidates signature
- Invalid signatures rejected at `verifySession()` call

### Threat 3: Cookie Theft / Session Hijacking

**Scenario:** Attacker steals valid `session` cookie from staff member.

```
┌─ Legitimate staff member
│  Cookie: session = "eyJ...valid...JWT"
│  Access: clinic-a.myclinicsoft.com
│
└─ Attacker gains cookie
   Cookie: session = "eyJ...valid...JWT"  (← Same cookie!)
   Access: clinic-a.myclinicsoft.com as if they are legitimate staff
```

**Impact:** Attacker gains full access to Clinic A data.

**Mitigation:**
- `HttpOnly` flag prevents JavaScript theft
- `Secure` flag (production) prevents HTTP interception
- `SameSite=lax` reduces CSRF risk
- Short TTL (7 days) limits exposure window
- IP pinning not implemented (could add)

### Threat 4: CSRF Attack (Cross-Site Request Forgery)

**Scenario:** Attacker tricks staff member into submitting form to malicious endpoint.

```html
<!-- Attacker's site sends: -->
<form action="https://clinic-a.myclinicsoft.com/api/appointments" method="POST">
  <input name="patientId" value="ATTACKER-CONTROLLED-PATIENT-ID" />
  <!-- Browser auto-includes session cookie -->
</form>
```

**Impact:** Malicious POST request executed with staff member's credentials.

**Mitigation:**
- CSRF token verification in `proxy.ts` middleware (currently **not wired**)
- Origin header validation (currently **not wired**)

**Action Required:** Activate `proxy.ts` as `middleware.ts` to enable CSRF protection.

### Threat 5: Direct Database Access

**Scenario:** Attacker gains MongoDB URI and connects directly.

```
mongodb+srv://username:password@cluster.mongodb.net/db
    ↓
db.appointments.find({ tenantId: { $ne: "their-tenant" } })
    ↓
Attacker reads ALL data
```

**Impact:** Complete data breach across all tenants.

**Mitigation:**
- Enforce principle of least privilege on database user (read-only for analytics, etc.)
- Use IP allowlisting (MongoDB Atlas)
- Encrypt database password in `.env.local`
- Monitor database logs for unusual queries
- Use VPC (virtual private cloud) if available

### Threat 6: Race Condition / Concurrent Mutations

**Scenario:** Two requests try to update the same patient record concurrently.

```
Request A: PATCH /api/patients/123
  └─ Reads: { name: "John", tenantId: "A" }
  
Request B: PATCH /api/patients/123
  └─ Reads: { name: "John", tenantId: "A" }
  
Request A: Writes: { name: "John Updated", tenantId: "A" }
Request B: Writes: { name: "John Again", tenantId: "A" }  (Race condition)
```

**Impact:** Data inconsistency (race condition, not a direct security issue).

**Mitigation:**
- Use Mongoose `findByIdAndUpdate()` (atomic)
- Use version fields for optimistic locking
- Use MongoDB transactions for complex operations

### Threat 7: Privilege Escalation Within Tenant

**Scenario:** Receptionist (level 40) tries to perform admin action (level 100).

```
Receptionist JWT: { role: "receptionist", roleId: "R2", ... }
Attempt: DELETE /api/users  (admin only)
```

**Impact:** If authorization is missing, receptionist deletes all staff.

**Mitigation:**
- Role-based access control (RBAC) enforced per endpoint
- Each API route checks `session.roleId` and `Permission` table
- See section 6 for details

---

## 3. Data Access Control

### Three-Layer Access Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Authentication                                      │
│ ✓ Is the requester logged in?                               │
│ ✓ Is the JWT valid (signature, expiration)?                 │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Tenant Context                                      │
│ ✓ Does the subdomain match the session's tenantId?          │
│ ✓ Is the tenant active (status="active")?                   │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Authorization                                       │
│ ✓ Does the user's role have permission for this action?     │
│ ✓ Does the document being accessed belong to this tenant?   │
└─────────────────────────────────────────────────────────────┘
```

### Typical API Route Structure

```typescript
export async function PATCH(req: Request, { params }: Context) {
  // Layer 1: Verify session
  const session = await verifySession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  // Layer 2: Verify tenant context
  const tenantContext = await getTenantContext();
  const tenantId = session.tenantId || tenantContext.tenantId;
  if (!tenantId) return json({ error: 'No tenant' }, { status: 400 });
  if (tenantContext.subdomain && !tenantContext.tenant) {
    return json({ error: 'Tenant not found' }, { status: 404 });
  }

  // Layer 3a: Verify authorization (role-based)
  const permission = await Permission.findOne({
    roleId: session.roleId,
    resource: 'appointments',
    action: 'update'
  });
  if (!permission?.allowed) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Layer 3b: Verify document ownership (tenant isolation)
  const appointment = await Appointment.findOne({
    _id: new Types.ObjectId(params.id),
    tenantId: new Types.ObjectId(tenantId)
  });
  if (!appointment) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  // Proceed with update
  appointment.notes = 'updated';
  await appointment.save();
  return json(appointment);
}
```

---

## 4. Cross-Tenant Data Exposure Risks

### Risk 1: Missing tenantId Filter in Query

| Severity | Model | Exposed Data |
|---|---|---|
| 🔴 Critical | Appointment, Visit, Prescription | Patient PHI + clinical notes |
| 🔴 Critical | Patient | PII + medical history + contact info |
| 🔴 Critical | Invoice, Membership | Financial data |
| 🟡 High | AuditLog | Administrative actions + user emails |
| 🟠 Medium | Settings | Clinic branding + configuration |

### Risk 2: Patient Array Confusion

```typescript
// ❌ Wrong — returns nothing:
Patient.find({ tenantId: tenantId })
// Because Patient uses tenantIds array, not single tenantId!

// ✅ Right:
Patient.find({ tenantIds: new Types.ObjectId(tenantId) })
```

This is the **#1 source of multi-tenant bugs** in this codebase.

### Risk 3: Populate with Cross-Tenant References

```typescript
// ❌ Risky:
Appointment.findOne({ _id: apptId }).populate('patientId');
// If patientId belongs to different tenant, it's populated anyway

// ✅ Safer:
const appointment = await Appointment.findOne({
  _id: apptId,
  tenantId: currentTenant
}).populate({
  path: 'patientId',
  match: { tenantIds: new Types.ObjectId(currentTenant) }  // ← Filter populate
});
```

### Risk 4: Aggregation Pipeline Without Tenant Filter

```typescript
// ❌ Wrong — processes all documents:
Appointment.aggregate([
  { $group: { _id: '$patientId', count: { $sum: 1 } } }
])

// ✅ Right:
Appointment.aggregate([
  { $match: { tenantId: new Types.ObjectId(tenantId) } },  // ← First filter!
  { $group: { _id: '$patientId', count: { $sum: 1 } } }
])
```

**Rule:** Always add `$match` stage first in aggregation pipelines.

---

## 5. Authentication & Session Isolation

### JWT Structure

```typescript
{
  "userId": "507f1f77bcf86cd799439011",      // User._id
  "email": "doctor@clinic-a.com",
  "role": "doctor",                          // Role name
  "roleId": "507f1f77bcf86cd799439012",    // Role._id
  "tenantId": "507f1f77bcf86cd799439013",  // Tenant._id ← KEY!
  "iat": 1713897600,                        // Issued at
  "exp": 1714502400,                        // Expires at (7 days)
  "alg": "HS256"
}
```

### Session Validation Flow

```
Incoming request with session cookie
    ↓
decrypt(session) using SESSION_SECRET
    ↓
Verify signature (HS256)
    ↓
If invalid → return 401 Unauthorized
    ↓
Verify expiration
    ↓
If expired → return 401 Unauthorized (redirect to login)
    ↓
Extract tenantId from payload → session.tenantId
```

### Multi-Clinic Staff Scenario

For future support of staff managing multiple clinics:

```
Staff "John" is admin at Clinic A and Clinic B

Option A: Session carries only Clinic A tenantId
  ├─ When on clinic-a.myclinicsoft.com → uses Clinic A data
  └─ Cannot access clinic-b.myclinicsoft.com without re-login

Option B: Session carries both tenantIds (proposed)
  ├─ JWT tenantIds: ["A", "B"]
  ├─ /api/appointments checks if session.tenantIds includes currentTenant
  └─ Staff can switch subdomains without logout (if COOKIE_DOMAIN set)

Current implementation: Option A (single tenantId per session)
```

### Cookie Domain Strategy

```
Production setup:
┌─ COOKIE_DOMAIN=.myclinicsoft.com
│  ├─ clinic-a.myclinicsoft.com  ← Gets session cookie
│  ├─ clinic-b.myclinicsoft.com  ← Gets session cookie
│  └─ myclinicsoft.com           ← Gets session cookie
│
└─ All subdomains share same session (if domain-scoped)

Local dev:
├─ COOKIE_DOMAIN=  (empty)
├─ clinic-a.localhost ← session cookie scoped to this domain only
└─ clinic-b.localhost ← separate session cookie (different domain)
```

**Current Issue:** `COOKIE_DOMAIN` not validated in `lib/env-validation.ts`. In production, missing `COOKIE_DOMAIN` means staff must log in separately for each clinic.

---

## 6. Authorization & Permissions

### Role Hierarchy

```
Level 100: Admin
  ├─ Create/update/delete all resources
  ├─ Manage staff + roles
  └─ Access billing + settings

Level 80: Doctor
  ├─ Create visits + prescriptions + lab results
  ├─ View patients + appointments
  └─ Cannot manage staff or billing

Level 60: Nurse
  ├─ View patients + lab results
  ├─ Create some records
  └─ Cannot prescribe

Level 40: Receptionist
  ├─ Manage appointments + queue
  ├─ Update patient contact info
  └─ Cannot view medical records

Level 30: Accountant
  ├─ Create/view invoices
  ├─ View membership
  └─ Cannot access clinical data
```

### Permission Checking Pattern

```typescript
// 1. Load permission from DB
const permission = await Permission.findOne({
  tenantId: new Types.ObjectId(tenantId),  // ← Tenant-scoped!
  roleId: session.roleId,
  resource: 'appointments',    // What resource
  action: 'create'            // What action
});

// 2. Check permission exists and is allowed
if (!permission || !permission.allowed) {
  return json({ error: 'Forbidden' }, { status: 403 });
}

// 3. Proceed with operation
```

**Critical:** Permission queries must include `tenantId` filter. If they don't, Clinic A staff might get permission intended for Clinic B.

### Special Cases

#### Case 1: Clinic Admin Accessing Other Clinic
```
⚠️ Current: NOT supported
Admin of Clinic A cannot access Clinic B even if they're also admin of B

✅ Proposed: Add multi-tenant session
Session carries both tenantIds: ["A", "B"]
API checks: if (session.tenantIds.includes(currentTenant))
```

#### Case 2: System Admin (Root Domain)
```
Staff accessing localhost:3000 (no subdomain)

session.tenantId = null
tenantContext.tenantId = null
tenantContext.tenant = null

Can only access system-level resources (not any specific clinic)
```

---

## 7. Subscription & Resource Limits

### Per-Tenant Quotas

```typescript
// models/Tenant.ts
{
  subscription: {
    plan: "basic",        // "trial" | "basic" | "pro"
    status: "active",
    expiresAt: Date,
    
    // Limits enforced based on plan:
    limits: {
      patients: 500,        // "basic" plan
      appointments: 5000,
      storage_gb: 50,
      users: 10,
      features: ["appointments", "billing"] // Feature flags
    }
  }
}
```

### Enforcement Points

```
1. On signup (onboard):
   ├─ trial plan: 7 days, 100 patients, 1GB storage
   └─ Subscription set to expire in 7 days

2. On patient creation:
   ├─ Call checkResourceLimit('patients', tenantId)
   └─ If at quota → return 402 Payment Required

3. On file upload:
   ├─ Call checkStorageLimit(tenantId, fileSizeBytes)
   └─ If over quota → return 413 Payload Too Large

4. Cron job (daily):
   ├─ Scan Tenant.subscription.expiresAt < now
   ├─ Update status to 'expired'
   └─ Feature flags disabled
```

### Subscription Renewal via PayPal

```
1. Tenant visits /dashboard/billing
2. Clicks "Upgrade to Pro"
3. POST /api/subscription/create-order → PayPal API
   ├─ Creates PayPal Order with tenantId + plan details
   ├─ Stores in PaypalOrder collection (tenantId-scoped)
   └─ Returns approval_link → redirect to PayPal
4. User completes payment on PayPal
5. Redirects to /api/subscription/capture-order?token=...
   ├─ Verifies session.tenantId owns this order
   ├─ Calls PayPal capture API
   ├─ Updates Tenant.subscription.status = "active"
   ├─ Sets expiresAt = 30 days from now
   └─ Logs payment in Tenant.subscription.paymentHistory[]
6. PayPal sends webhook to /api/subscription/webhook
   ├─ Verified by PayPal signature (not session-based)
   ├─ Handles renewal/cancellation events
   ├─ Idempotency check via processedWebhookIds[]
   └─ Updates Tenant accordingly
```

**Key:** Payment tracking includes `paypalOrderId` which is **unique and tenant-specific**. Prevents cross-tenant payment misattribution.

---

## 8. Audit Logging

### What Gets Logged

```typescript
// models/AuditLog.ts
{
  tenantId: ObjectId,           // ← Scoped!
  userId: ObjectId,
  action: 'create' | 'update' | 'delete',
  resource: 'appointments',     // 'patients', 'invoices', etc.
  resourceId: ObjectId,
  changes: {
    before: { status: 'pending' },
    after: { status: 'confirmed' }
  },
  ipAddress: string,
  userAgent: string,
  timestamp: Date
}
```

### Query Audit Logs

```typescript
// ✓ Correct:
AuditLog.find({
  tenantId: new Types.ObjectId(tenantId),
  resource: 'appointments',
  action: 'delete'
});

// ✗ Wrong — exposes all clinic audits:
AuditLog.find({ resource: 'appointments' });
```

### Retention Policy

- Recommended: Keep 1-2 years
- Compliance: May need 5+ years (depends on jurisdiction)
- Set deletion schedule in cron job

---

## 9. Security Checklist

### Before Deploying Any Code Change

- [ ] **New model?** Added `tenantId` field to schema
- [ ] **New query?** All `find()`, `findOne()`, `updateOne()` calls include `tenantId` filter
- [ ] **Patient query?** Uses `tenantIds` array (not `tenantId`), or uses `$in` membership
- [ ] **Aggregation?** Starts with `{ $match: { tenantId } }` stage
- [ ] **Delete operation?** Only deletes documents matching both `_id` AND `tenantId`
- [ ] **API route?** Calls `verifySession()` before accessing data
- [ ] **API route?** Calls `getTenantContext()` to resolve tenantId
- [ ] **API route?** Verifies role permission (calls Permission query)
- [ ] **API route?** Verifies document ownership (checks tenantId on result)
- [ ] **File upload?** Calls `checkStorageLimit()` before saving
- [ ] **New feature?** Tenant isolation test included in `__tests__/`
- [ ] **Code review?** Second person audits for tenant isolation

### Configuration Checklist

- [ ] `MONGODB_URI` set and correct
- [ ] `SESSION_SECRET` is 32+ characters, random, secure
- [ ] `ROOT_DOMAIN` set to actual domain (not localhost in production)
- [ ] `COOKIE_DOMAIN` set to `.domain.com` in production
- [ ] `CRON_SECRET` set for cron route protection
- [ ] `PAYPAL_WEBHOOK_ID` set for PayPal verification
- [ ] `ENCRYPTION_KEY` set and 32 bytes base64
- [ ] MongoDB IP allowlisting enabled
- [ ] Database user has minimal permissions (no admin on prod)
- [ ] HTTPS enforced (no HTTP in production)
- [ ] `proxy.ts` wired as `middleware.ts` for CSRF protection

### Monitoring Checklist

- [ ] Alert on unusual query patterns (e.g., queries without tenantId)
- [ ] Alert on failed JWT verifications (potential tampering)
- [ ] Alert on PayPal webhook failures
- [ ] Alert on storage quota violations
- [ ] Alert on subscription expiration approaching
- [ ] Monthly review of audit logs for suspicious activity

---

## 10. Incident Response

### Scenario 1: Data Breach Suspected (Cross-Tenant Exposure)

**Steps:**
1. **Immediate:** Take affected route offline (remove from nginx/load balancer)
2. **Assess:** Query logs and audit trails
   ```
   db.auditLogs.find({
     resource: 'appointments',
     action: 'read',
     timestamp: { $gte: new Date('2026-04-20') }
   })
   ```
3. **Identify:** Which documents were potentially exposed?
   ```
   db.appointments.find({
     _id: { $in: [...exposed doc IDs...] },
     tenantId: { $ne: breachTenantId }
   }).count()
   ```
4. **Notify:** Affected tenants + their patients (if PHI exposed)
5. **Remediate:** Fix query, deploy, verify with tests
6. **Restore:** Re-enable route, monitor for errors

### Scenario 2: JWT Tampering Detected

**Signs:**
- Multiple failed `decrypt()` calls from same IP
- JWT claims don't match database (e.g., session.roleId doesn't exist)
- Session validation logs show signature mismatches

**Response:**
1. **Block:** Invalidate all sessions from that IP (TODO: implement session revocation)
2. **Investigate:** Check database for unauthorized modifications
3. **Rotate:** Force password reset for affected staff
4. **Alert:** Notify clinic admin + compliance team

### Scenario 3: Subscription Payment Failure

**Signs:**
- `Tenant.subscription.status` is `null` or invalid
- `POST /api/subscription/webhook` errors in logs
- Tenant features stop working after renewal date

**Response:**
1. **Check:** PayPal webhook logs
   ```
   db.paypalOrders.find({
     tenantId: ObjectId(...),
     status: 'failed'
   })
   ```
2. **Retry:** Manual webhook replay if idempotent
3. **Notify:** Clinic admin to retry payment or upgrade plan
4. **Log:** Add audit trail for compliance

### Scenario 4: Cron Job Misses Subscription Expiration

**Impact:** Tenant continues using features after subscription expires

**Detection:**
1. Monitor cron job logs
   ```bash
   tail -f logs/cron-subscription-renewal.log
   ```
2. Query for expired but still active:
   ```
   db.tenants.find({
     'subscription.status': 'active',
     'subscription.expiresAt': { $lt: new Date() }
   })
   ```

**Fix:**
1. Run cron manually to update status
2. Investigate why cron didn't run (failed? not scheduled?)
3. Add alerting threshold (e.g., alert if not run in 24h)

---

## References

- **Detailed Architecture:** [MULTI_TENANCY.md](./MULTI_TENANCY.md)
- **Quick Start:** [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md)
- **OWASP Multi-Tenancy:** https://owasp.org/www-project-top-10-for-large-language-model-applications/
- **Mongoose Security:** https://mongoosejs.com/docs/subdocs.html

---

*Last reviewed: 2026-04-23*  
*Maintained by: Security & Architecture Team*
