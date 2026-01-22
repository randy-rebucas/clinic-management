# Multi-Tenant Architecture Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture Pattern](#architecture-pattern)
3. [Core Components](#core-components)
4. [Tenant Identification](#tenant-identification)
5. [Data Isolation](#data-isolation)
6. [Tenant Onboarding](#tenant-onboarding)
7. [Authentication & Authorization](#authentication--authorization)
8. [Subscription Management](#subscription-management)
9. [API Implementation](#api-implementation)
10. [Database Schema](#database-schema)
11. [Middleware & Routing](#middleware--routing)
12. [Security Considerations](#security-considerations)
13. [Best Practices](#best-practices)
14. [Troubleshooting](#troubleshooting)

---

## Overview

This clinic management system implements a **subdomain-based multi-tenant architecture** where each tenant (clinic/organization) operates on its own subdomain. All tenants share the same application instance and database, with strict data isolation enforced at the database query level.

### Key Features

- **Subdomain-based tenant identification** (e.g., `clinic1.example.com`, `clinic2.example.com`)
- **Shared database with tenant-scoped queries** (Single Database, Single Schema pattern)
- **Trial subscription system** with 7-day free trials
- **Automatic tenant context resolution** from request headers
- **Comprehensive data isolation** across all models
- **Tenant-scoped user authentication and permissions**
- **Subscription-based access control**

---

## Architecture Pattern

### Multi-Tenancy Model

This system uses the **Single Database, Shared Schema** approach:

```
┌─────────────────────────────────────────────────┐
│         Application Layer (Next.js)              │
├─────────────────────────────────────────────────┤
│    Tenant Context Middleware (proxy.ts)         │
│    - Extracts subdomain from request             │
│    - Verifies tenant exists and is active        │
│    - Checks subscription status                  │
├─────────────────────────────────────────────────┤
│         Data Access Layer                        │
│    - getTenantContext()                          │
│    - addTenantFilter()                           │
│    - createTenantQuery()                         │
├─────────────────────────────────────────────────┤
│         MongoDB (Single Database)                │
│    All collections have tenantId field           │
│    Queries always filtered by tenantId           │
└─────────────────────────────────────────────────┘
```

### Benefits of This Approach

✅ **Cost-effective**: Single database instance for all tenants
✅ **Simple maintenance**: Updates apply to all tenants simultaneously
✅ **Resource sharing**: Efficient use of database connections and resources
✅ **Quick tenant provisioning**: No database creation needed
✅ **Easy backups**: Single database to backup and restore

### Trade-offs

⚠️ **Security**: Requires strict query filtering to prevent data leaks
⚠️ **Performance**: Large tenants can impact others (mitigated with indexing)
⚠️ **Customization**: Limited tenant-specific schema customization

---

## Core Components

### 1. Tenant Model (`models/Tenant.ts`)

The central entity representing each tenant/clinic:

```typescript
interface ITenant {
  _id: Types.ObjectId;           // Unique tenant identifier
  name: string;                   // Tenant/clinic name
  subdomain: string;              // Unique subdomain (e.g., "clinic1")
  displayName?: string;           // Display name for branding
  email?: string;                 // Contact email
  phone?: string;                 // Contact phone
  address?: {                     // Physical address
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: {                    // Tenant-specific settings
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  status: 'active' | 'inactive' | 'suspended';
  subscription?: {                // Subscription details
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    expiresAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Key Features:**
- Unique subdomain validation with regex pattern
- Status field for tenant lifecycle management
- Built-in subscription management
- Customizable settings per tenant

### 2. Tenant Context Library (`lib/tenant.ts`)

Provides utilities for tenant identification and context management:

#### `extractSubdomain(host: string): string | null`

Extracts subdomain from request host header.

**Supports:**
- Local development: `clinic1.localhost:3000`
- Production: `clinic1.example.com`
- Vercel previews: `tenant---branch.vercel.app`

```typescript
// Examples
extractSubdomain('clinic1.example.com')      // Returns: 'clinic1'
extractSubdomain('www.example.com')          // Returns: null
extractSubdomain('clinic1.localhost:3000')   // Returns: 'clinic1'
```

#### `getTenantContext(): Promise<TenantContext>`

Retrieves full tenant context from request headers.

```typescript
interface TenantContext {
  tenantId: string | null;
  subdomain: string | null;
  tenant: TenantData | null;
}
```

**Usage in API routes:**
```typescript
export async function GET(request: NextRequest) {
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  
  // Use tenantId for queries...
}
```

#### `getTenantId(): Promise<string | null>`

Lightweight version that only returns the tenant ID.

#### `verifyTenant(subdomain: string): Promise<TenantData | null>`

Verifies a tenant exists and is active by subdomain.

### 3. Tenant Query Utilities (`lib/tenant-query.ts`)

Helper functions to add tenant filtering to database queries:

#### `addTenantFilter(query: any): Promise<any>`

Automatically adds tenant filter to any query object:

```typescript
// Before
const query = { status: 'active' };

// After
const tenantQuery = await addTenantFilter(query);
// Result: { status: 'active', tenantId: ObjectId('...') }
```

#### `createTenantQuery(tenantId: string, baseQuery: any): any`

Creates a tenant-scoped query for a specific tenant:

```typescript
const query = createTenantQuery(tenantId, { status: 'active' });
// Result: { status: 'active', tenantId: ObjectId('...') }
```

#### `ensureTenantId(data: any): Promise<any>`

Ensures a document has tenantId set before saving:

```typescript
const patientData = await ensureTenantId({
  firstName: 'John',
  lastName: 'Doe'
});
// Result: { firstName: 'John', lastName: 'Doe', tenantId: ObjectId('...') }
```

---

## Tenant Identification

### Subdomain Detection Flow

```
┌─────────────────────────────────────────────────┐
│   1. Client Request                              │
│      GET https://clinic1.example.com/patients    │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│   2. Middleware (proxy.ts)                       │
│      - Extract host header                       │
│      - Parse subdomain: "clinic1"                │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│   3. Tenant Verification                         │
│      - Query: Tenant.findOne({ subdomain })      │
│      - Check status: 'active'                    │
│      - Check subscription                        │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│   4. Set Context                                 │
│      - Add x-tenant-subdomain header             │
│      - Store tenantId in session                 │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│   5. Route to Application                        │
│      - Context available to all routes           │
│      - tenantId used in all queries              │
└─────────────────────────────────────────────────┘
```

### Environment Configuration

#### Required Environment Variables

```bash
# Root domain for subdomain extraction
ROOT_DOMAIN=example.com

# For local development
ROOT_DOMAIN=localhost
```

#### Reserved Subdomains

These subdomains are reserved and cannot be used for tenants:

- `www`
- `admin`
- `api`
- `app`
- `mail`
- `ftp`
- `localhost`
- `staging`
- `dev`
- `test`
- `demo`

---

## Data Isolation

### Tenant-Scoped Models

All data models include a `tenantId` field that references the `Tenant` model. This field is indexed for query performance.

#### Models with Tenant Scope (30 models)

1. **Authentication & Authorization**
   - `User` - System users (staff, doctors, etc.)
   - `Role` - User roles
   - `Permission` - Granular permissions
   - `Admin` - Admin profile
   - `Doctor` - Doctor profile
   - `Nurse` - Nurse profile
   - `Receptionist` - Receptionist profile
   - `Accountant` - Accountant profile
   - `MedicalRepresentative` - Medical rep profile
   - `Staff` - Generic staff profile (legacy)

2. **Patient Management**
   - `Patient` - Patient records
   - `Membership` - Patient membership/loyalty

3. **Clinical Operations**
   - `Appointment` - Patient appointments
   - `Visit` - Clinical visits
   - `Prescription` - Prescriptions
   - `LabResult` - Laboratory results
   - `Imaging` - Imaging/radiology records
   - `Procedure` - Medical procedures

4. **Queue & Workflow**
   - `Queue` - Patient queue management

5. **Billing & Financial**
   - `Invoice` - Billing invoices

6. **Documents & Referrals**
   - `Document` - Document storage
   - `Referral` - Patient referrals

7. **Catalog & Inventory**
   - `Medicine` - Medicine catalog
   - `Service` - Service catalog
   - `Room` - Room management
   - `Specialization` - Medical specializations
   - `InventoryItem` - Inventory management

8. **System & Audit**
   - `Settings` - Tenant-specific settings
   - `AuditLog` - Audit trail
   - `Notification` - User notifications

### Database Indexes

All tenant-scoped collections have compound indexes for optimal query performance:

```javascript
// Example from Patient model
PatientSchema.index({ tenantId: 1, lastName: 1, firstName: 1 });
PatientSchema.index({ tenantId: 1, email: 1 });
PatientSchema.index({ tenantId: 1, dateOfBirth: 1 });
PatientSchema.index({ tenantId: 1, active: 1 });
PatientSchema.index({ tenantId: 1, patientCode: 1 }, { unique: true, sparse: true });
```

**Benefits:**
- Fast tenant-scoped queries
- Prevents cross-tenant data access
- Enforces tenant-specific uniqueness

### Query Pattern Examples

#### Basic Tenant-Scoped Query

```typescript
// Get all active patients for current tenant
const tenantContext = await getTenantContext();
const tenantId = tenantContext.tenantId;

const patients = await Patient.find({
  tenantId: new Types.ObjectId(tenantId),
  active: true
}).sort({ lastName: 1 });
```

#### With Fallback for Non-Tenant Data

```typescript
// Support backward compatibility with non-tenant data
const query: any = {};

if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
} else {
  query.$or = [
    { tenantId: { $exists: false } },
    { tenantId: null }
  ];
}

const settings = await Settings.findOne(query);
```

#### Complex Query with Search

```typescript
const query: any = {};

// Tenant filter
if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
} else {
  query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
}

// Add search conditions
if (search) {
  const searchConditions = [
    { firstName: { $regex: search, $options: 'i' } },
    { lastName: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } }
  ];
  
  // Combine tenant filter with search
  const tenantFilter: any = {};
  if (tenantId) {
    tenantFilter.tenantId = new Types.ObjectId(tenantId);
  } else {
    tenantFilter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
  }
  
  query.$and = [
    tenantFilter,
    { $or: searchConditions }
  ];
}

const patients = await Patient.find(query);
```

#### Populate with Tenant Filter

```typescript
// When populating relationships, ensure related data is also tenant-scoped
const patientPopulateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode',
};

if (tenantId) {
  patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
} else {
  patientPopulateOptions.match = { 
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }] 
  };
}

const visits = await Visit.find({ tenantId })
  .populate(patientPopulateOptions)
  .populate('provider', 'name');
```

---

## Tenant Onboarding

### Onboarding Methods

#### 1. Web Interface (`/tenant-onboard`)

User-friendly onboarding page accessible at the root domain.

**Features:**
- Form validation
- Subdomain availability check
- Admin user creation
- Automatic role and permission setup
- 7-day trial subscription

**Process:**
1. User fills onboarding form
2. Validates subdomain (availability, format)
3. Creates tenant record
4. Creates default roles (admin, doctor, nurse, receptionist, accountant, medical-representative)
5. Assigns permissions to roles
6. Creates admin user
7. Links admin user to tenant
8. Sets up trial subscription (7 days)

#### 2. CLI Script (`npm run tenant:onboard`)

Interactive command-line wizard for tenant onboarding.

```bash
npm run tenant:onboard
```

**Script Location:** `scripts/onboard-tenant.ts`

**Steps:**
1. Tenant information (name, display name)
2. Subdomain configuration
3. Contact information (email, phone)
4. Address (optional)
5. Settings (timezone, currency, date format)
6. Admin user creation

#### 3. API Endpoint (`POST /api/tenants/onboard`)

Programmatic tenant creation for integrations.

**Request:**
```json
{
  "name": "City Medical Clinic",
  "displayName": "City Medical",
  "subdomain": "citymedical",
  "email": "admin@citymedical.com",
  "phone": "+1234567890",
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
  "admin": {
    "name": "John Admin",
    "email": "john@citymedical.com",
    "password": "SecurePass123!"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tenant onboarded successfully",
  "data": {
    "tenantId": "507f1f77bcf86cd799439011",
    "subdomain": "citymedical",
    "adminUserId": "507f1f77bcf86cd799439012"
  }
}
```

### Subdomain Validation

```typescript
function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  // Length check
  if (subdomain.length < 2 || subdomain.length > 63) {
    return { valid: false, error: 'Subdomain must be between 2 and 63 characters' };
  }
  
  // Format check (alphanumeric and hyphens only)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { valid: false, error: 'Invalid subdomain format' };
  }
  
  // Reserved subdomain check
  const reservedSubdomains = ['www', 'admin', 'api', 'app', ...];
  if (reservedSubdomains.includes(subdomain)) {
    return { valid: false, error: 'Subdomain is reserved' };
  }
  
  return { valid: true };
}
```

### Default Roles and Permissions

During tenant onboarding, the following roles are created with predefined permissions:

#### Admin Role
- Full system access
- User management
- Settings configuration
- Billing management

#### Doctor Role
- Patient management
- Visit creation/editing
- Prescription management
- Lab results management

#### Nurse Role
- Patient vitals
- Visit assistance
- Queue management
- Basic patient data

#### Receptionist Role
- Appointment scheduling
- Patient registration
- Queue management
- Basic billing

#### Accountant Role
- Invoice management
- Payment processing
- Financial reports
- Billing settings

#### Medical Representative Role
- Medicine catalog
- Inventory viewing
- Sales reports

---

## Authentication & Authorization

### Session Management

Sessions include tenant context for multi-tenant support:

```typescript
interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  roleId?: string;
  tenantId?: string;  // Tenant context stored in session
  expiresAt: number | Date;
}
```

### Login Flow with Tenant Context

```typescript
export async function login(email: string, password: string) {
  await connectDB();
  
  // Get tenant context from request
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  // Find user within tenant scope
  const userQuery: any = { email: email.toLowerCase() };
  
  if (tenantId) {
    userQuery.tenantId = tenantId;
  } else {
    // Fallback for users without tenant
    userQuery.$or = [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ];
  }
  
  const user = await User.findOne(userQuery).populate('role');
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Verify password
  const isValid = await bcrypt.compare(password, user.password);
  
  if (!isValid) {
    throw new Error('Invalid credentials');
  }
  
  // Ensure tenant matching
  const userTenantId = user.tenantId?.toString();
  
  if (tenantId && userTenantId && userTenantId !== tenantId) {
    throw new Error('Access denied');
  }
  
  // Create session with tenant context
  await createSession(
    user._id.toString(),
    user.email,
    user.role.name,
    user.role._id.toString(),
    userTenantId || tenantId
  );
  
  return user;
}
```

### Permission Checks

Permissions are always checked within tenant context:

```typescript
export async function hasPermission(
  userId: string,
  resource: string,
  action: string
): Promise<boolean> {
  const user = await User.findById(userId).populate('role');
  
  if (!user) return false;
  
  // Get tenant context
  const tenantContext = await getTenantContext();
  const contextTenantId = tenantContext.tenantId;
  const userTenantId = user.tenantId?.toString();
  
  // Ensure user belongs to current tenant
  if (contextTenantId && userTenantId && userTenantId !== contextTenantId) {
    return false;
  }
  
  // Check role permissions
  const role = user.role;
  
  if (!role || !role.defaultPermissions) return false;
  
  const hasPermission = role.defaultPermissions.some(
    (perm: any) => perm.resource === resource && perm.actions.includes(action)
  );
  
  return hasPermission;
}
```

### Cross-Tenant Access Prevention

The system prevents cross-tenant access at multiple levels:

1. **Middleware Level**: Verifies tenant exists and is active
2. **Session Level**: Stores tenant context in session
3. **Query Level**: All queries filtered by tenantId
4. **Permission Level**: Permissions checked within tenant context
5. **Populate Level**: Related documents filtered by tenantId

---

## Subscription Management

### Subscription Model

```typescript
interface Subscription {
  plan: string;                    // 'trial', 'basic', 'premium', 'enterprise'
  status: 'active' | 'cancelled' | 'expired';
  expiresAt: Date;
}
```

### Trial System

New tenants receive a **7-day trial subscription**:

```typescript
const trialExpiresAt = new Date();
trialExpiresAt.setDate(trialExpiresAt.getDate() + 7);

const tenant = await Tenant.create({
  name: 'Clinic Name',
  subdomain: 'clinic',
  subscription: {
    plan: 'trial',
    status: 'active',
    expiresAt: trialExpiresAt
  }
});
```

### Subscription Verification

#### Middleware Check (`proxy.ts`)

```typescript
// Check subscription status and redirect if expired
const subscriptionRoutes = ['/subscription', '/login', '/signup', ...];
const isSubscriptionRoute = subscriptionRoutes.some(route => 
  pathname.startsWith(route)
);

if (!isSubscriptionRoute && !isPublicRoute) {
  const needsRedirect = await requiresSubscriptionRedirect(tenant._id);
  
  if (needsRedirect) {
    return NextResponse.redirect(new URL('/subscription', request.url));
  }
}
```

#### Subscription Status Check

```typescript
export async function checkSubscriptionStatus(
  tenantId: string
): Promise<SubscriptionStatus> {
  const tenant = await Tenant.findById(tenantId).select('subscription');
  
  if (!tenant || !tenant.subscription) {
    return {
      isActive: false,
      isExpired: true,
      isTrial: false,
      expiresAt: null,
      plan: null,
      daysRemaining: null
    };
  }
  
  const subscription = tenant.subscription;
  const now = new Date();
  const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt < now : false;
  const isActive = subscription.status === 'active' && !isExpired;
  const isTrial = subscription.plan === 'trial';
  
  let daysRemaining: number | null = null;
  if (expiresAt && !isExpired) {
    const diffTime = expiresAt.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  return {
    isActive,
    isExpired,
    isTrial,
    expiresAt,
    plan: subscription.plan || null,
    daysRemaining,
    status: subscription.status
  };
}
```

### Grace Period

Expired subscriptions get a grace period for read-only access:

```typescript
export async function checkGracePeriod(tenantId: string) {
  const subscription = await checkSubscriptionStatus(tenantId);
  
  if (!subscription.isExpired) {
    return { isInGracePeriod: false, daysRemaining: null };
  }
  
  const expiresAt = subscription.expiresAt;
  const gracePeriodDays = 7; // 7 days grace period
  const gracePeriodEnd = new Date(expiresAt);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
  
  const now = new Date();
  const isInGracePeriod = now < gracePeriodEnd;
  
  return {
    isInGracePeriod,
    daysRemaining: isInGracePeriod 
      ? Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0
  };
}
```

### Payment Integration

The system includes PayPal integration for subscription payments:

- **Create Order**: `POST /api/subscription/create-order`
- **Capture Order**: `POST /api/subscription/capture-order`
- **Webhook**: `POST /api/subscription/webhook`

---

## API Implementation

### Standard API Route Pattern

All API routes follow this pattern for tenant isolation:

```typescript
export async function GET(request: NextRequest) {
  // 1. Verify authentication
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }
  
  // 2. Check permissions
  const permissionCheck = await requirePermission(session, 'resource', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }
  
  try {
    await connectDB();
    
    // 3. Get tenant context
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // 4. Build tenant-scoped query
    const query: any = {};
    
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ];
    }
    
    // 5. Add additional filters
    const searchParams = request.nextUrl.searchParams;
    if (searchParams.get('status')) {
      query.status = searchParams.get('status');
    }
    
    // 6. Execute query
    const results = await Model.find(query).sort({ createdAt: -1 });
    
    return NextResponse.json({
      success: true,
      data: results
    });
    
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### POST/PUT with Tenant Context

```typescript
export async function POST(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  try {
    await connectDB();
    
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    
    // Ensure tenantId is set on new documents
    const data = {
      ...body,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: session.userId
    };
    
    const document = await Model.create(data);
    
    return NextResponse.json({
      success: true,
      data: document
    });
    
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## Database Schema

### Tenant Model Schema

```javascript
const TenantSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, default: () => new Types.ObjectId() },
  name: { type: String, required: true, trim: true },
  subdomain: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    match: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
  },
  displayName: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  settings: {
    timezone: { type: String, default: 'UTC' },
    currency: { type: String, default: 'PHP' },
    dateFormat: { type: String, default: 'MM/DD/YYYY' },
    logo: String,
    primaryColor: String,
    secondaryColor: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  subscription: {
    plan: String,
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active'
    },
    expiresAt: Date
  }
}, { timestamps: true });

