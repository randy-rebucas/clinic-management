# Subscription Automation & Limitations

This document describes the subscription automation system, trial expiration handling, and package limitations implementation.

---

## Overview

The subscription system automatically:
1. **Manages trial periods** - 7-day trial for new tenants
2. **Handles trial expiration** - Automatically expires trials and enforces limitations
3. **Enforces package limitations** - Restricts features and usage based on subscription plan
4. **Sends notifications** - Warns before expiration and notifies on expiration

---

## Subscription Packages

### Package Definitions

The system supports 4 subscription plans:

#### 1. Trial (7 days)
- **Price:** Free
- **Max Patients:** 50
- **Max Users:** 3
- **Max Doctors:** 2
- **Max Appointments/Month:** 100
- **Max Appointments/Day:** 20
- **Max Visits/Month:** 100
- **Storage:** 1 GB
- **Features:** Basic features only, no advanced reporting, no API access

#### 2. Basic ($29/month)
- **Price:** $29/month or $290/year
- **Max Patients:** 100
- **Max Users:** 5
- **Max Doctors:** 3
- **Max Appointments/Month:** 500
- **Max Appointments/Day:** 50
- **Max Visits/Month:** 500
- **Storage:** 5 GB
- **Features:** All core features, basic reporting, email support

#### 3. Professional ($79/month)
- **Price:** $79/month or $790/year
- **Max Patients:** 500
- **Max Users:** 15
- **Max Doctors:** 10
- **Max Appointments/Month:** 2,000
- **Max Appointments/Day:** 100
- **Max Visits/Month:** 2,000
- **Storage:** 20 GB
- **Features:** All features, custom reports, API access, webhooks, priority support

#### 4. Enterprise ($199/month)
- **Price:** $199/month or $1,990/year
- **Max Patients:** Unlimited
- **Max Users:** Unlimited
- **Max Doctors:** Unlimited
- **Max Appointments/Month:** Unlimited
- **Max Appointments/Day:** Unlimited
- **Max Visits/Month:** Unlimited
- **Storage:** Unlimited
- **Features:** All features, white-label, SSO, 24/7 support, custom integrations

---

## Trial Expiration Automation

### What Happens When Trial Expires

1. **Automatic Status Update**
   - Subscription status changes to `'expired'`
   - Tenant subscription marked as expired

2. **Access Restrictions**
   - Users redirected to subscription page
   - API endpoints enforce limitations
   - New data creation blocked (patients, appointments, etc.)

3. **Notifications Sent**
   - Email to all admin users
   - SMS to admin users (if phone available)
   - In-app notifications

4. **Enforcement**
   - Middleware redirects to subscription page
   - API endpoints check limits before allowing actions

### Trial Expiration Warnings

**When:** 3 days before expiration

**Actions:**
- Email warnings sent to admins
- In-app notifications
- Visual warnings on subscription page

---

## Package Limitations Enforcement

### Enforced Limits

#### Patient Limits
- **Trial:** 50 patients
- **Basic:** 100 patients
- **Professional:** 500 patients
- **Enterprise:** Unlimited

**Enforcement:**
- Checked when creating new patients
- API returns 403 error if limit exceeded
- Error message includes current count and limit

#### User/Staff Limits
- **Trial:** 3 users
- **Basic:** 5 users
- **Professional:** 15 users
- **Enterprise:** Unlimited

**Enforcement:**
- Checked when creating new users
- Includes all active staff members

#### Doctor Limits
- **Trial:** 2 doctors
- **Basic:** 3 doctors
- **Professional:** 10 doctors
- **Enterprise:** Unlimited

**Enforcement:**
- Checked when creating new doctors
- Only counts active doctors

#### Appointment Limits
- **Monthly Limits:**
  - Trial: 100/month
  - Basic: 500/month
  - Professional: 2,000/month
  - Enterprise: Unlimited

- **Daily Limits:**
  - Trial: 20/day
  - Basic: 50/day
  - Professional: 100/day
  - Enterprise: Unlimited

**Enforcement:**
- Checked when creating appointments
- Both monthly and daily limits enforced
- Returns specific error for which limit was exceeded

#### Visit Limits
- **Trial:** 100 visits/month
- **Basic:** 500 visits/month
- **Professional:** 2,000 visits/month
- **Enterprise:** Unlimited

