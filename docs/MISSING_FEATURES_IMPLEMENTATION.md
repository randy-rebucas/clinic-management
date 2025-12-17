# Missing Features Implementation

This document describes the implementation of the missing low-priority features identified in the production audit.

---

## 1. Automated Testing Framework ✅

### Implementation

**Files Created:**
- `vitest.config.ts` - Vitest configuration
- `jest.config.js` - Jest configuration (alternative)
- `jest.setup.js` - Jest setup file
- `__tests__/lib/subscription-limits.test.ts` - Example unit test
- `__tests__/lib/storage-tracking.test.ts` - Example unit test
- `__tests__/api/health.test.ts` - Example API test
- `__tests__/README.md` - Testing documentation

**Package Updates:**
- Added `vitest` and `@vitest/coverage-v8`, `@vitest/ui`
- Added `jest` and `jest-environment-jsdom`
- Added `@testing-library/jest-dom` and `@testing-library/react`
- Added test scripts to `package.json`

### Test Scripts

```bash
# Vitest (recommended)
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npm run test:ui           # UI mode

# Jest (alternative)
npm run test:jest         # Run all tests
npm run test:jest:watch   # Watch mode
npm run test:jest:coverage # With coverage
```

### Test Structure

```
__tests__/
├── lib/              # Unit tests for utilities
│   ├── subscription-limits.test.ts
│   └── storage-tracking.test.ts
├── api/              # Integration tests for API routes
│   └── health.test.ts
├── components/       # Component tests (to be added)
└── e2e/              # End-to-end tests (to be added)
```

### Coverage Goals

- **Unit Tests:** 70%+ coverage
- **Integration Tests:** All API endpoints
- **E2E Tests:** Critical user flows

### Next Steps

1. Add more unit tests for critical utilities
2. Add integration tests for all API endpoints
3. Add E2E tests for critical user flows
4. Set up CI/CD to run tests automatically

---

## 2. Insurance Verification Automation ✅

### Implementation

**Files Created:**
- `lib/automations/insurance-verification.ts` - Insurance verification logic
- `app/api/cron/insurance-verification/route.ts` - Cron endpoint

**Features:**
- Automatic insurance verification for appointments
- Batch verification for multiple patients
- Verification for upcoming appointments (24-48 hours before)
- Integration with appointment creation
- Notifications for failed verifications

### How It Works

1. **On Appointment Creation:**
   - Automatically verifies patient insurance
   - Updates patient record with verification status
   - Sends notifications if verification fails

2. **Scheduled Verification:**
   - Cron job runs daily at 8:00 AM
   - Verifies insurance for appointments in next 24-48 hours
   - Sends alerts for unverified insurance

3. **Verification Process:**
   - Checks patient insurance information
   - Validates policy number format
   - Simulates API call (placeholder - integrate with actual insurance API)
   - Updates patient record with coverage details

### Integration Points

- **Appointment Creation:** Auto-verifies insurance when appointment is created
- **Settings:** Can be enabled/disabled via `autoInsuranceVerification` setting
- **Cron Job:** Daily verification for upcoming appointments

### API Integration

**Note:** Currently uses a simulation function. To integrate with actual insurance APIs:

1. **Availity API** - Healthcare eligibility verification
2. **Change Healthcare** - Real-time eligibility
3. **Experian Health** - Insurance verification
4. **Custom API** - Clinic-specific insurance provider

**Integration Example:**
```typescript
// Replace simulateInsuranceVerification with actual API call
async function verifyInsuranceAPI(provider: string, policyNumber: string) {
  const response = await fetch('https://insurance-api.example.com/verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ provider, policyNumber }),
  });
  return response.json();
}
```

### Cron Schedule

- **Endpoint:** `/api/cron/insurance-verification`
- **Schedule:** Daily at 8:00 AM
- **Action:** Verifies insurance for appointments in next 24-48 hours

---

## 3. Appointment Queue Optimization ✅

### Implementation

**Files Created:**
- `lib/automations/queue-optimization.ts` - Queue optimization logic
- `app/api/cron/queue-optimization/route.ts` - Cron endpoint

**Features:**
- Automatic queue reassignment
- Doctor workload balancing
- Urgent case prioritization
- Room assignment optimization
- Queue scheduling recommendations

### Optimization Strategies

1. **Doctor Reassignment:**
   - If current doctor is busy, reassign to available doctor
   - Considers doctor specialization
   - Balances workload across doctors

2. **Urgent Case Prioritization:**
   - Moves urgent cases to front of queue
   - Updates queue numbers automatically
   - Maintains queue order

3. **Room Assignment:**
   - Assigns available rooms to in-progress patients
   - Considers room capacity
   - Optimizes room utilization

4. **Scheduling Recommendations:**
   - Analyzes appointment patterns
   - Identifies peak hours
   - Recommends time slot adjustments
   - Suggests doctor workload redistribution

### How It Works

1. **On Queue Join:**
   - Automatically optimizes queue when patient joins
   - Reassigns to best available doctor
   - Assigns to available room

2. **Scheduled Optimization:**
   - Cron job runs every 15 minutes
   - Optimizes entire queue
   - Provides metrics and recommendations

### Metrics Provided

- Average wait time
- Total patients in queue
- Available doctors count
- Available rooms count
- Optimization changes made