// Indexes
TenantSchema.index({ status: 1 });
TenantSchema.index({ 'subscription.status': 1 });
```

### Tenant-Scoped Model Example

```javascript
const PatientSchema = new Schema({
  // Tenant reference
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true  // Critical for query performance
  },
  
  // Patient fields
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  // ... other fields
  
}, { timestamps: true });

// Compound indexes for tenant-scoped queries
PatientSchema.index({ tenantId: 1, lastName: 1, firstName: 1 });
PatientSchema.index({ tenantId: 1, email: 1 });
PatientSchema.index({ tenantId: 1, active: 1 });
PatientSchema.index({ tenantId: 1, patientCode: 1 }, { unique: true, sparse: true });
```

---

## Middleware & Routing

### Proxy Middleware (`proxy.ts`)

The main middleware that handles tenant routing and verification:

```typescript
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  
  // Allow API routes and static files
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }
  
  // Handle root domain (no subdomain)
  if (!subdomain) {
    // Redirect to www in production
    if (process.env.NODE_ENV === 'production') {
      // ... redirect logic
    }
    return NextResponse.next();
  }
  
  // Verify tenant exists and is active
  const tenant = await verifyTenant(subdomain);
  
  if (!tenant) {
    return NextResponse.redirect(new URL('/tenant-not-found', request.url));
  }
  
  // Check subscription status
  const subscriptionRoutes = ['/subscription', '/login', '/signup'];
  const isSubscriptionRoute = subscriptionRoutes.some(route =>
    pathname.startsWith(route)
  );
  
  if (!isSubscriptionRoute) {
    const needsRedirect = await requiresSubscriptionRedirect(tenant._id);
    if (needsRedirect) {
      return NextResponse.redirect(new URL('/subscription', request.url));
    }
  }
  
  // Block admin routes on subdomains
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  // Add tenant subdomain to headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-subdomain', subdomain);
  
  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}
