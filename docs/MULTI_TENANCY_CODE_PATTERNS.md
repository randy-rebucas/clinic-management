# Multi-Tenancy Code Patterns Reference

**Project:** MyClinicsoftSoft  
**Purpose:** Common patterns and code examples for multi-tenant implementation  
**Last updated:** 2026-04-23

---

## Table of Contents

1. [API Route Patterns](#1-api-route-patterns)
2. [Database Query Patterns](#2-database-query-patterns)
3. [Server Component Patterns](#3-server-component-patterns)
4. [Error Handling Patterns](#4-error-handling-patterns)
5. [Testing Patterns](#5-testing-patterns)
6. [Migration Patterns](#6-migration-patterns)
7. [Performance Patterns](#7-performance-patterns)

---

## 1. API Route Patterns

### Pattern 1.1: Basic Tenant-Guarded GET

```typescript
// app/api/appointments/route.ts
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import Appointment from '@/models/Appointment';
import { Types } from 'mongoose';

export async function GET(req: Request) {
  try {
    // 1. Verify session
    const session = await verifySession();
    if (!session) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get tenant context
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return Response.json(
        { error: 'No tenant context' },
        { status: 400 }
      );
    }

    // 3. Check tenant is active (optional but recommended)
    if (tenantContext.subdomain && !tenantContext.tenant) {
      return Response.json(
        { error: 'Tenant not found or inactive' },
        { status: 404 }
      );
    }

    // 4. Query with tenant filter
    const appointments = await Appointment.find({
      tenantId: new Types.ObjectId(tenantId)
    })
      .select('_id title startTime endTime patientId')
      .sort({ startTime: -1 })
      .limit(100);

    return Response.json(appointments);
  } catch (error) {
    console.error('GET /api/appointments error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Pattern 1.2: POST with Role Authorization

```typescript
// app/api/appointments/route.ts
import { getTenantContext } from '@/lib/tenant';
import { verifySession } from '@/app/lib/dal';
import Permission from '@/models/Permission';
import Appointment from '@/models/Appointment';
import { Types } from 'mongoose';

export async function POST(req: Request) {
  try {
    // 1. Verify session + get payload
    const session = await verifySession();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { patientId, title, startTime, endTime } = await req.json();
    if (!patientId || !title || !startTime || !endTime) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 2. Get tenant context
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return Response.json({ error: 'No tenant' }, { status: 400 });
    }

    // 3. Check permission (role-based)
    const permission = await Permission.findOne({
      tenantId: new Types.ObjectId(tenantId),
      roleId: session.roleId,
      resource: 'appointments',
      action: 'create'
    });

    if (!permission?.allowed) {
      return Response.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    // 4. Validate patient belongs to this tenant
    const Patient = require('@/models/Patient').default;
    const patient = await Patient.findOne({
      _id: new Types.ObjectId(patientId),
      tenantIds: new Types.ObjectId(tenantId)  // ← Array membership!
    });

    if (!patient) {
      return Response.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // 5. Create appointment
    const appointment = await Appointment.create({
      patientId: new Types.ObjectId(patientId),
      tenantId: new Types.ObjectId(tenantId),
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: 'scheduled',
      createdBy: session.userId
    });

    // 6. Log action
    const AuditLog = require('@/models/AuditLog').default;
    await AuditLog.create({
      tenantId: new Types.ObjectId(tenantId),
      userId: session.userId,
      action: 'create',
      resource: 'appointments',
      resourceId: appointment._id,
      timestamp: new Date()
    });

    return Response.json(appointment, { status: 201 });
  } catch (error) {
    console.error('POST /api/appointments error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Pattern 1.3: PATCH with Ownership Verification

```typescript
// app/api/appointments/[id]/route.ts
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import Appointment from '@/models/Appointment';
import { Types } from 'mongoose';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return Response.json({ error: 'No tenant' }, { status: 400 });
    }

    const { title, notes } = await req.json();

    // ✅ Key: Verify document belongs to this tenant
    const appointment = await Appointment.findOne({
      _id: new Types.ObjectId(params.id),
      tenantId: new Types.ObjectId(tenantId)  // ← Ownership check!
    });

    if (!appointment) {
      return Response.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Update allowed fields only
    if (title) appointment.title = title;
    if (notes) appointment.notes = notes;
    appointment.updatedAt = new Date();

    await appointment.save();

    return Response.json(appointment);
  } catch (error) {
    console.error('PATCH /api/appointments/:id error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Pattern 1.4: DELETE with Audit Trail

```typescript
// app/api/appointments/[id]/route.ts
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return Response.json({ error: 'No tenant' }, { status: 400 });
    }

    // Verify permission
    const permission = await Permission.findOne({
      tenantId: new Types.ObjectId(tenantId),
      roleId: session.roleId,
      resource: 'appointments',
      action: 'delete'
    });

    if (!permission?.allowed) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ✅ Verify ownership AND delete atomically
    const appointment = await Appointment.findOneAndDelete({
      _id: new Types.ObjectId(params.id),
      tenantId: new Types.ObjectId(tenantId)  // ← Prevent cross-tenant deletion!
    });

    if (!appointment) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Log deletion
    await AuditLog.create({
      tenantId: new Types.ObjectId(tenantId),
      userId: session.userId,
      action: 'delete',
      resource: 'appointments',
      resourceId: appointment._id,
      timestamp: new Date()
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 2. Database Query Patterns

### Pattern 2.1: Single-Tenant Query (Most Common)

```typescript
// Models with tenantId (single ObjectId)
const appointment = await Appointment.findOne({
  _id: appointmentId,
  tenantId: new Types.ObjectId(tenantId)
});

const invoices = await Invoice.find({
  tenantId: new Types.ObjectId(tenantId),
  status: 'paid'
}).sort({ paidAt: -1 });

const prescription = await Prescription.updateOne(
  {
    _id: prescriptionId,
    tenantId: new Types.ObjectId(tenantId)  // ← Must include!
  },
  { status: 'filled' }
);
```

### Pattern 2.2: Multi-Tenant Patient Query

```typescript
// Patient uses tenantIds array (can belong to multiple clinics)

// Get patient for current clinic
const patient = await Patient.findOne({
  _id: patientId,
  tenantIds: new Types.ObjectId(tenantId)  // ← Array membership!
});

// Find patients visited by any clinic in the list
const patientIds = [clinicA_id, clinicB_id];
const patients = await Patient.find({
  tenantIds: { $in: patientIds.map(id => new Types.ObjectId(id)) }
});

// Count patients per clinic
const patientsByClinic = await Patient.aggregate([
  { $match: { tenantIds: { $in: patientIds.map(id => new Types.ObjectId(id)) } } },
  { $unwind: '$tenantIds' },
  { $group: { _id: '$tenantIds', count: { $sum: 1 } } },
  { $lookup: {
      from: 'tenants',
      localField: '_id',
      foreignField: '_id',
      as: 'tenant'
    }
  }
]);
```

### Pattern 2.3: Aggregation Pipeline

```typescript
// ✅ Always filter by tenant first!
const appointmentStats = await Appointment.aggregate([
  // 1. Filter by tenant FIRST
  { $match: { tenantId: new Types.ObjectId(tenantId) } },
  
  // 2. Then aggregate
  {
    $group: {
      _id: { status: '$status' },
      count: { $sum: 1 },
      avgDuration: { $avg: { $subtract: ['$endTime', '$startTime'] } }
    }
  },
  
  // 3. Sort
  { $sort: { count: -1 } }
]);
```

### Pattern 2.4: Populate with Tenant Filter

```typescript
// Prevent cross-tenant reference leaks
const appointment = await Appointment.findOne({
  _id: appointmentId,
  tenantId: new Types.ObjectId(tenantId)
}).populate({
  path: 'patientId',
  match: { tenantIds: new Types.ObjectId(tenantId) },  // ← Filter populate!
  select: 'name email phone'
});

// Multi-level populate
const visit = await Visit.findOne({
  _id: visitId,
  tenantId: new Types.ObjectId(tenantId)
}).populate({
  path: 'appointmentId',
  populate: {
    path: 'patientId',
    match: { tenantIds: new Types.ObjectId(tenantId) }
  }
});
```

### Pattern 2.5: Backward Compatibility (Null tenantId)

```typescript
// For documents that existed before multi-tenancy
const query = tenantId
  ? { tenantId: new Types.ObjectId(tenantId) }
  : {
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ]
    };

const docs = await MyModel.find(query);
```

### Pattern 2.6: Bulk Operations

```typescript
// Bulk update with tenant filter
const result = await Appointment.bulkWrite([
  {
    updateMany: {
      filter: {
        tenantId: new Types.ObjectId(tenantId),
        status: 'pending',
        startTime: { $lt: new Date() }
      },
      update: { $set: { status: 'missed' } }
    }
  },
  {
    deleteMany: {
      filter: {
        tenantId: new Types.ObjectId(tenantId),
        status: 'cancelled',
        deletedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }  // 30 days old
      }
    }
  }
]);
```

---

## 3. Server Component Patterns

### Pattern 3.1: Render Tenant Name in Layout

```typescript
// app/(app)/layout.tsx
import { getTenantContext } from '@/lib/tenant';
import { verifySession } from '@/app/lib/dal';

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  // Get tenant context
  const tenantContext = await getTenantContext();

  // Handle inactive tenant
  if (tenantContext.subdomain && !tenantContext.tenant) {
    return <TenantNotFound subdomain={tenantContext.subdomain} />;
  }

  return (
    <div>
      <header>
        <h1>{tenantContext.tenant?.displayName || 'Dashboard'}</h1>
      </header>
      {children}
    </div>
  );
}
```

### Pattern 3.2: Fetch Tenant Settings in Component

```typescript
// app/(app)/settings/page.tsx
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';

export default async function SettingsPage() {
  const settings = await getSettings();  // Auto-resolves by tenantId
  const tenantContext = await getTenantContext();

  return (
    <div>
      <h2>Settings for {tenantContext.tenant?.name}</h2>
      <dl>
        <dt>Timezone</dt>
        <dd>{settings.timezone}</dd>
        <dt>Currency</dt>
        <dd>{settings.currency}</dd>
      </dl>
    </div>
  );
}
```

### Pattern 3.3: Pass Tenant Context to Client Component

```typescript
// app/(app)/appointments/page.tsx (Server)
import { getTenantContext } from '@/lib/tenant';
import AppointmentsClient from '@/components/AppointmentsClient';

export default async function AppointmentsPage() {
  const tenantContext = await getTenantContext();
  const tenantId = tenantContext.tenantId;

  return (
    <AppointmentsClient
      tenantId={tenantId}
      tenantName={tenantContext.tenant?.name}
    />
  );
}
```

```typescript
// components/AppointmentsClient.tsx (Client)
'use client';
import { useEffect, useState } from 'react';

export default function AppointmentsClient({
  tenantId,
  tenantName
}: {
  tenantId: string | null;
  tenantName?: string;
}) {
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    if (!tenantId) return;

    fetch('/api/appointments')
      .then(res => res.json())
      .then(data => setAppointments(data));
  }, [tenantId]);

  return (
    <div>
      <h2>{tenantName}'s Appointments</h2>
      {/* Render appointments */}
    </div>
  );
}
```

---

## 4. Error Handling Patterns

### Pattern 4.1: Structured Error Responses

```typescript
export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (!session) {
      return Response.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Session expired or invalid',
          code: 401
        },
        { status: 401 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return Response.json(
        {
          error: 'NO_TENANT',
          message: 'Unable to determine tenant context',
          code: 400
        },
        { status: 400 }
      );
    }

    // ... proceed
  } catch (error) {
    console.error('Unhandled error:', error);
    return Response.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        code: 500
      },
      { status: 500 }
    );
  }
}
```

### Pattern 4.2: Tenant-Aware Error Context

```typescript
class TenantError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public tenantId?: string,
    public userId?: string
  ) {
    super(message);
  }
}

// Usage:
throw new TenantError(
  'Patient not found',
  404,
  tenantId,
  session.userId
);

// In middleware/error handler:
if (error instanceof TenantError) {
  console.log(`[Tenant: ${error.tenantId}] ${error.message}`);
  return Response.json(
    { error: error.message },
    { status: error.statusCode }
  );
}
```

---

## 5. Testing Patterns

### Pattern 5.1: Test Tenant Isolation

```typescript
// __tests__/tenant-isolation.test.ts
import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';

describe('Tenant Isolation', () => {
  const tenantA_id = new Types.ObjectId();
  const tenantB_id = new Types.ObjectId();

  beforeAll(async () => {
    await Appointment.create({
      _id: new Types.ObjectId(),
      tenantId: tenantA_id,
      patientId: new Types.ObjectId(),
      title: 'Clinic A Appointment',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000)
    });

    await Appointment.create({
      _id: new Types.ObjectId(),
      tenantId: tenantB_id,
      patientId: new Types.ObjectId(),
      title: 'Clinic B Appointment',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000)
    });
  });

  it('should not return cross-tenant data', async () => {
    // Clinic A queries
    const clinicAAppts = await Appointment.find({
      tenantId: tenantA_id
    });

    // Should only see Clinic A data
    expect(clinicAAppts).toHaveLength(1);
    expect(clinicAAppts[0].title).toBe('Clinic A Appointment');
    expect(clinicAAppts[0].tenantId).toEqual(tenantA_id);

    // Clinic B should NOT be in results
    const clinicBInClinicA = clinicAAppts.find(
      a => a.tenantId.equals(tenantB_id)
    );
    expect(clinicBInClinicA).toBeUndefined();
  });

  it('should fail if tenantId filter is missing', async () => {
    // ⚠️ This demonstrates the vulnerability
    const allAppts = await Appointment.find({});
    // Should have 2 (from both clinics) — shows the bug!
    expect(allAppts.length).toBeGreaterThan(1);
  });
});
```

### Pattern 5.2: Test API Route with Mocked Session

```typescript
// __tests__/api/appointments.test.ts
import { GET } from '@/app/api/appointments/route';

jest.mock('@/app/lib/dal', () => ({
  verifySession: jest.fn()
}));

jest.mock('@/lib/tenant', () => ({
  getTenantContext: jest.fn()
}));

import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';

describe('GET /api/appointments', () => {
  it('should return 401 if no session', async () => {
    (verifySession as jest.Mock).mockResolvedValue(null);

    const req = new Request('http://localhost/api/appointments');
    const response = await GET(req);

    expect(response.status).toBe(401);
  });

  it('should return appointments for the tenant', async () => {
    const tenantId = 'tenant-123';
    (verifySession as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      tenantId,
      roleId: 'role-1'
    });

    (getTenantContext as jest.Mock).mockResolvedValue({
      tenantId,
      tenant: { name: 'Clinic A' }
    });

    const req = new Request('http://localhost/api/appointments');
    const response = await GET(req);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Verify all returned appointments belong to this tenant
    data.forEach(appt => {
      expect(appt.tenantId).toBe(tenantId);
    });
  });
});
```

---

## 6. Migration Patterns

### Pattern 6.1: Add tenantId to Existing Model

```typescript
// scripts/migrate-add-tenantid.ts
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Tenant from '@/models/Tenant';
import { Types } from 'mongoose';

async function migrateAppointments() {
  await connectDB();

  // Get the default/first tenant
  const defaultTenant = await Tenant.findOne({
    subdomain: 'default'
  });

  if (!defaultTenant) {
    console.error('No default tenant found');
    return;
  }

  // Update all appointments without tenantId
  const result = await Appointment.updateMany(
    { tenantId: { $exists: false } },
    { $set: { tenantId: defaultTenant._id } }
  );

  console.log(`Migrated ${result.modifiedCount} appointments`);
}

migrateAppointments().catch(console.error);
```

### Pattern 6.2: Verify Migration Success

```typescript
// scripts/verify-migration.ts
async function verifyTenantIdPresence() {
  const models = [Appointment, Invoice, Visit, Prescription];

  for (const Model of models) {
    const count = await Model.countDocuments({ tenantId: { $exists: false } });
    if (count > 0) {
      console.warn(`⚠️ ${Model.modelName}: ${count} documents missing tenantId`);
    } else {
      console.log(`✓ ${Model.modelName}: All documents have tenantId`);
    }
  }
}
```

---

## 7. Performance Patterns

### Pattern 7.1: Efficient Pagination

```typescript
// Paginate with tenant filter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const skip = (page - 1) * limit;

  const tenantId = /* ... */;

  // Query + count (in parallel)
  const [appointments, total] = await Promise.all([
    Appointment.find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),  // ← Use lean() for read-only data
    Appointment.countDocuments({ tenantId: new Types.ObjectId(tenantId) })
  ]);

  return Response.json({
    data: appointments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}
```

### Pattern 7.2: Selective Field Fetching

```typescript
// Don't fetch unnecessary fields
// ❌ Slow:
const appointments = await Appointment.find({ tenantId });

// ✅ Fast:
const appointments = await Appointment.find({ tenantId })
  .select('_id title startTime endTime patientId')
  .lean();
```

### Pattern 7.3: Index Usage in Queries

```typescript
// Ensure indexes exist on schema:
appointmentSchema.index({ tenantId: 1 });
appointmentSchema.index({ tenantId: 1, status: 1 });
appointmentSchema.index({ tenantId: 1, startTime: -1 });

// Query uses index:
const upcoming = await Appointment.find({
  tenantId: new Types.ObjectId(tenantId),
  startTime: { $gte: new Date() }
})
  .sort({ startTime: 1 })
  .limit(10);
```

---

## References

- **Full Architecture:** [MULTI_TENANCY.md](./MULTI_TENANCY.md)
- **Quick Start:** [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md)
- **Security Deep Dive:** [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md)

---

*Last updated: 2026-04-23*