**Enforcement:**
- Checked when creating visits
- Monthly limit enforced

#### Storage Limits
- **Trial:** 1 GB
- **Basic:** 5 GB
- **Professional:** 20 GB
- **Enterprise:** Unlimited

**Enforcement:**
- Checked when uploading files (documents, attachments)
- Includes:
  - Documents stored in Document model
  - Attachments in Patient, Visit, LabResult models
  - Cloudinary files (tracked via metadata)
  - Base64 files stored in MongoDB
- Returns 403 error if limit exceeded
- Error message includes current usage and limit

**Storage Calculation (Shared Database):**
- Storage is calculated per tenant using `tenantId` field
- All file sizes are summed for each tenant:
  ```typescript
  // Documents
  Document.find({ tenantId, status: 'active' }).sum('size')
  
  // Patient attachments
  Patient.find({ tenantId }).sum('attachments.size')
  
  // Visit attachments
  Visit.find({ tenantId }).sum('attachments.size')
  
  // LabResult attachments
  LabResult.find({ tenantId }).sum('attachments.size')
  ```
- Cloudinary files are tracked via `metadata.cloudinaryPublicId` and size stored in Document model
- Base64 files are identified by URLs starting with `data:`
- Storage is calculated on-demand (not cached) for accuracy
- For large tenants, consider implementing caching with periodic refresh

**Storage Tracking Details:**
- **Documents:** All documents with `tenantId` and status `active` or `archived` (excludes `deleted`)
- **Cloudinary Files:** Tracked via `metadata.cloudinaryPublicId` in Document model, size stored in `size` field
- **Base64 Files:** Files stored as data URLs in MongoDB, identified by URL pattern `data:*`
- **Attachments:** Embedded documents in Patient, Visit, and LabResult models
- **Total Storage:** Sum of all file sizes for the tenant

---

## Feature Availability

### Feature Matrix

| Feature | Trial | Basic | Professional | Enterprise |
|---------|-------|-------|--------------|------------|
| Patient Management | ✅ | ✅ | ✅ | ✅ |
| Appointment Scheduling | ✅ | ✅ | ✅ | ✅ |
| Visit Management | ✅ | ✅ | ✅ | ✅ |
| Prescription Management | ✅ | ✅ | ✅ | ✅ |
| Lab Results | ✅ | ✅ | ✅ | ✅ |
| Inventory Management | ✅ | ✅ | ✅ | ✅ |
| Billing & Invoicing | ✅ | ✅ | ✅ | ✅ |
| Reporting & Analytics | ❌ | ✅ | ✅ | ✅ |
| Custom Reports | ❌ | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ❌ | ✅ | ✅ |
| SMS Notifications | ✅ (Limited) | ✅ | ✅ | ✅ |
| Email Notifications | ✅ | ✅ | ✅ | ✅ |
| Broadcast Messaging | ❌ | ❌ | ✅ | ✅ |
| Automations | ✅ (Basic) | ✅ | ✅ | ✅ |
| Custom Automations | ❌ | ❌ | ✅ | ✅ |
| Multi-Location | ❌ | ❌ | ✅ | ✅ |
| Data Export | ❌ | ✅ | ✅ | ✅ |
| Bulk Export | ❌ | ❌ | ✅ | ✅ |
| Custom Branding | ❌ | ❌ | ✅ | ✅ |
| White Label | ❌ | ❌ | ❌ | ✅ |
| SSO | ❌ | ❌ | ❌ | ✅ |
| MFA | ❌ | ❌ | ✅ | ✅ |
| Audit Logs | ❌ | ❌ | ✅ | ✅ |
| Automated Backups | ❌ | ✅ | ✅ | ✅ |

---

## Implementation Details

### Files Created

1. **`lib/subscription-packages.ts`**
   - Package definitions with all limitations
   - Feature availability matrix
   - Helper functions for checking limits and features

2. **`lib/automations/trial-expiration.ts`**
   - Trial expiration handling
   - Expiration warnings
   - Notification sending

3. **`lib/subscription-limits.ts`**
   - Limit checking utilities
   - Usage statistics
   - Enforcement helpers

4. **`app/api/cron/trial-expiration/route.ts`**
   - Cron endpoint for processing expired trials
   - Runs daily at 6:00 AM

