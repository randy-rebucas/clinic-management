# Multi-Tenant Quick Reference Guide

## Quick Links

- 📘 [Full Architecture Documentation](./MULTI_TENANT_ARCHITECTURE.md)
- 🚀 [Getting Started](#getting-started)
- 💻 [Code Snippets](#common-code-patterns)
- 🔧 [Troubleshooting](#quick-troubleshooting)

---

## Getting Started

### 1. Create a New Tenant

#### Using CLI
```bash
npm run tenant:onboard
```

#### Using Web Interface
Navigate to: `https://yourapp.com/tenant-onboard`

#### Using API
```bash
curl -X POST https://yourapp.com/api/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Clinic",
    "subdomain": "myclinic",
    "admin": {
      "name": "Admin User",
      "email": "admin@myclinic.com",
      "password": "SecurePassword123!"
    }
  }'
```

### 2. Access Tenant Subdomain

**Development:**
```
http://myclinic.localhost:3000
```

**Production:**
```
https://myclinic.yourdomain.com
```

### 3. Environment Setup

```bash
# .env.local
ROOT_DOMAIN=yourdomain.com
MONGODB_URI=mongodb://localhost:27017/clinic-db
SESSION_SECRET=your-secret-key-here
```

---

## Common Code Patterns

### Get Tenant Context

```typescript
import { getTenantContext } from '@/lib/tenant';

// In API route or server component
const tenantContext = await getTenantContext();
const tenantId = tenantContext.tenantId;

if (!tenantId) {
  // Handle no tenant
  return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
}
```

### Create Tenant-Scoped Query

```typescript
import { Types } from 'mongoose';

const query: any = { status: 'active' };

if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
} else {
  query.$or = [
    { tenantId: { $exists: false } },
    { tenantId: null }
  ];
}

const results = await Model.find(query);
```

### API Route Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import Model from '@/models/Model';

export async function GET(request: NextRequest) {
  // 1. Verify authentication
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();
    
    // 2. Get tenant context
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    // 3. Build query with tenant filter
    const query: any = { tenantId: new Types.ObjectId(tenantId) };
    
    // 4. Execute query
    const results = await Model.find(query).sort({ createdAt: -1 });
    
    return NextResponse.json({ success: true, data: results });
    
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Create Document with Tenant

```typescript
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    const body = await request.json();
    
    // Ensure tenantId is set
    const document = await Model.create({
      ...body,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: session.userId
    });
    
    return NextResponse.json({ success: true, data: document });
    
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Populate with Tenant Filter

```typescript
const tenantId = tenantContext.tenantId;

const populateOptions: any = {
  path: 'patient',
  select: 'firstName lastName patientCode'
};

if (tenantId) {
  populateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
}

const visits = await Visit.find({ tenantId })
  .populate(populateOptions)
  .populate('provider', 'name email');
```

### Search with Tenant Filter

```typescript
const search = request.nextUrl.searchParams.get('search');
const tenantId = tenantContext.tenantId;

const query: any = {};

if (search) {
  const searchConditions = [
    { firstName: { $regex: search, $options: 'i' } },
    { lastName: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } }
  ];
  
  const tenantFilter: any = {};
  if (tenantId) {
    tenantFilter.tenantId = new Types.ObjectId(tenantId);
  } else {
    tenantFilter.$or = [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ];
  }
  
  query.$and = [
    tenantFilter,
    { $or: searchConditions }
  ];
} else {
  if (tenantId) {
    query.tenantId = new Types.ObjectId(tenantId);
  }
}

const patients = await Patient.find(query);
```

---

## Model Schema Template

### Add Tenant Support to Model

```typescript
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMyModel extends Document {
  tenantId?: Types.ObjectId;  // Add this
  // ... other fields
  createdAt: Date;
  updatedAt: Date;
}

const MyModelSchema = new Schema({
  // Tenant reference - ALWAYS add this
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true  // Critical for performance!
  },
  
  // ... other fields
  
}, { timestamps: true });

// Compound indexes with tenantId
MyModelSchema.index({ tenantId: 1, createdAt: -1 });
MyModelSchema.index({ tenantId: 1, status: 1 });
MyModelSchema.index({ tenantId: 1, email: 1 });

export default mongoose.models.MyModel || 
  mongoose.model<IMyModel>('MyModel', MyModelSchema);
```

---

## Quick Troubleshooting

### Issue: Subdomain Not Detected

**Check:**
1. `ROOT_DOMAIN` environment variable set?
2. Accessing with subdomain? (e.g., `clinic1.localhost:3000`)
3. Host header being passed correctly?

**Fix for local development:**
```bash
# Add to /etc/hosts (Mac/Linux) or C:\Windows\System32\drivers\etc\hosts (Windows)
127.0.0.1 clinic1.localhost
127.0.0.1 clinic2.localhost

# Then access at:
http://clinic1.localhost:3000
```

### Issue: Cross-Tenant Data Visible

**Check:**
1. Query includes `tenantId`?
2. Using `Types.ObjectId()` wrapper?
3. Populate includes tenant filter?

**Debug:**
```typescript
console.log('Query:', JSON.stringify(query, null, 2));
console.log('Session tenantId:', session?.tenantId);
console.log('Context tenantId:', tenantContext.tenantId);
```

### Issue: Tenant Not Found After Creation

**Check:**
1. Tenant status is 'active'?
2. Subdomain is lowercase?
3. Database connection working?

**Verify in MongoDB:**
```javascript
mongosh
use clinic-db
db.tenants.find({ subdomain: 'clinic1' })
```

### Issue: Duplicate Key Error

**Problem:** Unique index not scoped to tenant

**Fix:**
```typescript
// ❌ Wrong - Global unique
Schema.index({ email: 1 }, { unique: true });

// ✅ Correct - Tenant-scoped unique
Schema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
```

### Issue: Subscription Redirect Loop

**Check:**
1. Route in subscription allowlist?
2. Grace period working?

**Add route to allowlist:**
```typescript
const subscriptionRoutes = [
  '/subscription',
  '/subscription/success',
  '/subscription/cancel'
];
```

---

## Utility Functions Cheat Sheet

### From `lib/tenant.ts`

```typescript
// Get full tenant context
const context = await getTenantContext();
// Returns: { tenantId, subdomain, tenant }

// Get just tenant ID
const tenantId = await getTenantId();

// Verify tenant by subdomain
const tenant = await verifyTenant('clinic1');

// Extract subdomain from host
const subdomain = extractSubdomain('clinic1.example.com');
// Returns: 'clinic1'

// Get root domain
const rootDomain = getRootDomain();
// Returns: process.env.ROOT_DOMAIN or 'localhost'
```

### From `lib/tenant-query.ts`

```typescript
// Add tenant filter to query
const query = await addTenantFilter({ status: 'active' });

// Create tenant-scoped query
const query = createTenantQuery(tenantId, { status: 'active' });

// Ensure tenantId on data
const data = await ensureTenantId({ name: 'John' });
```

### From `lib/subscription.ts`

```typescript
// Check subscription status
const status = await checkSubscriptionStatus(tenantId);
// Returns: { isActive, isExpired, isTrial, expiresAt, plan, daysRemaining }

// Check if redirect needed
const needsRedirect = await requiresSubscriptionRedirect(tenantId);
```

---

## Testing Checklist

### ✅ Multi-Tenant Isolation Tests

- [ ] User from tenant A cannot see tenant B's data
- [ ] User cannot access data by changing subdomain in URL
- [ ] API queries are filtered by tenantId
- [ ] Populated relationships are tenant-scoped
- [ ] Search results are tenant-scoped
- [ ] Unique constraints are tenant-scoped (e.g., email uniqueness per tenant)

### ✅ Tenant Lifecycle Tests

- [ ] Tenant can be created via API
- [ ] Tenant can be created via CLI
- [ ] Tenant subdomain is unique
- [ ] Reserved subdomains are blocked
- [ ] Trial subscription is created automatically
- [ ] Tenant status can be changed (active/inactive/suspended)

### ✅ Subscription Tests

- [ ] Expired trial redirects to subscription page
- [ ] Active subscription allows access
- [ ] Grace period works correctly
- [ ] Subscription page is accessible when expired
- [ ] Payment updates subscription status

### ✅ Session Tests

- [ ] Session includes tenantId
- [ ] Login validates tenant context
- [ ] User can only login on their tenant's subdomain
- [ ] Session tenant matches context tenant

---

## Performance Tips

### 1. Always Use Indexes

```typescript
// Every tenant-scoped query should use an index
MyModelSchema.index({ tenantId: 1, createdAt: -1 });
MyModelSchema.index({ tenantId: 1, status: 1 });
```

### 2. Limit Query Results

```typescript
const patients = await Patient.find(query)
  .limit(100)  // Always limit
  .sort({ createdAt: -1 })
  .select('firstName lastName email');  // Only select needed fields
```

### 3. Use Lean Queries

```typescript
// When you don't need Mongoose documents
const tenants = await Tenant.find({ status: 'active' })
  .lean()  // Returns plain objects, faster
  .select('name subdomain');
```

### 4. Cache Tenant Context

```typescript
// Don't call getTenantContext() multiple times
const tenantContext = await getTenantContext();
const tenantId = tenantContext.tenantId;

// Use tenantId throughout the function
```

---

## Security Checklist

### ✅ Query Security

- [ ] Always wrap tenantId with `Types.ObjectId()`
- [ ] Never trust tenantId from request body
- [ ] Always get tenantId from session or context
- [ ] Validate tenant exists and is active

### ✅ Session Security

- [ ] Verify session before any operation
- [ ] Check session tenantId matches context tenantId
- [ ] Validate user belongs to tenant
- [ ] Use httpOnly, secure cookies

### ✅ Route Security

- [ ] Protected routes check authentication
- [ ] API routes verify permissions
- [ ] Subscription status checked in middleware
- [ ] Reserved subdomains blocked

### ✅ Data Security

- [ ] All queries filtered by tenantId
- [ ] Populate matches include tenant filter
- [ ] File uploads scoped to tenant
- [ ] Audit logs include tenantId

---

## CLI Commands

```bash
# Create a new tenant
npm run tenant:onboard

# Delete a tenant (with confirmation)
npm run tenant:delete

# Install system (includes tenant setup option)
npm run install

# Seed database
npm run seed

# Database migrations
npm run migrate
```

---

## Environment Variables

### Required

```bash
ROOT_DOMAIN=yourdomain.com
MONGODB_URI=mongodb://localhost:27017/clinic-db
SESSION_SECRET=your-secret-key-minimum-32-chars
```

### Optional

```bash
# For subscription management
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
PAYPAL_WEBHOOK_ID=your-webhook-id

# For email/SMS features
SENDGRID_API_KEY=your-sendgrid-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# For document storage
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

---

## Useful MongoDB Queries

```javascript
// Find all tenants
db.tenants.find({})

// Find active tenants
db.tenants.find({ status: 'active' })

// Find tenant by subdomain
db.tenants.findOne({ subdomain: 'clinic1' })

// Count documents per tenant
db.patients.aggregate([
  { $group: { _id: '$tenantId', count: { $sum: 1 } } }
])

// Find documents without tenantId
db.patients.find({ tenantId: { $exists: false } })

// Update tenant status
db.tenants.updateOne(
  { subdomain: 'clinic1' },
  { $set: { status: 'active' } }
)

// Extend subscription
db.tenants.updateOne(
  { subdomain: 'clinic1' },
  { $set: { 
    'subscription.status': 'active',
    'subscription.expiresAt': new Date('2025-12-31')
  }}
)
```

---

## API Endpoints Reference

### Tenant Management

```bash
# Onboard new tenant
POST /api/tenants/onboard

# Get tenant info (from context)
GET /api/tenants/current
```

### Subscription

```bash
# Get subscription status
GET /api/subscription/status

# Create payment order
POST /api/subscription/create-order

# Capture payment
POST /api/subscription/capture-order

# Webhook handler
POST /api/subscription/webhook
```

### Authentication

```bash
# Login (tenant-scoped)
POST /api/auth/login

# Logout
POST /api/auth/logout

# Check if admin
GET /api/user/is-admin
```

---

## File Structure

```
├── app/
│   ├── api/
│   │   ├── tenants/
│   │   │   └── onboard/route.ts       # Tenant onboarding endpoint
│   │   ├── subscription/
│   │   │   ├── status/route.ts        # Subscription status
│   │   │   ├── create-order/route.ts  # Payment creation
│   │   │   └── capture-order/route.ts # Payment capture
│   ├── (app)/                          # Tenant-scoped pages
│   └── (public)/                       # Public pages
├── lib/
│   ├── tenant.ts                       # Tenant context utilities
│   ├── tenant-query.ts                 # Query helper functions
│   ├── subscription.ts                 # Subscription management
│   └── subscription-grace-period.ts    # Grace period logic
├── models/
│   ├── Tenant.ts                       # Tenant model
│   └── *.ts                            # All tenant-scoped models
├── scripts/
│   ├── onboard-tenant.ts               # CLI onboarding script
│   └── delete-tenant.ts                # CLI deletion script
├── proxy.ts                            # Tenant routing middleware
└── docs/
    ├── MULTI_TENANT_ARCHITECTURE.md    # Full documentation
    └── MULTI_TENANT_QUICK_REFERENCE.md # This file
```

---

## Additional Resources

- **Main Documentation**: [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)
- **GitHub Issues**: Report bugs and request features
- **MongoDB Docs**: [Multi-Tenancy Patterns](https://www.mongodb.com/docs/manual/tutorial/model-tenant-data/)
- **Next.js Middleware**: [Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)

---

**Quick Reference Version**: 1.0
**Last Updated**: January 2026
