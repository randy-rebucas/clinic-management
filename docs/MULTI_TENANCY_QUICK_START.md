# Multi-Tenancy Quick Start & Developer Guide

**Project:** MyClinicsoftSoft  
**Purpose:** Practical guide for developers working with multi-tenant features  
**Last updated:** 2026-04-23

---

## Quick Reference

### Key Concept
Every clinic (tenant) shares the same database but data is isolated by `tenantId`. Tenant identification happens through subdomain resolution.

```
clinic-a.myclinicsoft.com  ← subdomain extracted → "clinic-a" → query DB → tenantId
```

### Common Tasks

#### 1. Get Tenant Context in API Route
```typescript
import { getTenantContext } from '@/lib/tenant';
import { verifySession } from '@/app/lib/dal';

export async function GET(req: Request) {
  const session = await verifySession();
  const tenantContext = await getTenantContext();
  
  // Resolve tenant from session (JWT) or host header
  const tenantId = session.tenantId || tenantContext.tenantId;
  
  if (!tenantId) {
    return Response.json({ error: 'No tenant' }, { status: 400 });
  }
  
  // Use in queries
  const docs = await Model.find({ tenantId: new Types.ObjectId(tenantId) });
  return Response.json(docs);
}
```

#### 2. Query Documents (Single tenantId)
```typescript
import { Types } from 'mongoose';

// Correct:
const appointment = await Appointment.findOne({
  _id: appointmentId,
  tenantId: new Types.ObjectId(tenantId)
});

// Wrong (will find docs from any tenant):
const appointment = await Appointment.findOne({ _id: appointmentId });
```

#### 3. Query Patients (Array tenantIds)
```typescript
// Correct — use array membership syntax:
const patient = await Patient.findOne({
  _id: patientId,
  tenantIds: new Types.ObjectId(tenantId)
});

// Wrong (will always return null):
const patient = await Patient.findOne({
  _id: patientId,
  tenantId: tenantId  // ← Patients use tenantIds array!
});
```

#### 4. Create Document with Tenant
```typescript
import { getTenantContext } from '@/lib/tenant';

export async function POST(req: Request) {
  const { name, description } = await req.json();
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  const doc = await Model.create({
    name,
    description,
    tenantId: new Types.ObjectId(tenantId),  // ← Always add tenantId!
  });
  
  return Response.json(doc);
}
```

#### 5. Get Settings for Current Tenant
```typescript
import { getSettings } from '@/lib/settings';

const settings = await getSettings(); // Auto-resolves by tenantId from request
console.log(settings.timezone, settings.currency);
```

---

## Development Workflow

### Setup

#### 1. Install & Configure
```bash
npm run install:setup
# Prompts for:
# - MongoDB URI
# - SESSION_SECRET
# - Admin email/password
# - Optional: create first tenant via CLI
```

#### 2. Local Subdomain Testing
Edit `/etc/hosts` (Linux/macOS) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
```
127.0.0.1  localhost
127.0.0.1  clinic-a.localhost
127.0.0.1  clinic-b.localhost
```

Set in `.env.local`:
```env
ROOT_DOMAIN=localhost
# COOKIE_DOMAIN intentionally empty for local dev
```

#### 3. Access Locally
```
http://clinic-a.localhost:3000
http://clinic-b.localhost:3000
http://localhost:3000  (root domain)
```

### Create New Tenant

**Option A: Via Web UI**
1. Navigate to `http://myclinicsoft.com/auth/register`
2. Fill clinic details
3. Admin account automatically created

**Option B: Via CLI**
```bash
npm run tenant:onboard
# Interactive prompts for tenant and admin details
```

**Option C: Via API**
```bash
curl -X POST http://localhost:3000/api/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sunshine Clinic",
    "subdomain": "sunshine",
    "admin": {
      "name": "John Doe",
      "email": "john@sunshine.com",
      "password": "SecurePass123"
    }
  }'
```

### Delete Tenant & All Data
```bash
npm run tenant:delete
# Prompts for tenant subdomain
# Deletes: Tenant + all scoped documents (users, appointments, etc.)
```

---

## Common Patterns