```

### Route Protection

#### Server Component Protection

```typescript
// app/(app)/patients/page.tsx
export default async function PatientsPage() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }
  
  const tenantContext = await getTenantContext();
  
  if (!tenantContext.tenant) {
    redirect('/tenant-not-found');
  }
  
  // Render component
  return <PatientsPageClient />;
}
```

#### API Route Protection

```typescript
export async function GET(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // Continue with logic...
}
```

---

## Security Considerations

### 1. Query Injection Prevention

**Problem**: Malicious tenantId in query could expose other tenant's data.

**Solution**: Always use `Types.ObjectId()` validation:

```typescript
// ✅ GOOD
if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
}

// ❌ BAD - could be injected
if (tenantId) {
  query.tenantId = tenantId;
}
```

### 2. Session Tenant Validation

**Problem**: User from tenant A tries to access tenant B's subdomain.

**Solution**: Always validate session tenantId matches context tenantId:

```typescript
const userTenantId = user.tenantId?.toString();
const contextTenantId = tenantContext.tenantId;

if (contextTenantId && userTenantId && userTenantId !== contextTenantId) {
  return unauthorizedResponse();
}
```

### 3. Populate Filter Enforcement

**Problem**: Populating relationships could leak cross-tenant data.

**Solution**: Always add tenant filter to populate options:

```typescript
const populateOptions: any = {
  path: 'patient',
  select: 'firstName lastName'
};