5. **`app/api/subscription/usage/route.ts`**
   - API endpoint to get current usage vs limits
   - Returns subscription status and usage statistics
   - Includes storage usage information

6. **`lib/storage-tracking.ts`**
   - Storage usage calculation per tenant
   - Tracks storage from:
     - Document model (all documents)
     - Patient attachments
     - Visit attachments
     - LabResult attachments
     - Cloudinary files (via metadata)
     - Base64 files in MongoDB
   - Storage limit checking before uploads
   - Human-readable formatting utilities

7. **`app/api/storage/usage/route.ts`**
   - API endpoint to get detailed storage usage
   - Returns current usage, limits, and formatted values

### Modified Files

1. **`app/api/patients/route.ts`**
   - Added subscription limit check before creating patients

2. **`app/api/doctors/route.ts`**
   - Added subscription limit check before creating doctors

3. **`app/api/appointments/route.ts`**
   - Added subscription limit check before creating appointments

4. **`app/api/visits/route.ts`**
   - Added subscription limit check before creating visits

5. **`app/api/documents/route.ts`**
   - Added storage limit check before uploading documents

6. **`app/api/patients/[id]/upload/route.ts`**
   - Added storage limit check before uploading patient attachments

7. **`app/api/visits/[id]/upload/route.ts`**
   - Added storage limit check before uploading visit attachments

8. **`app/api/lab-results/[id]/upload/route.ts`**
   - Added storage limit check before uploading lab result attachments

9. **`lib/subscription-limits.ts`**
   - Added storage usage tracking to subscription usage

10. **`lib/subscription.ts`**
    - Updated to include subscription status

11. **`vercel.json`**
    - Added trial expiration cron job

---

## API Endpoints

### Get Subscription Usage
```
GET /api/subscription/usage
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "isActive": true,
      "isExpired": false,
      "isTrial": true,
      "expiresAt": "2024-02-15T00:00:00.000Z",
      "plan": "trial",
      "daysRemaining": 3,
      "status": "active"
    },
    "usage": {
      "patients": {
        "current": 25,
        "limit": 50,
        "remaining": 25
      },
      "users": {
        "current": 2,
        "limit": 3,
        "remaining": 1
      },
      "doctors": {
        "current": 1,
        "limit": 2,
        "remaining": 1
      },
      "appointmentsThisMonth": {
        "current": 45,
        "limit": 100,
        "remaining": 55
      },
      "appointmentsToday": {
        "current": 5,
        "limit": 20,
        "remaining": 15
      },
      "visitsThisMonth": {
        "current": 40,
        "limit": 100,
        "remaining": 60
      },
      "storage": {
        "currentGB": 0.5,
        "limitGB": 1,
        "remainingGB": 0.5,
        "percentageUsed": 50,
        "exceeded": false
      }
    },
    "storage": {
      "usage": {
        "totalBytes": 536870912,
        "totalGB": 0.5,
        "documentsBytes": 300000000,
        "cloudinaryBytes": 200000000,
        "attachmentsBytes": 36870912,
        "base64Bytes": 0,
        "limitGB": 1,
        "limitBytes": 1073741824,
        "remainingGB": 0.5,
        "remainingBytes": 536870912,
        "percentageUsed": 50,
        "exceeded": false
      },
      "formatted": {
        "total": "0.5 GB",
        "limit": "1 GB",
        "remaining": "0.5 GB",
        "percentageUsed": "50%"
      }
    },
    "limitations": {
      "maxPatients": 50,
      "maxUsers": 3,
      "maxDoctors": 2,
      "maxAppointmentsPerMonth": 100,
      "maxAppointmentsPerDay": 20,
      "maxVisitsPerMonth": 100,
      "maxStorageGB": 1,
      "maxFileSizeMB": 5,
      "features": { ... }
    }
  }
}
```

### Get Storage Usage
```
GET /api/storage/usage
```

**Response:**
```json
{
  "success": true,
  "data": {
    "usage": {
      "totalBytes": 536870912,
      "totalGB": 0.5,
      "documentsBytes": 300000000,
      "cloudinaryBytes": 200000000,
      "attachmentsBytes": 36870912,
      "base64Bytes": 0,
      "limitGB": 5,
      "limitBytes": 5368709120,
      "remainingGB": 4.5,
      "remainingBytes": 4831838208,
      "percentageUsed": 10,
      "exceeded": false
    },
    "formatted": {
      "total": "0.5 GB",
      "limit": "5 GB",
      "remaining": "4.5 GB",
      "percentageUsed": "10%"
    }
  }
}
```