### Pattern 1: Tenant-Guarded API Route
```typescript
// app/api/my-resource/route.ts
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(req: Request) {
  // 1. Verify session
  const session = await verifySession();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Get tenant context
  const tenantContext = await getTenantContext();
  const tenantId = session.tenantId || tenantContext.tenantId;
  
  if (!tenantId) {
    return Response.json({ error: 'No tenant found' }, { status: 400 });
  }
  
  // 3. Query with tenant filter
  const resources = await MyResource.find({
    tenantId: new Types.ObjectId(tenantId)
  });
  
  return Response.json(resources);
}
```

### Pattern 2: Backward Compatibility (null tenantId)
For documents created before multi-tenancy was enabled:

```typescript
const query = tenantId
  ? { tenantId: new Types.ObjectId(tenantId) }
  : { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };

const docs = await MyModel.find(query);
```

### Pattern 3: Verify Document Ownership
```typescript
async function verifyDocumentBelongsToTenant(docId: string, tenantId: string) {
  const doc = await MyModel.findOne({
    _id: new Types.ObjectId(docId),
    tenantId: new Types.ObjectId(tenantId)
  });
  
  if (!doc) {
    throw new Error('Document not found or access denied');
  }
  
  return doc;
}
```

### Pattern 4: Handle Patient Multi-Tenancy
```typescript
// Patients can visit multiple clinics
const patientTenantIds = [
  new Types.ObjectId(clinicA_id),
  new Types.ObjectId(clinicB_id)
];

const patient = await Patient.findOne({
  _id: patientId,
  tenantIds: { $in: patientTenantIds }  // ← Array membership!
});
```

---

## Testing Multi-Tenancy

### Unit Test Example
```typescript
import { Types } from 'mongoose';

describe('Multi-tenant API', () => {
  const tenantA_id = new Types.ObjectId();
  const tenantB_id = new Types.ObjectId();
  
  it('should isolate data by tenant', async () => {
    // Create doc for tenant A
    await MyModel.create({
      name: 'Doc A',
      tenantId: tenantA_id
    });
    
    // Tenant B should NOT see it
    const doc = await MyModel.findOne({
      name: 'Doc A',
      tenantId: tenantB_id
    });
    
    expect(doc).toBeNull();
  });
});
```

### Manual Test Scenario
1. **Login to Clinic A:** `clinic-a.localhost:3000`
   - Create appointment: "Appt-A"
2. **Login to Clinic B:** `clinic-b.localhost:3000` (same browser)
   - Verify "Appt-A" is NOT visible
   - Create appointment: "Appt-B"
3. **Return to Clinic A:** `clinic-a.localhost:3000`
   - Verify "Appt-A" is still there
   - Verify "Appt-B" is NOT there
4. **Check root domain:** `localhost:3000`
   - Should show "TenantNotFound" or redirect (depends on implementation)

---

## Adding Tenant Support to New Models

When adding a new data model:

### 1. Add tenantId to Schema
```typescript
import { Schema, Types } from 'mongoose';

const MyModelSchema = new Schema({
  name: String,
  // ← Add this:
  tenantId: {
    type: Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
});
```

**Exception:** If data can belong to multiple tenants, use array:
```typescript
tenantIds: [
  {
    type: Types.ObjectId,
    ref: 'Tenant'
  }
]
```

### 2. Filter All Queries by tenantId
```typescript
// ❌ Don't do:
const docs = await MyModel.find({ name: 'test' });

// ✅ Do:
const docs = await MyModel.find({
  name: 'test',
  tenantId: new Types.ObjectId(tenantId)
});
```

### 3. Add tenantId When Creating
```typescript
await MyModel.create({
  name: 'test',
  tenantId: new Types.ObjectId(tenantId)  // ← Always include!
});
```

### 4. Add Pre-Save Hook (optional, for safety)
```typescript
MyModelSchema.pre('save', async function (next) {
  if (!this.tenantId) {
    const tenantId = await getTenantId();
    if (tenantId) {
      this.tenantId = new Types.ObjectId(tenantId);
    }
  }
  next();
});
```

### 5. Update Delete Script
Edit `scripts/delete-tenant.ts` and add your model to the deletion loop:
```typescript
async function deleteTenantData(tenantId: Types.ObjectId) {
  // ... existing models ...
  await MyModel.deleteMany({ tenantId });  // ← Add this
  // ... rest of models ...
}
```

---

## Debugging Multi-Tenant Issues

### Issue: "Data visible across tenants"