if (tenantId) {
  populateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
}

const visits = await Visit.find(query).populate(populateOptions);
```

### 4. Subdomain Hijacking Prevention

**Problem**: Reserved subdomains (www, admin, api) used by tenants.

**Solution**: Maintain and enforce reserved subdomain list:

```typescript
const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'ftp',
  'localhost', 'staging', 'dev', 'test', 'demo'
];

if (RESERVED_SUBDOMAINS.includes(subdomain)) {
  return { valid: false, error: 'Subdomain is reserved' };
}
```

### 5. Cross-Origin Request Protection

Security headers are set in middleware:

```typescript
response.headers.set('X-Frame-Options', 'DENY');
response.headers.set('X-Content-Type-Options', 'nosniff');
response.headers.set('X-XSS-Protection', '1; mode=block');
response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
```

### 6. Subscription Bypass Prevention

**Problem**: Expired tenant tries to access system by manipulating routes.

**Solution**: Middleware-level subscription check:

```typescript
const needsRedirect = await requiresSubscriptionRedirect(tenant._id);
if (needsRedirect && !isSubscriptionRoute) {
  return NextResponse.redirect(new URL('/subscription', request.url));
}
```

---

## Best Practices

### 1. Always Extract Tenant Context Early

```typescript
// ✅ GOOD - Extract once at the start
export async function GET(request: NextRequest) {
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  // Use tenantId throughout...
}

