# Multi-Tenant Implementation Guide

This document describes the multi-tenant architecture implemented in the clinic management system, following Next.js best practices.

## Overview

The application now supports multiple tenants (clinics/organizations) in a single deployment. Each tenant has isolated data, and users can only access data belonging to their tenant.

## Architecture

### Tenant Identification

Tenants can be identified through three methods (in order of priority):

1. **Subdomain** (e.g., `clinic1.example.com`)
2. **Path prefix** (e.g., `/t/clinic1/...`)
3. **Header** (`X-Tenant-Slug` for API calls)

The middleware automatically resolves the tenant and sets headers for use throughout the application.

### Database Schema

All tenant-scoped models include a `tenantId` field that references the `Tenant` model:

- `User` - Users are scoped to tenants
- `Patient` - Patients belong to tenants
- `Appointment` - Appointments are tenant-specific
- `Doctor` - Doctors belong to tenants
- `Visit` - Visits are tenant-specific
- `Invoice` - Invoices are tenant-specific
- `Admin` - Admins belong to tenants

### Indexes

All unique constraints are now tenant-scoped:
- Email addresses are unique per tenant (not globally)
- Patient codes are unique per tenant
- Invoice numbers are unique per tenant
- etc.

## Usage

### Server-Side (API Routes, Server Actions)

Use the tenant utilities to get the current tenant:

```typescript
import { getTenantId, getTenant } from '@/app/lib/tenant';

// Get tenant ID
const tenantId = await getTenantId();

// Get full tenant info
const tenant = await getTenant();
```

### Query Filtering

Use the tenant query helpers to automatically filter queries:

```typescript
import { getTenantFilter, withTenant } from '@/app/lib/tenant-query';
import Patient from '@/models/Patient';

// Method 1: Using getTenantFilter
const filter = await getTenantFilter();
const patients = await Patient.find(filter);

// Method 2: Using withTenant
const patients = await withTenant(Patient.find({ status: 'active' }));
```

### Client-Side (React Components)

Use the `TenantProvider` and `useTenant` hook:

```typescript
'use client';

import { useTenant } from '@/components/TenantProvider';

export function MyComponent() {
  const { tenantId, tenantSlug, tenantName, isLoading } = useTenant();
  
  if (isLoading) return <div>Loading...</div>;
  
  return <div>Current tenant: {tenantName}</div>;
}
```

### Authentication

When creating users or sessions, the tenant is automatically included:

```typescript
// In app/actions/auth.ts
const tenant = await getTenant();
if (!tenant) {
  // Handle error - tenant not found
}

// Create user with tenantId
const user = await User.create({
  // ... other fields
  tenantId: tenant._id,
});

// Create session with tenantId
await createSession(userId, email, role, roleId, tenant._id);
```

## Setup

### 1. Create a Tenant

You can create tenants through the database or via a script:

```typescript
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

await connectDB();

const tenant = await Tenant.create({
  name: 'Clinic ABC',
  slug: 'clinic-abc', // URL-friendly identifier
  displayName: 'ABC Medical Clinic',
  status: 'active',
});
```

### 2. Configure DNS (for subdomain routing)

If using subdomain routing, configure your DNS to point subdomains to your application:
- `clinic1.yourdomain.com` → Your application
- `clinic2.yourdomain.com` → Your application

### 3. Access the Application

- **Subdomain**: `https://clinic-abc.yourdomain.com`
- **Path prefix**: `https://yourdomain.com/t/clinic-abc`
- **Header**: Include `X-Tenant-Slug: clinic-abc` in API requests

## Migration Notes

### Existing Data

If you have existing data without tenant IDs, you'll need to:

1. Create a default tenant
2. Assign all existing records to that tenant
3. Update unique indexes to be tenant-scoped

### Example Migration Script

```typescript
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Patient from '@/models/Patient';
// ... other models

await connectDB();

// Create default tenant
const defaultTenant = await Tenant.create({
  name: 'Default Clinic',
  slug: 'default',
  status: 'active',
});

// Update all existing records
await User.updateMany({ tenantId: { $exists: false } }, { tenantId: defaultTenant._id });
await Patient.updateMany({ tenantId: { $exists: false } }, { tenantId: defaultTenant._id });
// ... update other models
```

## Security Considerations

1. **Tenant Isolation**: Always filter queries by tenantId to prevent data leakage
2. **Session Validation**: Sessions include tenantId and are validated on each request
3. **Middleware Protection**: The middleware ensures tenant is resolved before requests proceed
4. **Unique Constraints**: All unique fields are scoped to tenants to prevent conflicts

## Best Practices

1. **Always use tenant helpers**: Don't manually add tenantId - use the helper functions
2. **Validate tenant access**: Use `verifyTenantAccess()` when needed
3. **Index tenant queries**: All queries should include tenantId in indexes
4. **Error handling**: Handle cases where tenant is not found gracefully

## API Endpoints

### Get Tenant Info

```
GET /api/tenant/info?slug=clinic-abc
```

Returns tenant information including ID, slug, name, and display name.

## Troubleshooting

### "Tenant not found" errors

- Ensure the tenant slug exists in the database
- Check that the tenant status is 'active'
- Verify middleware is correctly identifying the tenant

### Data isolation issues

- Ensure all queries include tenantId filtering
- Check that indexes include tenantId
- Verify session includes tenantId

### Unique constraint violations

- Ensure unique indexes are tenant-scoped (include tenantId)
- Check that tenantId is being set on new documents