**Diagnosis:**
1. Check if query includes tenantId filter:
   ```typescript
   // Check code:
   const docs = await Model.find({ name: 'test' });  // ❌ Missing tenantId!
   ```
2. Verify tenantId is ObjectId, not string:
   ```typescript
   // ❌ Wrong:
   { tenantId: tenantId }  // String not ObjectId
   
   // ✅ Right:
   { tenantId: new Types.ObjectId(tenantId) }
   ```

**Fix:** Add tenantId to all queries.

### Issue: "Patients not returning in queries"

**Diagnosis:** Patient model uses `tenantIds` (array), not `tenantId`:
```typescript
// ❌ Wrong:
Patient.find({ tenantId: tenantId })

// ✅ Right:
Patient.find({ tenantIds: new Types.ObjectId(tenantId) })
```

**Fix:** Use array membership syntax `{ tenantIds: objectId }` for patients.

### Issue: "Subdomain not resolving"

**Diagnosis:**
1. Check `/etc/hosts` has subdomain entry:
   ```
   127.0.0.1  clinic-a.localhost
   ```
2. Verify tenant exists and is `active`:
   ```bash
   db.tenants.findOne({ subdomain: 'clinic-a' })
   # Should return with status: 'active'
   ```
3. Check browser is using subdomain:
   ```
   http://clinic-a.localhost:3000  ✅
   http://localhost:3000/clinic-a  ❌ (won't work)
   ```

**Fix:** Use subdomain in URL, not path. Verify tenant exists in DB.

### Issue: "Session missing tenantId"

**Diagnosis:** Check JWT payload:
```typescript
// In API route:
console.log('session.tenantId:', session.tenantId);
// Should NOT be null/undefined
```

**Cause:** Admin logged in without subdomain context.

**Fix:** Admin should log in from clinic subdomain: `clinic-a.localhost:3000/login`

---

## Environment Variables Checklist

### Required for Multi-Tenancy to Work
```env
✓ MONGODB_URI        = mongodb://...
✓ SESSION_SECRET     = random-string-32-chars-or-more
✓ ROOT_DOMAIN        = myclinicsoft.com  (or localhost for dev)
✓ COOKIE_DOMAIN      = .myclinicsoft.com (or empty for local dev)
```

### Without these, you'll see:
- `ROOT_DOMAIN` missing → All subdomains treated as root domain
- `COOKIE_DOMAIN` missing (prod) → Sessions don't share across subdomains
- `SESSION_SECRET` missing → JWT signing fails

---

## Performance Notes

### Index Strategy
Multi-tenant queries use two main patterns:

**Pattern 1: Exact tenant + field**
```typescript
// Index: { tenantId: 1, status: 1 }
Appointment.find({ tenantId, status: 'confirmed' })
```

**Pattern 2: Array membership**
```typescript
// Index: { tenantIds: 1 }
Patient.find({ tenantIds: { $in: [...] } })
```

All tenant models should have `tenantId: { index: true }` in schema.

### Query Optimization
```typescript
// ❌ Slow: Find then filter
const all = await Appointments.find({ tenantId });
const confirmed = all.filter(a => a.status === 'confirmed');

// ✅ Fast: Filter in query
const confirmed = await Appointments.find({
  tenantId,
  status: 'confirmed'
});
```

---

## Security Checklist

- [ ] All models have `tenantId` field
- [ ] All queries include `tenantId` filter
- [ ] Patient queries use `tenantIds` array membership (not `tenantId`)
- [ ] API routes verify session exists
- [ ] API routes verify tenantId is ObjectId (not string)
- [ ] DELETE and PATCH operations verify ownership (check tenantId)
- [ ] Subscriptions/storage limits enforced per `Tenant.subscription`
- [ ] Cron routes protected with `Authorization: Bearer <CRON_SECRET>`
- [ ] CSRF middleware enabled (`proxy.ts` → `middleware.ts`)

---

## Next Steps

1. **Read comprehensive docs:** [MULTI_TENANCY.md](./MULTI_TENANCY.md)
2. **Review example API:** [app/api/patients/route.ts](../app/api/patients/route.ts)
3. **Check tenant utilities:** [lib/tenant.ts](../lib/tenant.ts)
4. **Inspect models:** [models/Tenant.ts](../models/Tenant.ts)

---

*For detailed architecture and API reference, see [MULTI_TENANCY.md](./MULTI_TENANCY.md)*