// ❌ BAD - Multiple calls
export async function GET(request: NextRequest) {
  const tenantId1 = await getTenantId();
  // ... later
  const tenantId2 = await getTenantId();
}
```

### 2. Use Helper Functions

```typescript
// ✅ GOOD - Use helpers
const query = await addTenantFilter({ status: 'active' });

// ❌ BAD - Manual implementation
const query: any = { status: 'active' };
if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
}
```

### 3. Validate Tenant Context

```typescript
// ✅ GOOD - Always validate
const tenantContext = await getTenantContext();
if (!tenantContext.tenantId) {
  return NextResponse.json(
    { error: 'Tenant not found' },
    { status: 404 }
  );
}

// ❌ BAD - Assume it exists
const tenantId = (await getTenantContext()).tenantId;
await Model.find({ tenantId }); // Could be null!
```

### 4. Index All Tenant Fields

```typescript
// ✅ GOOD - Compound indexes
Schema.index({ tenantId: 1, status: 1 });
Schema.index({ tenantId: 1, email: 1 });
Schema.index({ tenantId: 1, createdAt: -1 });

// ❌ BAD - No tenant indexing
Schema.index({ status: 1 });
Schema.index({ email: 1 });
```

### 5. Test Cross-Tenant Isolation

Always test that tenants cannot access each other's data:

```typescript
// Test: User from tenant A cannot access tenant B data
test('cross-tenant isolation', async () => {
  const tenantA = await createTenant('tenant-a');
  const tenantB = await createTenant('tenant-b');
  
  const patientA = await Patient.create({
    firstName: 'John',
    lastName: 'Doe',
    tenantId: tenantA._id
  });
  
  // Try to access from tenant B context
  const result = await Patient.findOne({
    _id: patientA._id,
    tenantId: tenantB._id
  });
  
  expect(result).toBeNull(); // Should not find patient
});
```

### 6. Document Tenant-Scoped Functions

```typescript
/**
 * Get all active patients for the current tenant
 * 
 * @requires tenantContext - Tenant context must be set via getTenantContext()
 * @returns Promise<Patient[]> - Array of patients for current tenant only
 */
