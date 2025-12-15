# Multi-Tenant Architecture Documentation

## Overview

MyClinicSoft now supports multi-tenancy, allowing multiple clinics to operate independently on the same application instance. Each tenant is identified by a unique subdomain (e.g., `clinic1.example.com`, `clinic2.example.com`).

## Architecture

### Components

1. **Tenant Model** (`models/Tenant.ts`)
   - Stores tenant information (name, subdomain, settings, etc.)
   - Each tenant has a unique subdomain identifier
   - Supports tenant-specific settings (timezone, currency, branding)

2. **Middleware** (`middleware.ts`)
   - Extracts subdomain from incoming requests
   - Sets tenant context via headers
   - Blocks admin/setup routes from subdomains

3. **Tenant Utilities** (`lib/tenant.ts`)
   - `getTenantContext()` - Get full tenant context from request
   - `getTenantId()` - Get tenant ID (lightweight)
   - `extractSubdomain()` - Extract subdomain from host header
   - `verifyTenant()` - Verify tenant exists and is active

4. **Tenant Query Helpers** (`lib/tenant-query.ts`)
   - `addTenantFilter()` - Automatically add tenant filter to queries
   - `createTenantQuery()` - Create tenant-scoped query
   - `ensureTenantId()` - Ensure document has tenantId before saving

## Setup

### Environment Variables

Add to your `.env.local`:

```env
# Root domain for subdomain detection
# For local development: localhost
# For production: your-domain.com
ROOT_DOMAIN=localhost
```

### Local Development

For local development, you can access tenants using subdomains:

- Root domain: `http://localhost:3000`
- Tenant 1: `http://clinic1.localhost:3000`
- Tenant 2: `http://clinic2.localhost:3000`

**Note:** You may need to configure your hosts file or use a tool like `localtest.me` or configure your local DNS.

### Production

In production, configure your DNS to point subdomains to your application:

- `*.example.com` → Your application server
- Each tenant gets a subdomain: `clinic1.example.com`, `clinic2.example.com`, etc.

## Database Schema

### Tenant Model

```typescript
{
  name: string;
  subdomain: string; // Unique identifier
  displayName?: string;
  email?: string;
  phone?: string;
  address?: {...};
  settings?: {
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  status: 'active' | 'inactive' | 'suspended';
  subscription?: {...};
}
```

### Models with Tenant Support

The following models now include `tenantId`:

- **User** - Users are scoped to tenants (email uniqueness is per-tenant)
- **Patient** - Patients belong to a tenant
- **Appointment** - Appointments are tenant-scoped
- **Visit** - Visits are tenant-scoped
- **Prescription** - Prescriptions are tenant-scoped
- **Invoice** - Invoices are tenant-scoped
- **Document** - Documents are tenant-scoped
- **Queue** - Queue items are tenant-scoped

## Usage

### Creating a Tenant

```typescript
import Tenant from '@/models/Tenant';
import connectDB from '@/lib/mongodb';

await connectDB();

const tenant = await Tenant.create({
  name: 'Clinic Name',
  subdomain: 'clinic1',
  displayName: 'Clinic Display Name',
  status: 'active',
  settings: {
    timezone: 'America/New_York',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
  },
});
```

### Using Tenant Context in API Routes

```typescript
import { getTenantContext } from '@/lib/tenant';
import Patient from '@/models/Patient';

export async function GET() {
  const { tenantId } = await getTenantContext();
  
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  
  const patients = await Patient.find({ tenantId });
  return NextResponse.json({ patients });
}
```

### Using Tenant Query Helpers

```typescript
import { addTenantFilter } from '@/lib/tenant-query';
import Patient from '@/models/Patient';

// Automatically adds tenantId to query
const query = await addTenantFilter({ active: true });
const patients = await Patient.find(query);
```

### Creating Tenant-Scoped Documents

```typescript
import { getTenantId } from '@/lib/tenant';
import { ensureTenantId } from '@/lib/tenant-query';
import Patient from '@/models/Patient';

const tenantId = await getTenantId();
const patientData = await ensureTenantId({
  firstName: 'John',
  lastName: 'Doe',
  // ... other fields
});

const patient = await Patient.create(patientData);
```

## Authentication

Authentication is tenant-aware:

- Users are scoped to tenants (email uniqueness is per-tenant)
- Login automatically detects tenant from subdomain
- Session includes `tenantId` for authorization checks
- Users can only access data from their tenant

### User Email Uniqueness

With multi-tenancy, email uniqueness is scoped to tenants:

- `user@example.com` can exist in multiple tenants
- Within a tenant, emails must be unique
- The User model uses a compound index: `{ email: 1, tenantId: 1 }`

## Migration Guide

### Existing Data

If you have existing data without tenants:

1. **Create a default tenant** for existing data
2. **Update existing records** to reference the default tenant
3. **Run a migration script** to add `tenantId` to existing documents

Example migration:

```typescript
import Tenant from '@/models/Tenant';
import Patient from '@/models/Patient';
import connectDB from '@/lib/mongodb';

async function migrate() {
  await connectDB();
  
  // Create default tenant
  const defaultTenant = await Tenant.findOne({ subdomain: 'default' }) ||
    await Tenant.create({
      name: 'Default Clinic',
      subdomain: 'default',
      status: 'active',
    });
  
  // Update existing patients
  await Patient.updateMany(
    { tenantId: { $exists: false } },
    { $set: { tenantId: defaultTenant._id } }
  );
  
  // Repeat for other models...
}
```

### Backward Compatibility

The system maintains backward compatibility:

- Models have `tenantId` as optional
- Queries without tenant context return data with `null` tenantId
- Root domain access works without tenant context

## Security Considerations

1. **Tenant Isolation**: All queries must be tenant-scoped to prevent data leakage
2. **Subdomain Validation**: Middleware validates subdomain and blocks invalid tenants
3. **Session Security**: Sessions include tenantId to prevent cross-tenant access
4. **Admin Routes**: Admin/setup routes are blocked from subdomains (root domain only)

## Best Practices

1. **Always use tenant context** in API routes and server actions
2. **Use tenant query helpers** to ensure queries are scoped
3. **Validate tenant access** before returning sensitive data
4. **Set tenantId** when creating new documents
5. **Use compound indexes** with tenantId for efficient queries

## Troubleshooting

### Subdomain Not Detected

- Check `ROOT_DOMAIN` environment variable
- Verify DNS configuration (production)
- Check middleware logs for subdomain extraction

### Tenant Not Found

- Verify tenant exists in database
- Check tenant status is 'active'
- Verify subdomain matches exactly (case-insensitive)

### Data Not Showing

- Ensure queries include tenantId filter
- Check that documents have tenantId set
- Verify tenant context is being retrieved correctly

## API Reference

### `getTenantContext()`

Returns full tenant context including tenant object.

```typescript
const context = await getTenantContext();
// { tenantId: string | null, subdomain: string | null, tenant: ITenant | null }
```

### `getTenantId()`

Returns only the tenant ID (lightweight).

```typescript
const tenantId = await getTenantId();
// string | null
```

### `addTenantFilter(query)`

Adds tenant filter to a query object.

```typescript
const query = await addTenantFilter({ active: true });
// { active: true, tenantId: ObjectId(...) }
```

### `ensureTenantId(data)`

Ensures data object has tenantId set.

```typescript
const data = await ensureTenantId({ name: 'Test' });
// { name: 'Test', tenantId: ObjectId(...) }
```

