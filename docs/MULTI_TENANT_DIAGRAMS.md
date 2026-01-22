# Multi-Tenant Architecture Diagrams

Visual representations of the multi-tenant implementation in the clinic management system.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Request Flow](#request-flow)
3. [Data Isolation](#data-isolation)
4. [Tenant Onboarding Flow](#tenant-onboarding-flow)
5. [Authentication Flow](#authentication-flow)
6. [Subscription Management](#subscription-management)
7. [Database Schema](#database-schema)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Tenant A   │  │   Tenant B   │  │   Tenant C   │          │
│  │ clinic1.com  │  │ clinic2.com  │  │ clinic3.com  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
└─────────┼──────────────────┼──────────────────┼───────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                    APPLICATION LAYER                               │
│                      (Next.js App)                                 │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Middleware (proxy.ts)                        │    │
│  │  • Extract subdomain                                      │    │
│  │  • Verify tenant                                          │    │
│  │  • Check subscription                                     │    │
│  │  • Set tenant context                                     │    │
│  └────────────────────────┬─────────────────────────────────┘    │
│                            │                                       │
│  ┌────────────────────────▼─────────────────────────────────┐    │
│  │              Route Handlers                               │    │
│  │  • API Routes          • Server Components                │    │
│  │  • Authentication      • Client Components                │    │
│  └────────────────────────┬─────────────────────────────────┘    │
│                            │                                       │
│  ┌────────────────────────▼─────────────────────────────────┐    │
│  │           Tenant Context Layer                            │    │
│  │  • getTenantContext()  • verifyTenant()                   │    │
│  │  • getTenantId()       • addTenantFilter()                │    │
│  └────────────────────────┬─────────────────────────────────┘    │
│                            │                                       │
└────────────────────────────┼───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│                      DATA LAYER                                     │
│                     (MongoDB)                                       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              Single Shared Database                       │     │
│  │                                                           │     │
│  │  Collections with tenantId field:                        │     │
│  │  ┌────────────┬────────────┬────────────┐               │     │
│  │  │  Tenant A  │  Tenant B  │  Tenant C  │               │     │
│  │  │    Data    │    Data    │    Data    │               │     │
│  │  └────────────┴────────────┴────────────┘               │     │
│  │                                                           │     │
│  │  • Patients    • Appointments  • Visits                  │     │
│  │  • Users       • Prescriptions • Invoices                │     │
│  │  • ... (30+ collections)                                 │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### Complete Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CLIENT REQUEST                                                │
│    GET https://clinic1.example.com/api/patients                  │
│    Headers: {                                                    │
│      Host: "clinic1.example.com"                                 │
│      Cookie: "session=..."                                       │
│    }                                                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. MIDDLEWARE (proxy.ts)                                         │
│    ┌─────────────────────────────────────────────────────┐     │
│    │ a. Extract Host Header                               │     │
│    │    host = "clinic1.example.com"                      │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ b. Parse Subdomain                                   │     │
│    │    subdomain = extractSubdomain(host)                │     │
│    │    Result: "clinic1"                                 │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ c. Verify Tenant                                     │     │
│    │    tenant = await verifyTenant("clinic1")            │     │
│    │    Check: status === 'active'                        │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ d. Check Subscription                                │     │
│    │    isExpired = await requiresSubscriptionRedirect()  │     │
│    │    If expired → redirect to /subscription            │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ e. Set Context Headers                               │     │
│    │    headers.set('x-tenant-subdomain', 'clinic1')      │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ f. Continue to Route                                 │     │
│    │    NextResponse.next({ request: { headers } })       │     │
│    └────────────┬────────────────────────────────────────┘     │
└─────────────────┼───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. API ROUTE HANDLER (/api/patients/route.ts)                   │
│    ┌─────────────────────────────────────────────────────┐     │
│    │ a. Verify Session                                    │     │
│    │    session = await verifySession()                   │     │
│    │    If !session → return 401 Unauthorized             │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ b. Check Permissions                                 │     │
│    │    hasPermission = await requirePermission()         │     │
│    │    If !hasPermission → return 403 Forbidden          │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ c. Get Tenant Context                                │     │
│    │    tenantContext = await getTenantContext()          │     │
│    │    tenantId = session.tenantId || tenantContext.id   │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ d. Build Query with Tenant Filter                    │     │
│    │    query = {                                         │     │
│    │      tenantId: ObjectId(tenantId),                   │     │
│    │      active: true                                    │     │
│    │    }                                                 │     │
│    └────────────┬────────────────────────────────────────┘     │
│                 │                                                │
│    ┌────────────▼────────────────────────────────────────┐     │
│    │ e. Execute Database Query                            │     │
│    │    patients = await Patient.find(query)              │     │
│    └────────────┬────────────────────────────────────────┘     │
└─────────────────┼───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DATABASE QUERY                                                │
│    MongoDB Query: {                                              │
│      tenantId: ObjectId("507f1f77bcf86cd799439011"),             │
│      active: true                                                │
│    }                                                             │
│    ┌─────────────────────────────────────────────────────┐     │
│    │ Uses Index: { tenantId: 1, active: 1 }              │     │
│    │ Returns: Only documents for Tenant ID               │     │
│    └────────────┬────────────────────────────────────────┘     │
└─────────────────┼───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. RESPONSE                                                      │
│    {                                                             │
│      "success": true,                                            │
│      "data": [                                                   │
│        {                                                         │
│          "_id": "...",                                           │
│          "tenantId": "507f1f77bcf86cd799439011",                 │
│          "firstName": "John",                                    │
│          "lastName": "Doe",                                      │
│          ...                                                     │
│        }                                                         │
│      ]                                                           │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Isolation

### Multi-Tenant Data Storage Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    MongoDB Collection: patients                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 1 (Tenant A)                                   │    │
│  │ {                                                       │    │
│  │   _id: ObjectId("..."),                                 │    │
│  │   tenantId: ObjectId("tenant-a-id"),  ◄── Filter Key   │    │
│  │   firstName: "John",                                    │    │
│  │   lastName: "Doe",                                      │    │
│  │   email: "john@example.com"                             │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 2 (Tenant B)                                   │    │
│  │ {                                                       │    │
│  │   _id: ObjectId("..."),                                 │    │
│  │   tenantId: ObjectId("tenant-b-id"),  ◄── Filter Key   │    │
│  │   firstName: "Jane",                                    │    │
│  │   lastName: "Smith",                                    │    │
│  │   email: "jane@example.com"                             │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 3 (Tenant A)                                   │    │
│  │ {                                                       │    │
│  │   _id: ObjectId("..."),                                 │    │
│  │   tenantId: ObjectId("tenant-a-id"),  ◄── Filter Key   │    │
│  │   firstName: "Bob",                                     │    │
│  │   lastName: "Johnson",                                  │    │
│  │   email: "bob@example.com"                              │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 4 (Tenant C)                                   │    │
│  │ {                                                       │    │
│  │   _id: ObjectId("..."),                                 │    │
│  │   tenantId: ObjectId("tenant-c-id"),  ◄── Filter Key   │    │
│  │   firstName: "Alice",                                   │    │
│  │   lastName: "Williams",                                 │    │
│  │   email: "alice@example.com"                            │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                              │
                              │ Query from Tenant A:
                              │ { tenantId: "tenant-a-id" }
                              ▼

┌─────────────────────────────────────────────────────────────────┐
│                   Query Result (Isolated)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 1 (Tenant A)                                   │    │
│  │ { firstName: "John", lastName: "Doe" }                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Document 3 (Tenant A)                                   │    │
│  │ { firstName: "Bob", lastName: "Johnson" }               │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Note: Documents from Tenant B and C are NOT returned           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Index Structure for Performance

```
┌─────────────────────────────────────────────────────────────────┐
│                    Compound Index Structure                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Index: { tenantId: 1, lastName: 1, firstName: 1 }              │
│                                                                  │
│  ┌──────────────┬──────────────┬──────────────┐                │
│  │  tenant-a-id │  tenant-b-id │  tenant-c-id │                │
│  ├──────────────┼──────────────┼──────────────┤                │
│  │    Doe       │    Smith     │   Williams   │                │
│  │     └─John   │     └─Jane   │    └─Alice   │                │
│  │    Johnson   │              │              │                │
│  │     └─Bob    │              │              │                │
│  └──────────────┴──────────────┴──────────────┘                │
│                                                                  │
│  Benefits:                                                       │
│  ✓ Fast tenant isolation (first key is tenantId)                │
│  ✓ Efficient sorting within tenant                              │
│  ✓ No cross-tenant data scans                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tenant Onboarding Flow

### Complete Onboarding Process

```
┌─────────────────────────────────────────────────────────────────┐
│ USER                                                             │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ 1. Navigate to https://example.com/tenant-onboard
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ ONBOARDING FORM                                                  │
│  • Clinic Name                                                   │
│  • Subdomain                                                     │
│  • Admin Name, Email, Password                                   │
│  • Settings (timezone, currency)                                 │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ 2. Submit Form
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ VALIDATION                                                       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ • Subdomain format check                               │     │
│  │ • Subdomain availability check                         │     │
│  │ • Reserved subdomain check                             │     │
│  │ • Email uniqueness check                               │     │
│  │ • Password strength validation                         │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ ✓ All validations passed
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ TENANT CREATION                                                  │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 1. Create Tenant Record                                │     │
│  │    {                                                   │     │
│  │      name: "My Clinic",                                │     │
│  │      subdomain: "myclinic",                            │     │
│  │      status: "active",                                 │     │
│  │      subscription: {                                   │     │
│  │        plan: "trial",                                  │     │
│  │        status: "active",                               │     │
│  │        expiresAt: Date.now() + 7 days                  │     │
│  │      }                                                 │     │
│  │    }                                                   │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ ROLES & PERMISSIONS SETUP                                        │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 2. Create Default Roles                                │     │
│  │    • Admin (full access)                               │     │
│  │    • Doctor (clinical access)                          │     │
│  │    • Nurse (patient care)                              │     │
│  │    • Receptionist (front desk)                         │     │
│  │    • Accountant (billing)                              │     │
│  │    • Medical Representative (inventory)                │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│  ┌────▼──────────────────────────────────────────────────┐     │
│  │ 3. Assign Permissions to Each Role                     │     │
│  │    Example: Admin Role                                 │     │
│  │    • patients: [create, read, update, delete]          │     │
│  │    • users: [create, read, update, delete]             │     │
│  │    • settings: [read, update]                          │     │
│  │    ... (all resources)                                 │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN USER CREATION                                              │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 4. Create Admin Profile                                │     │
│  │    {                                                   │     │
│  │      tenantId: <tenant-id>,                            │     │
│  │      name: "Admin User",                               │     │
│  │      email: "admin@myclinic.com",                      │     │
│  │      status: "active"                                  │     │
│  │    }                                                   │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│  ┌────▼──────────────────────────────────────────────────┐     │
│  │ 5. Create User Account                                 │     │
│  │    {                                                   │     │
│  │      tenantId: <tenant-id>,                            │     │
│  │      name: "Admin User",                               │     │
│  │      email: "admin@myclinic.com",                      │     │
│  │      password: <hashed>,                               │     │
│  │      role: <admin-role-id>,                            │     │
│  │      adminProfile: <admin-profile-id>,                 │     │
│  │      status: "active"                                  │     │
│  │    }                                                   │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ SETTINGS INITIALIZATION                                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 6. Create Tenant Settings                              │     │
│  │    {                                                   │     │
│  │      tenantId: <tenant-id>,                            │     │
│  │      clinicName: "My Clinic",                          │     │
│  │      timezone: "America/New_York",                     │     │
│  │      currency: "USD",                                  │     │
│  │      dateFormat: "MM/DD/YYYY",                         │     │
│  │      ... (default settings)                            │     │
│  │    }                                                   │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ COMPLETION                                                       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ 7. Send Welcome Email (optional)                       │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│  ┌────▼──────────────────────────────────────────────────┐     │
│  │ 8. Redirect to Tenant URL                              │     │
│  │    https://myclinic.example.com/login                  │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
     ┌──────────┐
     │  SUCCESS │
     │  7-day   │
     │  Trial   │
     │  Active  │
     └──────────┘
```

---

## Authentication Flow

### Login Process with Tenant Context

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER ACCESSES LOGIN PAGE                                     │
│    URL: https://clinic1.example.com/login                       │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ 2. Enter credentials
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOGIN FORM                                                       │
│  Email: john@clinic1.com                                         │
│  Password: ********                                              │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ 3. Submit
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ AUTHENTICATION HANDLER                                           │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ a. Get Tenant Context                                  │     │
│  │    tenantContext = await getTenantContext()            │     │
│  │    tenantId = "507f1f77bcf86cd799439011"               │     │
│  │    subdomain = "clinic1"                               │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│  ┌────▼──────────────────────────────────────────────────┐     │
│  │ b. Find User (tenant-scoped)                           │     │
│  │    query = {                                           │     │
│  │      email: "john@clinic1.com",                        │     │
│  │      tenantId: ObjectId("507f1f77bcf86cd799439011")    │     │
│  │    }                                                   │     │
│  │    user = await User.findOne(query)                    │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│       │ ✓ User found
│       ▼                                                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ c. Verify Password                                     │     │
│  │    isValid = await bcrypt.compare(password, hash)      │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│       │ ✓ Password valid
│       ▼                                                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ d. Validate Tenant Matching                            │     │
│  │    userTenantId = user.tenantId.toString()             │     │
│  │    contextTenantId = tenantContext.tenantId            │     │
│  │                                                        │     │
│  │    if (userTenantId !== contextTenantId)               │     │
│  │      return Error("Access Denied")                     │     │
│  └────┬──────────────────────────────────────────────────┘     │
│       │                                                          │
│       │ ✓ Tenant matches
│       ▼                                                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ e. Create Session                                      │     │
│  │    session = {                                         │     │
│  │      userId: user._id,                                 │     │
│  │      email: user.email,                                │     │
│  │      role: user.role.name,                             │     │
│  │      roleId: user.role._id,                            │     │
│  │      tenantId: userTenantId,  ◄── Stored in session    │     │
│  │      expiresAt: Date.now() + 7 days                    │     │
│  │    }                                                   │     │
│  │    await createSession(session)                        │     │
│  └────┬──────────────────────────────────────────────────┘     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ SESSION CREATED                                                  │
│  Cookie: session=eyJhbGc...                                      │
│  • httpOnly: true                                                │
│  • secure: true (production)                                     │
│  • sameSite: 'lax'                                               │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ 6. Redirect to dashboard
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ AUTHENTICATED SESSION                                            │
│  User can now access all resources                               │
│  All requests include tenantId from session                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Subscription Management

### Subscription Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT CREATION                               │
│                                                                  │
│   Tenant Created with 7-Day Trial                                │
│   ┌────────────────────────────────┐                            │
│   │ subscription: {                │                            │
│   │   plan: "trial",               │                            │
│   │   status: "active",            │                            │
│   │   expiresAt: +7 days           │                            │
│   │ }                              │                            │
│   └────────────────┬───────────────┘                            │
└────────────────────┼────────────────────────────────────────────┘
                     │
                     │ Day 0-7: Trial Active
                     │ • Full system access
                     │ • All features enabled
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  TRIAL EXPIRATION CHECK                          │
│                                                                  │
│   ┌──────────────┐                                              │
│   │   Day 5:     │                                              │
│   │   Warning    │ ──► Email: "Trial expires in 2 days"         │
│   └──────────────┘                                              │
│                                                                  │
│   ┌──────────────┐                                              │
│   │   Day 7:     │                                              │
│   │   Expiring   │ ──► Email: "Trial expires today"             │
│   └──────────────┘                                              │
│                                                                  │
│   ┌──────────────┐                                              │
│   │   Day 8:     │                                              │
│   │   Expired    │ ──► Redirect to /subscription page           │
│   └──────┬───────┘                                              │
└──────────┼──────────────────────────────────────────────────────┘
           │
           ├───────────────┬──────────────────┐
           │               │                  │
           ▼               ▼                  ▼
  ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐
  │ Grace Period   │ │   Payment    │ │  Do Nothing     │
  │   (7 days)     │ │   Made       │ │                 │
  │                │ │              │ │                 │
  │ Read-only      │ │              │ │  Tenant         │
  │ Access         │ │              │ │  Suspended      │
  │ Allowed        │ │              │ │  (Day 15)       │
  └────────┬───────┘ └──────┬───────┘ └────────┬────────┘
           │                │                  │
           │                │                  │
           │                ▼                  │
           │      ┌──────────────────┐         │
           │      │ Subscription     │         │
           │      │ Activated        │         │
           │      │                  │         │
           │      │ subscription: {  │         │
           │      │   plan: "...",   │         │
           │      │   status:        │         │
           │      │     "active",    │         │
           │      │   expiresAt:     │         │
           │      │     +30 days     │         │
           │      │ }                │         │
           │      └────────┬─────────┘         │
           │               │                   │
           │               │                   │
           └───────────────┴───────────────────┘
                           │
                           │ Ongoing subscription
                           ▼
         ┌──────────────────────────────────────┐
         │    ACTIVE SUBSCRIPTION MONITORING     │
         │                                       │
         │  • Check expiry daily                 │
         │  • Send renewal reminders             │
         │  • Process payments                   │
         │  • Update subscription status         │
         └───────────────────────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         TENANT                                    │
│  • _id (ObjectId)                                                 │
│  • name (String)                                                  │
│  • subdomain (String, unique)                                     │
│  • status (active/inactive/suspended)                             │
│  • subscription { plan, status, expiresAt }                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Referenced by all tenant-scoped models
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│    USER     │  │   PATIENT   │  │  SETTINGS   │
│             │  │             │  │             │
│ • tenantId  │  │ • tenantId  │  │ • tenantId  │
│ • email     │  │ • firstName │  │ • clinicName│
│ • role ─────┼──│ • lastName  │  │ • timezone  │
│ • status    │  │ • email     │  │ • currency  │
└──────┬──────┘  └──────┬──────┘  └─────────────┘
       │                │
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│    ROLE     │  │ APPOINTMENT │
│             │  │             │
│ • tenantId  │  │ • tenantId  │
│ • name      │  │ • patient ──┼─────┐
│ • level     │  │ • doctor    │     │
└─────────────┘  │ • date      │     │
                 └──────┬──────┘     │
                        │            │
                        ▼            │
                 ┌─────────────┐    │
                 │    VISIT    │    │
                 │             │    │
                 │ • tenantId  │    │
                 │ • patient ──┼────┘
                 │ • provider  │
                 │ • diagnosis │
                 └──────┬──────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌───────────┐
│PRESCRIPTION  │ │ LAB RESULT │ │  INVOICE  │
│              │ │            │ │           │
│ • tenantId   │ │ • tenantId │ │• tenantId │
│ • visit      │ │ • visit    │ │• visit    │
│ • medicine   │ │ • patient  │ │• patient  │
└──────────────┘ └────────────┘ └───────────┘

All models include tenantId for isolation
All queries filter by tenantId
```

---

## Summary

These diagrams illustrate:

1. **System Architecture**: How tenants share infrastructure while maintaining isolation
2. **Request Flow**: Complete request lifecycle with tenant context
3. **Data Isolation**: How data is stored and filtered by tenant
4. **Onboarding**: Step-by-step tenant creation process
5. **Authentication**: Login flow with tenant validation
6. **Subscription**: Lifecycle from trial to active subscription
7. **Database Schema**: Relationships between tenant-scoped entities

All components work together to provide secure, scalable multi-tenancy.

---

**Document Version**: 1.0
**Last Updated**: January 2026