export async function getActivePatients(): Promise<Patient[]> {
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  if (!tenantId) {
    throw new Error('Tenant context required');
  }
  
  return await Patient.find({
    tenantId: new Types.ObjectId(tenantId),
    active: true
  });
}
```

---

## Troubleshooting

### Common Issues

#### 1. Subdomain Not Detected

**Symptom**: `tenantId` is always null

**Causes:**
- Local development without subdomain setup
- Incorrect ROOT_DOMAIN configuration
- Host header not being passed

**Solutions:**

```bash
# For local development, use subdomain.localhost
# In /etc/hosts or C:\Windows\System32\drivers\etc\hosts
127.0.0.1 clinic1.localhost
127.0.0.1 clinic2.localhost

# Set environment variable
ROOT_DOMAIN=localhost

# Access at http://clinic1.localhost:3000
```

#### 2. Cross-Tenant Data Leakage

**Symptom**: User can see data from other tenants

**Debug Steps:**

1. Check query includes tenantId:
```typescript
console.log('Query:', JSON.stringify(query, null, 2));
// Should show: { "tenantId": "..." }
```

2. Verify session has correct tenantId:
```typescript
const session = await verifySession();
console.log('Session tenantId:', session?.tenantId);
```

3. Check populate filters:
```typescript
// Add match to populate options
.populate({
  path: 'patient',
  match: { tenantId: new Types.ObjectId(tenantId) }
})
```

#### 3. Subscription Redirect Loop

**Symptom**: Users redirected to /subscription repeatedly

**Causes:**
- Subscription routes not in allowlist
- Grace period not working
- Subscription status not updating

**Solutions:**

```typescript
// Add route to subscription routes list
const subscriptionRoutes = [
  '/subscription',
  '/subscription/success',
  '/subscription/cancel'
];

