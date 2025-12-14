# Tenant Onboarding Process

This guide explains how to onboard a new tenant (clinic) into the multi-tenant clinic management system.

## Overview

Tenant onboarding involves:
1. Creating a tenant record in the database
2. Setting up DNS/subdomain configuration
3. Creating an initial admin user for the tenant
4. Configuring tenant-specific settings
5. Verifying access

## Prerequisites

- MongoDB connection configured
- Root domain configured in environment (`ROOT_DOMAIN`)
- Access to create tenants (typically via admin interface or script)

## Step-by-Step Process

### Method 1: Using the Onboarding Script (Recommended)

We provide an automated script to streamline tenant onboarding:

```bash
npm run tenant:onboard
```

This script will:
- Prompt for tenant information
- Create the tenant record
- Create an admin user
- Set up default settings
- Verify the configuration

### Method 2: Manual Onboarding via API

#### Step 1: Create Tenant Record

Create a tenant via API or directly in the database:

```typescript
// POST /api/tenants
{
  "name": "City Medical Clinic",
  "subdomain": "citymedical",
  "displayName": "City Medical Clinic",
  "email": "admin@citymedical.com",
  "phone": "+1-555-0123",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "settings": {
    "timezone": "America/New_York",
    "currency": "USD",
    "dateFormat": "MM/DD/YYYY"
  },
  "status": "active"
}
```

#### Step 2: Configure DNS

For production, configure DNS to point the subdomain to your application:

```
citymedical.yourdomain.com → Your application server IP
```

For local development:
- Use `citymedical.localhost:3000`
- Or configure `/etc/hosts` (Mac/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
  ```
  127.0.0.1 citymedical.localhost
  ```

#### Step 3: Create Admin User

Access the tenant subdomain and create the first admin user:

1. Navigate to `http://citymedical.localhost:3000/signup` (local) or `https://citymedical.yourdomain.com/signup` (production)
2. Fill in admin user details:
   - Name: Admin Name
   - Email: admin@citymedical.com
   - Password: (secure password)
   - Role: admin
3. Submit the form

The user will be automatically associated with the tenant based on the subdomain.

#### Step 4: Verify Access

1. Log in with the admin credentials
2. Verify you can access the dashboard
3. Check that data is tenant-scoped (no cross-tenant data visible)

### Method 3: Programmatic Onboarding

```typescript
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Role from '@/models/Role';
import bcrypt from 'bcryptjs';

async function onboardTenant(tenantData: {
  name: string;
  subdomain: string;
  displayName?: string;
  email: string;
  phone?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}) {
  await connectDB();

  // 1. Create tenant
  const tenant = await Tenant.create({
    name: tenantData.name,
    subdomain: tenantData.subdomain,
    displayName: tenantData.displayName || tenantData.name,
    email: tenantData.email,
    phone: tenantData.phone,
    status: 'active',
    settings: {
      timezone: 'UTC',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
    },
  });

  // 2. Get or create admin role
  let adminRole = await Role.findOne({ name: 'admin' });
  if (!adminRole) {
    adminRole = await Role.create({
      name: 'admin',
      displayName: 'Administrator',
      isActive: true,
    });
  }

  // 3. Create admin user
  const hashedPassword = await bcrypt.hash(tenantData.adminPassword, 10);
  const adminUser = await User.create({
    name: tenantData.adminName,
    email: tenantData.adminEmail.toLowerCase(),
    password: hashedPassword,
    role: adminRole._id,
    tenantId: tenant._id,
    status: 'active',
  });

  return {
    tenant,
    adminUser,
    accessUrl: `http://${tenantData.subdomain}.localhost:3000`, // Adjust for production
  };
}

// Usage
const result = await onboardTenant({
  name: 'City Medical Clinic',
  subdomain: 'citymedical',
  email: 'contact@citymedical.com',
  adminEmail: 'admin@citymedical.com',
  adminName: 'Dr. John Smith',
  adminPassword: 'SecurePassword123!',
});

console.log('Tenant onboarded:', result);
```

## Tenant Configuration

### Required Fields

- **name**: Tenant/clinic name (required)
- **subdomain**: Unique subdomain identifier (required, lowercase, alphanumeric + hyphens)
- **status**: 'active' | 'inactive' | 'suspended' (default: 'active')

### Optional Fields

- **displayName**: Display name for the tenant
- **email**: Contact email
- **phone**: Contact phone
- **address**: Physical address
- **settings**: Tenant-specific settings
  - `timezone`: Timezone (default: 'UTC')
  - `currency`: Currency code (default: 'USD')
  - `dateFormat`: Date format (default: 'MM/DD/YYYY')
  - `logo`: Logo URL
  - `primaryColor`: Primary brand color
  - `secondaryColor`: Secondary brand color

### Subdomain Rules

- Must be 2-63 characters long
- Can contain lowercase letters, numbers, and hyphens
- Must start and end with alphanumeric characters
- Cannot be a reserved word: `www`, `api`, `admin`, `app`, `mail`, `ftp`, `localhost`, `staging`, `dev`, `test`, `demo`

## Post-Onboarding Checklist

After onboarding a tenant, verify:

- [ ] Tenant record created in database
- [ ] Subdomain accessible (DNS configured for production)
- [ ] Admin user can log in
- [ ] Admin user is associated with correct tenant
- [ ] Tenant settings are configured
- [ ] Data isolation works (no cross-tenant data)
- [ ] Default roles exist (if needed)
- [ ] Email notifications work (if configured)

## Troubleshooting

### Subdomain Not Working

**Issue**: Cannot access tenant via subdomain

**Solutions**:
1. Check DNS configuration (production)
2. Check `/etc/hosts` or Windows hosts file (local)
3. Verify `ROOT_DOMAIN` environment variable
4. Check middleware is extracting subdomain correctly

### User Not Associated with Tenant

**Issue**: User created but not linked to tenant

**Solutions**:
1. Verify user was created via subdomain (not root domain)
2. Check `tenantId` field in user document
3. Verify tenant exists and is active
4. Check authentication flow includes tenant context

### Duplicate Email Error

**Issue**: Email already exists error when creating user

**Solutions**:
1. Email uniqueness is per-tenant, but check if email exists in another tenant
2. Verify tenant context is being set correctly
3. Check if user exists without tenantId (backward compatibility)

## Security Considerations

1. **Subdomain Validation**: Always validate subdomain format and reserved words
2. **Tenant Isolation**: Ensure all queries are tenant-scoped
3. **Admin Access**: Limit who can create tenants (typically platform admins only)
4. **Password Security**: Enforce strong passwords for admin users
5. **Status Checks**: Verify tenant is 'active' before allowing access

## API Endpoints

### Create Tenant

```http
POST /api/tenants
Content-Type: application/json

{
  "name": "Clinic Name",
  "subdomain": "clinicname",
  ...
}
```

### Get Tenant

```http
GET /api/tenants/:subdomain
```

### Update Tenant

```http
PATCH /api/tenants/:id
Content-Type: application/json

{
  "settings": { ... }
}
```

## Next Steps

After onboarding:

1. **Configure Settings**: Update tenant settings (timezone, currency, etc.)
2. **Add Staff**: Create additional users (doctors, nurses, receptionists)
3. **Set Up Services**: Configure clinic services and pricing
4. **Configure Rooms**: Set up clinic rooms
5. **Import Data**: Import existing patient data (if migrating)
6. **Train Users**: Provide training to clinic staff

## Related Documentation

- [Multi-Tenant Architecture](./MULTI_TENANT.md)
- [Authentication](./AUTHENTICATION.md)
- [Setup Guide](../README.md)