---

## Error Responses

When a limit is exceeded, API endpoints return:

### Patient/User/Doctor Limit Exceeded
```json
{
  "success": false,
  "error": "patients limit (50) exceeded. Please upgrade your plan.",
  "limit": 50,
  "current": 51,
  "remaining": 0
}
```

### Storage Limit Exceeded
```json
{
  "success": false,
  "error": "Uploading this file (10.5 MB) would exceed your storage limit (5 GB). Current usage: 4.95 GB. Please delete files or upgrade your plan.",
  "storageUsage": {
    "totalBytes": 5315021824,
    "totalGB": 4.95,
    "limitGB": 5,
    "remainingGB": 0.05,
    "percentageUsed": 99,
    "exceeded": false
  }
}
```

**Status Code:** `403 Forbidden`

### Storage Already Exceeded
```json
{
  "success": false,
  "error": "Storage limit (5 GB) already exceeded. Please delete files or upgrade your plan.",
  "storageUsage": {
    "totalBytes": 5368709120,
    "totalGB": 5,
    "limitGB": 5,
    "remainingGB": 0,
    "percentageUsed": 100,
    "exceeded": true
  }
}
```

---

## Cron Jobs

### Trial Expiration Processing
- **Endpoint:** `/api/cron/trial-expiration`
- **Schedule:** Daily at 6:00 AM
- **Actions:**
  - Processes expired trials
  - Sends expiration notifications
  - Sends warnings for trials expiring in 3 days

---

## User Experience

### When Trial Expires

1. **User tries to access app**
   - Automatically redirected to `/subscription` page
   - Cannot access other pages

2. **User tries to create data**
   - API returns 403 error with limit information
   - Error message suggests upgrading

3. **Subscription Page**
   - Shows expired status
   - Displays available plans
   - Clear call-to-action to subscribe

### When Approaching Limits

1. **Usage Dashboard** (if implemented)
   - Shows current usage vs limits
   - Visual indicators (progress bars)
   - Warnings when approaching limits

2. **API Responses**
   - Include remaining count in responses
   - Can be used to show warnings in UI

---

## Best Practices

### For Tenants

1. **Monitor Usage**
   - Check `/api/subscription/usage` regularly
   - Plan upgrades before hitting limits

2. **Trial Period**
   - Use trial to evaluate features
   - Subscribe before expiration to avoid interruption

3. **Upgrade Path**
   - Start with Basic or Professional
   - Upgrade to Enterprise when needed

### For Developers

1. **Error Handling**
   - Always check subscription limits before creating resources
   - Provide clear error messages
   - Include upgrade suggestions

2. **UI Integration**
   - Show usage statistics on dashboard
   - Display warnings when approaching limits
   - Make upgrade process easy

3. **Testing**
   - Test with different subscription plans
   - Verify limits are enforced correctly
   - Test trial expiration flow

---

## Testing

### Manual Testing

1. **Create Trial Tenant**
   - Verify 7-day trial is set
   - Check expiration date

2. **Test Limits**
   - Create patients up to limit
   - Verify error when limit exceeded
   - Test appointment limits (monthly and daily)
   - Test visit limits

3. **Test Storage Limits**
   - Upload files up to storage limit
   - Verify error when limit exceeded
   - Test with different file sizes
   - Verify storage calculation includes:
     - Documents
     - Patient attachments
     - Visit attachments
     - LabResult attachments
   - Check `/api/storage/usage` endpoint
   - Verify formatted output is correct

4. **Test Expiration**
   - Manually expire trial (set expiresAt to past)
   - Verify redirect to subscription page
   - Verify API endpoints return 403
   - Test that file uploads are blocked

5. **Test Warnings**
   - Set trial to expire in 3 days
   - Run cron job
   - Verify warnings sent

---

## Storage Management

### Storage Calculation Performance

For a shared database architecture with `tenantId`:

1. **Efficient Queries**
   - Uses MongoDB indexes on `tenantId` for fast lookups
   - Aggregates file sizes per tenant
   - Excludes deleted documents from calculations