// Check grace period is working
const gracePeriod = await checkGracePeriod(tenantId);
console.log('Grace period:', gracePeriod);
```

#### 4. Unique Index Violations

**Symptom**: Error "E11000 duplicate key error"

**Cause**: Unique index not scoped to tenant

**Solution:**

```typescript
// ❌ BAD - Global unique
Schema.index({ email: 1 }, { unique: true });

// ✅ GOOD - Tenant-scoped unique
Schema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
```

#### 5. Tenant Not Found After Onboarding

**Symptom**: New tenant shows "Tenant not found" page

**Debug:**

1. Check tenant was created:
```bash
mongosh
use clinic-db
db.tenants.find({ subdomain: 'clinic1' })
```

2. Verify status is 'active':
```javascript
db.tenants.updateOne(
  { subdomain: 'clinic1' },
  { $set: { status: 'active' } }
)
```

3. Check subdomain format:
```typescript
// Must be lowercase, alphanumeric, hyphens only
const subdomain = 'clinic-1'; // ✅ GOOD
const subdomain = 'Clinic1'; // ❌ BAD (uppercase)
const subdomain = 'clinic_1'; // ❌ BAD (underscore)
```

### Debugging Tools

#### 1. Tenant Context Logger

Add to `lib/tenant.ts`:

```typescript
export async function logTenantContext() {
  const context = await getTenantContext();
  console.log('=== TENANT CONTEXT ===');
  console.log('Tenant ID:', context.tenantId);
  console.log('Subdomain:', context.subdomain);
  console.log('Tenant:', context.tenant);
  console.log('===================');
  return context;
}
```

#### 2. Query Inspector

```typescript
export function inspectQuery(query: any, label: string = 'Query') {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(query, null, 2));
  console.log('================\n');
}
```

#### 3. Tenant Deletion Script

For testing, use tenant deletion script:

```bash
npm run tenant:delete
```

**Script Location:** `scripts/delete-tenant.ts`

Safely deletes all tenant data across all collections.

---

## Migration Guide

### Adding Tenant Support to Existing Model

If you're adding a new model or updating an existing one to support multi-tenancy:

```typescript
// 1. Add tenantId field
const MyModelSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true  // Required!
  },
  // ... other fields
});

