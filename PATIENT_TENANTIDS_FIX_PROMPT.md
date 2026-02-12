# Patient tenantIds Population Fix - Systematic Scan Prompt

## Issue Summary
The Patient model uses `tenantIds` (array) instead of `tenantId` (singular) to support multi-tenant functionality where patients can belong to multiple clinics. Many API endpoints incorrectly use `tenantId` in populate match conditions, causing patient data to return `null` on the frontend.

## The Problem

**Patient Model Schema:**
```typescript
tenantIds: [{ type: Schema.Types.ObjectId, ref: 'Tenant' }]  // ARRAY field
```

**Incorrect Populate Pattern (causes null patients):**
```javascript
const patientPopulateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode email phone',
};
if (tenantId) {
  patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };  // ❌ WRONG - field doesn't exist
} else {
  patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };  // ❌ WRONG
}
```

**Correct Populate Pattern:**
```javascript
const patientPopulateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode email phone',
};
if (tenantId) {
  patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };  // ✅ CORRECT - queries array
} else {
  patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };  // ✅ CORRECT
}
```

## Scan Instructions

### 1. Search for Patient Populate Patterns
Search the entire codebase for these patterns:

**Pattern 1: Direct tenantId in patient populate**
```bash
grep -r "path: 'patient'" app/api/ --include="*.ts" -A 10 | grep "tenantId:"
```

**Pattern 2: Populate match with tenantId**
```bash
grep -r "patientPopulateOptions.match" app/api/ --include="*.ts"
```

**Pattern 3: Any .populate('patient') with match options**
```bash
grep -r "\.populate.*patient.*match" app/api/ --include="*.ts" -B 5 -A 5
```

### 2. Files to Check Systematically

Check ALL API endpoints that reference patients:

**Core Patient APIs:**
- ✅ `/app/api/patients/**/*.ts`

**Document/Records APIs:**
- ✅ `/app/api/invoices/route.ts` - FIXED
- ✅ `/app/api/invoices/[id]/route.ts`
- ✅ `/app/api/documents/route.ts` - FIXED
- ✅ `/app/api/documents/[id]/route.ts`
- `/app/api/visits/route.ts`
- `/app/api/visits/[id]/route.ts`
- `/app/api/prescriptions/route.ts`
- `/app/api/prescriptions/[id]/route.ts`
- `/app/api/lab-results/route.ts`
- `/app/api/lab-results/[id]/route.ts`

**Referral APIs:**
- ✅ `/app/api/referrals/route.ts` - FIXED
- ✅ `/app/api/referrals/[id]/route.ts` - FIXED

**Appointment/Schedule APIs:**
- `/app/api/appointments/route.ts`
- `/app/api/appointments/[id]/route.ts`

**Membership/Billing APIs:**
- `/app/api/memberships/route.ts`
- `/app/api/memberships/[id]/route.ts`

**Queue Management:**
- `/app/api/queue/route.ts`
- `/app/api/queue/[id]/route.ts`
- `/app/api/queue/**/route.ts`

**Compliance/Analytics:**
- `/app/api/compliance-reports/route.ts`
- `/app/api/analytics/route.ts`

**Portal APIs:**
- `/app/api/patient-portal/**/*.ts`

### 3. Detection Patterns

Look for these specific code patterns that indicate the bug:

**Pattern A: Wrong field in populate match**
```typescript
patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
```

**Pattern B: Wrong field in fallback condition**
```typescript
patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
```

**Pattern C: Direct patient validation (this is CORRECT, do NOT change)**
```typescript
const patient = await Patient.findOne({
  _id: body.patient,
  tenantIds: new Types.ObjectId(tenantId),  // ✅ This is correct for queries
});
```

### 4. Required Changes

For EVERY instance where patient populate has tenant filtering:

**BEFORE (Incorrect):**
```typescript
const patientPopulateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode',
};
if (tenantId) {
  patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
} else {
  patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
}
```

**AFTER (Correct):**
```typescript
const patientPopulateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode',
};
if (tenantId) {
  patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
} else {
  patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
}
```

### 5. DO NOT Change These Patterns

**Patient Query Validation (CORRECT - Keep As-Is):**
```typescript
// This is correct for direct Patient.findOne queries
const patient = await Patient.findOne({
  _id: patientId,
  tenantIds: new Types.ObjectId(tenantId),
});
```

**Patient Model Definition (CORRECT - Keep As-Is):**
```typescript
// models/Patient.ts
tenantIds: [{ type: Schema.Types.ObjectId, ref: 'Tenant' }]
```

**Other Model Populates (CORRECT - Keep As-Is):**
```typescript
// Doctor, Doctor, Visit, Invoice models use tenantId (singular)
doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };  // ✅ CORRECT for doctors
```

### 6. Validation Steps

After making changes:

1. **Build Test:**
   ```bash
   npm run build
   ```

2. **TypeScript Validation:**
   ```bash
   npx tsc --noEmit
   ```

3. **Manual Test Cases:**
   - View invoice detail → Check if patient name displays
   - View document list → Check if patient name displays
   - View referral detail → Check if patient name displays
   - View visit detail → Check if patient name displays
   - View prescription detail → Check if patient name displays
   - View lab result detail → Check if patient name displays
   - View patient detail page → Check if all related records show patient data

4. **Console Check:**
   - Open browser console
   - Check for "null" patient objects in API responses
   - Should see patient data: `{ _id, firstName, lastName, patientCode }`

### 7. Automated Search Command

Run this to find potential issues:

```bash
# Find all patientPopulateOptions with potential issues
grep -r "patientPopulateOptions" app/api/ --include="*.ts" -A 8 | grep -E "(tenantId:|match.*tenantId)"

# Find all patient populate with match conditions
grep -r "path: 'patient'" app/api/ --include="*.ts" -A 10 | grep -E "match.*tenantId[^s]"

# Count remaining issues (should be 0 after fix)
grep -r "tenantId: new Types.ObjectId" app/api/ --include="*.ts" | grep -i patient | wc -l
```

## Summary Checklist

- [ ] Search for all `patientPopulateOptions` in `/app/api/`
- [ ] Replace `tenantId:` with `tenantIds:` in patient populate match
- [ ] Replace `{ $exists: false }` with `{ $exists: false }` and `null` with `{ $size: 0 }`
- [ ] Test build passes
- [ ] Test patient data displays on frontend
- [ ] Verify multi-tenant isolation still works
- [ ] Document any special cases

## Why This Matters

- **Data Integrity**: Ensures proper multi-tenant data isolation
- **User Experience**: Prevents null/broken displays throughout the application
- **Schema Consistency**: Aligns code with actual database schema
- **Future Development**: Prevents propagation of incorrect patterns

## Related Files

- Patient Model: `models/Patient.ts`
- Multi-tenant Guide: `models/RELATIONSHIPS.md`
- Session Context: `app/lib/dal.ts`
- Tenant Context: `lib/tenant.ts`

---

**Last Updated:** February 12, 2026
**Status:** Active - Use this prompt to scan codebase for remaining issues