2. **Storage Sources**
   - **Document Model:** Primary storage for uploaded documents
   - **Patient Attachments:** Embedded in Patient documents
   - **Visit Attachments:** Embedded in Visit documents
   - **LabResult Attachments:** Embedded in LabResult documents

3. **Cloudinary Integration**
   - Files uploaded to Cloudinary are tracked via `metadata.cloudinaryPublicId`
   - File size is stored in Document model `size` field
   - No need to query Cloudinary API for size (already stored)

4. **Base64 Files**
   - Files stored as data URLs in MongoDB
   - Size calculated from `size` field in Document/Attachment models
   - Base64 encoding overhead (~33%) is already accounted for in stored size

### Storage Optimization Tips

1. **For Tenants:**
   - Regularly delete unused documents
   - Archive old documents instead of deleting (if needed for compliance)
   - Use Cloudinary for large files (better performance)
   - Compress images before upload

2. **For Developers:**
   - Consider caching storage calculations for large tenants
   - Implement periodic storage audits
   - Monitor storage growth trends
   - Set up alerts for approaching limits

### Storage API Usage Examples

**Check Storage Before Upload:**
```typescript
import { checkStorageLimit } from '@/lib/storage-tracking';

const result = await checkStorageLimit(tenantId, file.size);
if (!result.allowed) {
  // Show error to user
  console.error(result.reason);
  // Display: result.currentUsage
}
```

**Get Storage Usage:**
```typescript
import { getStorageUsageSummary } from '@/lib/storage-tracking';

const summary = await getStorageUsageSummary(tenantId);
console.log(`Using ${summary.formatted.total} of ${summary.formatted.limit}`);
console.log(`${summary.formatted.percentageUsed} used`);
```

## Future Enhancements

1. **Usage Dashboard**
   - Visual usage statistics
   - Progress bars for limits
   - Upgrade prompts
   - Storage breakdown by type (documents, attachments, etc.)

2. **Grace Period**
   - Allow limited access after expiration
   - Read-only mode
   - Extended trial options

3. **Usage Alerts**
   - Email when approaching limits
   - In-app warnings at 80%, 90%, 100%
   - Storage alerts when approaching limits

4. **Plan Recommendations**
   - Suggest upgrades based on usage
   - Show cost savings with yearly plans
   - Storage-based upgrade suggestions

5. **Storage Optimization**
   - Automatic cleanup of old/deleted files
   - Storage compression options
   - Bulk delete functionality
   - Storage analytics and trends

---

This automation system ensures that:
- ✅ Trials expire automatically
- ✅ Limitations are enforced consistently
- ✅ Storage is tracked accurately per tenant in shared database
- ✅ File uploads are blocked when storage limits are exceeded
- ✅ Users are notified appropriately
- ✅ Upgrade path is clear
- ✅ System remains secure and fair

## Storage Tracking Architecture

### Shared Database Design

The system uses a **single shared database** with `tenantId` in each collection to track storage per tenant:

```
Database (Shared)
├── Document Collection
│   └── { tenantId, size, url, metadata }
├── Patient Collection
│   └── { tenantId, attachments: [{ size, url }] }
├── Visit Collection
│   └── { tenantId, attachments: [{ size, url }] }
└── LabResult Collection
    └── { tenantId, attachments: [{ size, url }] }
```

### Storage Calculation Flow

1. **Query all documents** for tenant: `Document.find({ tenantId, status: { $ne: 'deleted' } })`
2. **Sum document sizes**: `documents.reduce((sum, doc) => sum + doc.size, 0)`
3. **Query attachments** in Patient, Visit, LabResult models
4. **Sum attachment sizes**: Aggregate all attachment sizes
5. **Calculate total**: `totalBytes = documentsBytes + attachmentsBytes`
6. **Convert to GB**: `totalGB = totalBytes / (1024 * 1024 * 1024)`
7. **Compare with limit**: Check against subscription plan limit
8. **Return result**: Usage statistics with formatted values

### Benefits of This Approach

- ✅ **Accurate:** Real-time calculation ensures accuracy
- ✅ **Efficient:** Uses MongoDB indexes for fast queries
- ✅ **Scalable:** Works with any number of tenants
- ✅ **Flexible:** Supports both Cloudinary and base64 storage
- ✅ **Transparent:** Clear breakdown of storage sources