// 2. Add compound indexes
MyModelSchema.index({ tenantId: 1, createdAt: -1 });
MyModelSchema.index({ tenantId: 1, status: 1 });

// 3. Update queries in API routes
export async function GET(request: NextRequest) {
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;
  
  const query: any = {};
  
  if (tenantId) {
    query.tenantId = new Types.ObjectId(tenantId);
  } else {
    query.$or = [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ];
  }
  
  const results = await MyModel.find(query);
  return NextResponse.json({ data: results });
}
```

### Migrating Existing Data

If you have existing data without tenantId:

```javascript
// Migration script
const mongoose = require('mongoose');
const Tenant = require('./models/Tenant');
const MyModel = require('./models/MyModel');

async function migrate() {
  // Get default tenant (create if needed)
  let tenant = await Tenant.findOne({ subdomain: 'default' });
  
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Default Clinic',
      subdomain: 'default',
      status: 'active'
    });
  }
  
  // Update all documents without tenantId
  const result = await MyModel.updateMany(
    { tenantId: { $exists: false } },
    { $set: { tenantId: tenant._id } }
  );
  
  console.log(`Updated ${result.modifiedCount} documents`);
}

migrate();
```

---

## Conclusion

This multi-tenant architecture provides:

✅ **Scalability**: Single codebase serves unlimited tenants
✅ **Security**: Strong data isolation at database level
✅ **Flexibility**: Tenant-specific customization via settings
✅ **Cost-Efficiency**: Shared infrastructure reduces costs
✅ **Maintainability**: Updates deploy to all tenants simultaneously

### Key Takeaways

1. **Always filter by tenantId** in every database query
2. **Extract tenant context early** in every route/component
3. **Use compound indexes** with tenantId for performance
4. **Validate tenant matching** between session and context
5. **Test cross-tenant isolation** thoroughly
6. **Monitor subscription status** in middleware
7. **Use helper functions** for consistency

### Resources

- **Tenant Model**: `models/Tenant.ts`
- **Tenant Library**: `lib/tenant.ts`
- **Query Helpers**: `lib/tenant-query.ts`
- **Proxy Middleware**: `proxy.ts`
- **Onboarding Script**: `scripts/onboard-tenant.ts`
- **Delete Script**: `scripts/delete-tenant.ts`

---

**Document Version**: 1.0
**Last Updated**: January 2026
**Maintained By**: Development Team