### Integration Points

- **Queue Creation:** Auto-optimizes when patient joins queue
- **Settings:** Can be enabled/disabled via `autoQueueOptimization` setting
- **Cron Job:** Periodic optimization every 15 minutes

### Cron Schedule

- **Endpoint:** `/api/cron/queue-optimization`
- **Schedule:** Every 15 minutes
- **Action:** Optimizes queue assignment and provides recommendations

---

## 4. Data Retention Policy Automation ✅

### Implementation

**Files Created:**
- `lib/automations/data-retention.ts` - Data retention logic
- `app/api/cron/data-retention/route.ts` - Cron endpoint

**Features:**
- Configurable retention policies per resource type
- Automatic archiving of old records
- Automatic deletion of very old records (audit logs only)
- Compliance with data retention requirements
- Per-tenant retention policies

### Default Retention Policies

| Resource | Archive After | Delete After |
|----------|---------------|--------------|
| Patients | Never | Never |
| Appointments | 1 year | Never |
| Visits | 1 year | Never |
| Invoices | 2 years | Never (tax compliance) |
| Lab Results | 1 year | Never |
| Prescriptions | 1 year | Never |
| Documents | 2 years | Never |
| Audit Logs | 90 days | 3 years |

### How It Works

1. **Archiving:**
   - Marks records as archived after specified days
   - Sets `archived: true` and `archivedAt` timestamp
   - Records remain in database but marked as archived

2. **Deletion:**
   - Only audit logs can be deleted (after archiving)
   - Other resources are never deleted (only archived)
   - Deletion happens after specified days from archive date

3. **Scheduled Processing:**
   - Cron job runs weekly on Sunday at 2:00 AM
   - Processes all tenants
   - Applies retention policies

### Customization

Retention policies can be customized per tenant:

```typescript
const customPolicies: RetentionPolicy[] = [
  {
    resource: 'appointments',
    archiveAfterDays: 180, // Archive after 6 months
    deleteAfterDays: 0,
  },
  {
    resource: 'audit-logs',
    archiveAfterDays: 60,
    deleteAfterDays: 730, // Delete after 2 years
  },
];

await applyDataRetentionPolicy(tenantId, customPolicies);
```

### Integration Points

- **Settings:** Can be enabled/disabled via `autoDataRetention` setting
- **Cron Job:** Weekly processing on Sunday at 2:00 AM
- **Compliance:** Helps with data retention compliance requirements

### Cron Schedule

- **Endpoint:** `/api/cron/data-retention`
- **Schedule:** Weekly on Sunday at 2:00 AM
- **Action:** Archives and deletes records based on retention policies

---

## Settings Configuration

All new automations are configurable via Settings model:

```typescript
automationSettings: {
  // ... existing settings ...
  autoInsuranceVerification: { type: Boolean, default: true },
  autoQueueOptimization: { type: Boolean, default: true },
  autoDataRetention: { type: Boolean, default: true },
}
```

---

## Cron Jobs Added

1. **Insurance Verification**
   - Path: `/api/cron/insurance-verification`
   - Schedule: `0 8 * * *` (Daily at 8:00 AM)

2. **Queue Optimization**
   - Path: `/api/cron/queue-optimization`
   - Schedule: `*/15 * * * *` (Every 15 minutes)

3. **Data Retention**
   - Path: `/api/cron/data-retention`
   - Schedule: `0 2 * * 0` (Weekly on Sunday at 2:00 AM)

---

## API Endpoints

### Insurance Verification

**Manual Verification:**
```typescript
POST /api/patients/[id]/verify-insurance
```

**Batch Verification:**
```typescript
POST /api/insurance/batch-verify
Body: { patientIds: ['id1', 'id2', ...] }
```

### Queue Optimization

**Manual Optimization:**
```typescript
POST /api/queue/optimize
```

**Get Recommendations:**
```typescript
GET /api/queue/optimization-recommendations
```

### Data Retention

**Apply Retention Policy:**
```typescript
POST /api/data-retention/apply
Body: { policies: [...] } // Optional, uses defaults if not provided
```

**Get Retention Status:**
```typescript
GET /api/data-retention/status
```

---

## Testing

### Insurance Verification

```bash
# Test manual verification
curl -X POST http://localhost:3000/api/patients/[id]/verify-insurance

# Test cron job
curl -X GET http://localhost:3000/api/cron/insurance-verification \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Queue Optimization

```bash
# Test manual optimization
curl -X POST http://localhost:3000/api/queue/optimize

# Test cron job
curl -X GET http://localhost:3000/api/cron/queue-optimization \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Data Retention

```bash
# Test retention policy
curl -X POST http://localhost:3000/api/data-retention/apply

# Test cron job
curl -X GET http://localhost:3000/api/cron/data-retention \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Next Steps

1. **Testing Framework:**
   - Add more unit tests
   - Add integration tests
   - Add E2E tests
   - Set up CI/CD

2. **Insurance Verification:**
   - Integrate with actual insurance API
   - Add more insurance providers
   - Add coverage validation

3. **Queue Optimization:**
   - Add machine learning for better predictions
   - Add real-time optimization
   - Add queue analytics dashboard

4. **Data Retention:**
   - Add retention policy UI
   - Add retention reports
   - Add compliance reporting

---

All missing features have been successfully implemented! ✅

