# Multi-Tenant Implementation Checklist

Use this checklist when adding multi-tenant support to new features, models, or API endpoints.

---

## Table of Contents

1. [Adding a New Tenant-Scoped Model](#adding-a-new-tenant-scoped-model)
2. [Creating a New API Endpoint](#creating-a-new-api-endpoint)
3. [Adding a New Page/Route](#adding-a-new-pageroute)
4. [Testing Checklist](#testing-checklist)
5. [Code Review Checklist](#code-review-checklist)
6. [Deployment Checklist](#deployment-checklist)

---

## Adding a New Tenant-Scoped Model

### Step 1: Define Model Interface

```typescript
// models/MyModel.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMyModel extends Document {
  // ✅ REQUIRED: Add tenantId field
  tenantId?: Types.ObjectId;
  
  // Your model fields
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

**Checklist:**
- [ ] Interface includes `tenantId?: Types.ObjectId`
- [ ] Interface extends `Document`
- [ ] All required fields are marked as such
- [ ] Includes timestamps if needed

---

### Step 2: Create Model Schema

```typescript
const MyModelSchema = new Schema<IMyModel>(
  {
    // ✅ REQUIRED: Add tenantId field with index
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,  // Critical for performance!
    },
    
    // Your fields
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);
```

**Checklist:**
- [ ] `tenantId` field added to schema
- [ ] `tenantId` is type `Schema.Types.ObjectId`
- [ ] `tenantId` references `'Tenant'`
- [ ] `tenantId` has `index: true`
- [ ] Timestamps enabled with `{ timestamps: true }`

---

### Step 3: Add Compound Indexes

```typescript
// ✅ REQUIRED: Add compound indexes with tenantId
MyModelSchema.index({ tenantId: 1, name: 1 });
MyModelSchema.index({ tenantId: 1, status: 1 });
MyModelSchema.index({ tenantId: 1, createdAt: -1 });

// For unique fields, make them tenant-scoped
MyModelSchema.index(
  { tenantId: 1, email: 1 }, 
  { unique: true, sparse: true }
);
```

**Checklist:**
- [ ] At least 3 compound indexes with tenantId
- [ ] Indexes cover common query patterns
- [ ] Unique constraints are tenant-scoped
- [ ] Indexes use `{ sparse: true }` when tenantId is optional

**Common Index Patterns:**
- [ ] `{ tenantId: 1, createdAt: -1 }` - for sorting by date
- [ ] `{ tenantId: 1, status: 1 }` - for filtering by status
- [ ] `{ tenantId: 1, name: 1 }` - for name lookups/sorting

---

### Step 4: Export Model

```typescript
export default mongoose.models.MyModel || 
  mongoose.model<IMyModel>('MyModel', MyModelSchema);
```

**Checklist:**
- [ ] Uses `mongoose.models.MyModel` pattern (prevents re-compilation)
- [ ] Model name matches collection name convention
- [ ] Type parameter includes interface

---

### Step 5: Update Model Index

```typescript
// models/index.ts

// Add to appropriate section based on dependencies
export { default as MyModel } from './MyModel';
```

**Checklist:**
- [ ] Model exported from `models/index.ts`
- [ ] Placed in correct order based on dependencies
- [ ] JSDoc comment added if needed

---

### Step 6: Add to Tenant Deletion Script

```typescript
// scripts/delete-tenant.ts

const TENANT_SCOPED_COLLECTIONS = [
  // ... existing collections
  
  // Add your model
  { model: MyModel, name: 'mymodels' },
];
```

**Checklist:**
- [ ] Model added to deletion script
- [ ] Placed in correct order (dependent records first)
- [ ] Collection name matches MongoDB collection name

---

## Creating a New API Endpoint

### Step 1: Create Route File

```typescript
// app/api/my-resource/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MyModel from '@/models/MyModel';
```

**Checklist:**
- [ ] All required imports included
- [ ] `getTenantContext` imported
- [ ] Model imported
- [ ] Auth helpers imported

---

### Step 2: Implement GET Handler

```typescript
export async function GET(request: NextRequest) {
  // ✅ STEP 1: Verify authentication
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  // ✅ STEP 2: Check permissions (if applicable)
  const permissionCheck = await requirePermission(
    session, 
    'my-resource', 
    'read'
  );
  
  if (permissionCheck) {
    return permissionCheck;
  }
  
  try {
    await connectDB();
    
    // ✅ STEP 3: Get tenant context
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }
    
    // ✅ STEP 4: Build tenant-scoped query
    const query: any = {
      tenantId: new Types.ObjectId(tenantId)
    };
    
    // Add additional filters from query params
    const searchParams = request.nextUrl.searchParams;
    if (searchParams.get('status')) {
      query.status = searchParams.get('status');
    }
    
    // ✅ STEP 5: Execute query
    const results = await MyModel.find(query)
      .sort({ createdAt: -1 })
      .limit(100);
    
    return NextResponse.json({
      success: true,
      data: results
    });
    
  } catch (error: any) {
    console.error('Error fetching resources:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Checklist:**
- [ ] Session verification implemented
- [ ] Permission check implemented (if needed)
- [ ] Tenant context retrieved
- [ ] Tenant ID validation included
- [ ] Query uses `Types.ObjectId()` wrapper
- [ ] Query includes `tenantId` filter
- [ ] Error handling implemented
- [ ] Results limited (pagination)
- [ ] Response format consistent

---

### Step 3: Implement POST Handler

```typescript
export async function POST(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  const permissionCheck = await requirePermission(
    session, 
    'my-resource', 
    'create'
  );
  
  if (permissionCheck) {
    return permissionCheck;
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
    
    // ✅ REQUIRED: Ensure tenantId is set
    const data = {
      ...body,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: session.userId  // Optional: track creator
    };
    
    // Validate data (if needed)
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }
    
    const document = await MyModel.create(data);
    
    // Optional: Create audit log
    await createAuditLog({
      action: 'create',
      resource: 'my-resource',
      resourceId: document._id.toString(),
      userId: session.userId,
      tenantId,
      details: { name: document.name }
    });
    
    return NextResponse.json({
      success: true,
      data: document
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Checklist:**
- [ ] Session and permission checks
- [ ] Tenant context retrieved
- [ ] `tenantId` set on new document
- [ ] Data validation implemented
- [ ] Error handling implemented
- [ ] Audit log created (if applicable)
- [ ] Returns 201 status on success

---

### Step 4: Implement PUT/PATCH Handler

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  const permissionCheck = await requirePermission(
    session, 
    'my-resource', 
    'update'
  );
  
  if (permissionCheck) {
    return permissionCheck;
  }
  
  try {
    await connectDB();
    
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }
    
    // ✅ REQUIRED: Query with tenantId to prevent cross-tenant access
    const document = await MyModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId)
    });
    
    if (!document) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    
    // Update fields (excluding tenantId!)
    const allowedFields = ['name', 'description', 'status'];
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        document[field] = body[field];
      }
    });
    
    await document.save();
    
    return NextResponse.json({
      success: true,
      data: document
    });
    
  } catch (error: any) {
    console.error('Error updating resource:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Checklist:**
- [ ] Query includes `tenantId` filter
- [ ] Document existence check
- [ ] `tenantId` is NOT updated from request body
- [ ] Only allowed fields are updated
- [ ] Error handling implemented

---

### Step 5: Implement DELETE Handler

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }
  
  const permissionCheck = await requirePermission(
    session, 
    'my-resource', 
    'delete'
  );
  
  if (permissionCheck) {
    return permissionCheck;
  }
  
  try {
    await connectDB();
    
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }
    
    // ✅ REQUIRED: Delete with tenantId filter
    const result = await MyModel.deleteOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId)
    });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Resource deleted successfully'
    });
    
  } catch (error: any) {
    console.error('Error deleting resource:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Checklist:**
- [ ] Delete query includes `tenantId` filter
- [ ] Checks if document was actually deleted
- [ ] Error handling implemented
- [ ] Returns appropriate status code

---

### Step 6: Handle Relationships with Populate

```typescript
// When populating relationships
const populateOptions: any = {
  path: 'relatedModel',
  select: 'name description'
};

// ✅ REQUIRED: Add tenant filter to populate
if (tenantId) {
  populateOptions.match = { 
    tenantId: new Types.ObjectId(tenantId) 
  };
}

const results = await MyModel.find(query)
  .populate(populateOptions);
```

**Checklist:**
- [ ] Populate includes `match` with `tenantId`
- [ ] All populated paths are tenant-filtered
- [ ] Select only needed fields

---

## Adding a New Page/Route

### Step 1: Server Component with Auth

```typescript
// app/(app)/my-resource/page.tsx
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import MyResourcePageClient from '@/components/MyResourcePageClient';

export default async function MyResourcePage() {
  // ✅ STEP 1: Verify authentication
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }
  
  // ✅ STEP 2: Get tenant context
  const tenantContext = await getTenantContext();
  
  if (!tenantContext.tenant) {
    redirect('/tenant-not-found');
  }
  
  // ✅ STEP 3: Pass tenant info to client component
  return (
    <MyResourcePageClient 
      tenantId={tenantContext.tenantId}
      tenant={tenantContext.tenant}
    />
  );
}
```

**Checklist:**
- [ ] Session verification implemented
- [ ] Redirects to `/login` if not authenticated
- [ ] Tenant context retrieved
- [ ] Redirects to `/tenant-not-found` if no tenant
- [ ] Tenant info passed to client component

---

### Step 2: Client Component

```typescript
// components/MyResourcePageClient.tsx
'use client';

import { useEffect, useState } from 'react';

interface Props {
  tenantId: string | null;
  tenant: any;
}

export default function MyResourcePageClient({ tenantId, tenant }: Props) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/my-resource');
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);
  
  // Render component...
}
```

**Checklist:**
- [ ] Component marked with `'use client'`
- [ ] Tenant props typed correctly
- [ ] API calls use relative paths
- [ ] Loading states handled
- [ ] Error states handled

---

## Testing Checklist

### Unit Tests

```typescript
// __tests__/api/my-resource.test.ts

describe('GET /api/my-resource', () => {
  it('requires authentication', async () => {
    const response = await fetch('/api/my-resource');
    expect(response.status).toBe(401);
  });
  
  it('returns only tenant-scoped data', async () => {
    const tenantA = await createTestTenant('tenant-a');
    const tenantB = await createTestTenant('tenant-b');
    
    await createTestData({ tenantId: tenantA._id, name: 'A' });
    await createTestData({ tenantId: tenantB._id, name: 'B' });
    
    const sessionA = await loginAsTenant(tenantA);
    const response = await fetch('/api/my-resource', {
      headers: { Cookie: `session=${sessionA}` }
    });
    
    const data = await response.json();
    
    // Should only see tenant A data
    expect(data.data).toHaveLength(1);
    expect(data.data[0].name).toBe('A');
  });
  
  it('prevents cross-tenant access', async () => {
    const tenantA = await createTestTenant('tenant-a');
    const tenantB = await createTestTenant('tenant-b');
    
    const docB = await createTestData({ 
      tenantId: tenantB._id, 
      name: 'B' 
    });
    
    const sessionA = await loginAsTenant(tenantA);
    
    // Try to access tenant B's data with tenant A session
    const response = await fetch(`/api/my-resource/${docB._id}`, {
      headers: { Cookie: `session=${sessionA}` }
    });
    
    expect(response.status).toBe(404);
  });
});
```

**Test Checklist:**
- [ ] Authentication tests
- [ ] Tenant isolation tests
- [ ] Cross-tenant access prevention tests
- [ ] CRUD operation tests
- [ ] Permission tests
- [ ] Error handling tests

---

### Manual Testing

**Checklist:**
- [ ] Create data in tenant A
- [ ] Login to tenant B
- [ ] Verify tenant B cannot see tenant A data
- [ ] Try to access tenant A data via direct URL
- [ ] Verify proper error messages
- [ ] Test with expired subscription
- [ ] Test with suspended tenant

---

## Code Review Checklist

### Model Review

- [ ] `tenantId` field included in interface
- [ ] `tenantId` field in schema with index
- [ ] Compound indexes with `tenantId`
- [ ] Unique constraints are tenant-scoped
- [ ] Model exported correctly
- [ ] Added to deletion script

### API Review

- [ ] Session verification present
- [ ] Permission checks implemented
- [ ] Tenant context retrieved
- [ ] All queries filter by `tenantId`
- [ ] `Types.ObjectId()` wrapper used
- [ ] Create operations set `tenantId`
- [ ] Update operations don't modify `tenantId`
- [ ] Delete operations filter by `tenantId`
- [ ] Populate includes tenant filter
- [ ] Error handling comprehensive
- [ ] Audit logging implemented (if applicable)

### Frontend Review

- [ ] Server components verify auth
- [ ] Tenant context passed to client
- [ ] API calls don't expose `tenantId` in URL
- [ ] Error states handled
- [ ] Loading states handled

### Security Review

- [ ] No `tenantId` in request body is trusted
- [ ] All queries use `Types.ObjectId()`
- [ ] Session `tenantId` matches context
- [ ] No hardcoded tenant IDs
- [ ] No tenant bypass routes
- [ ] Proper error messages (no data leakage)

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests pass
- [ ] Code reviewed and approved
- [ ] Database indexes created
- [ ] Migration scripts ready (if needed)
- [ ] Environment variables configured
- [ ] Backup created

### Deployment

- [ ] Run migrations (if any)
- [ ] Deploy application
- [ ] Verify indexes created
- [ ] Test on staging environment
- [ ] Monitor error logs

### Post-Deployment

- [ ] Verify existing tenants not affected
- [ ] Create test tenant and verify functionality
- [ ] Monitor performance metrics
- [ ] Check error rates
- [ ] Verify subscription checks working

---

## Common Mistakes to Avoid

### ❌ DON'T: Trust tenantId from Request Body

```typescript
// ❌ BAD
const body = await request.json();
const document = await MyModel.create(body);  // body.tenantId could be manipulated!
```

```typescript
// ✅ GOOD
const body = await request.json();
const tenantId = await getTenantId();
const document = await MyModel.create({
  ...body,
  tenantId: new Types.ObjectId(tenantId)
});
```

---

### ❌ DON'T: Forget Types.ObjectId() Wrapper

```typescript
// ❌ BAD
const query = { tenantId: tenantId };  // Could be string, vulnerable to injection
```

```typescript
// ✅ GOOD
const query = { tenantId: new Types.ObjectId(tenantId) };
```

---

### ❌ DON'T: Use Global Unique Indexes

```typescript
// ❌ BAD - Email unique across all tenants
Schema.index({ email: 1 }, { unique: true });
```

```typescript
// ✅ GOOD - Email unique per tenant
Schema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
```

---

### ❌ DON'T: Forget Populate Filters

```typescript
// ❌ BAD - Could populate cross-tenant data
const visits = await Visit.find({ tenantId })
  .populate('patient');
```

```typescript
// ✅ GOOD - Populate with tenant filter
const visits = await Visit.find({ tenantId })
  .populate({
    path: 'patient',
    match: { tenantId: new Types.ObjectId(tenantId) }
  });
```

---

### ❌ DON'T: Allow tenantId Updates

```typescript
// ❌ BAD - Allows moving documents between tenants
const body = await request.json();
document.tenantId = body.tenantId;  // Security vulnerability!
await document.save();
```

```typescript
// ✅ GOOD - Exclude tenantId from updates
const allowedFields = ['name', 'description', 'status'];
allowedFields.forEach(field => {
  if (body[field] !== undefined) {
    document[field] = body[field];
  }
});
await document.save();
```

---

### ❌ DON'T: Skip Tenant Context Validation

```typescript
// ❌ BAD - Assumes tenantId exists
const tenantId = (await getTenantContext()).tenantId;
const results = await MyModel.find({ tenantId });  // tenantId could be null!
```

```typescript
// ✅ GOOD - Validate tenant context
const tenantContext = await getTenantContext();
const tenantId = tenantContext.tenantId;

if (!tenantId) {
  return NextResponse.json(
    { error: 'Tenant not found' },
    { status: 404 }
  );
}

const results = await MyModel.find({ 
  tenantId: new Types.ObjectId(tenantId) 
});
```

---

## Quick Reference Commands

```bash
# Run tests
npm test

# Run specific test file
npm test -- my-resource.test.ts

# Check linting
npm run lint

# Format code
npm run format

# Create new tenant (for testing)
npm run tenant:onboard

# Delete tenant (cleanup)
npm run tenant:delete

# Check database indexes
mongosh
use clinic-db
db.mymodels.getIndexes()
```

---

## Additional Resources

- [Full Architecture Documentation](./MULTI_TENANT_ARCHITECTURE.md)
- [Quick Reference Guide](./MULTI_TENANT_QUICK_REFERENCE.md)
- [Architecture Diagrams](./MULTI_TENANT_DIAGRAMS.md)

---

**Checklist Version**: 1.0
**Last Updated**: January 2026
