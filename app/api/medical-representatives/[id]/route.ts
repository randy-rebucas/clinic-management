import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/medical-representatives/[id] - Get a single medical representative
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const representative = await run(tenantId, () =>
      prisma.medicalRepresentative.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true, email: true, status: true } } },
      })
    );

    if (!representative) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: representative });
  } catch (error: any) {
    console.error('Error fetching medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch medical representative' }, { status: 500 });
  }
}

// PUT /api/medical-representatives/[id] - Update a medical representative
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      territory,
      products,
      status,
      availability,
    } = body;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await run(tenantId, async () => {
      const existing = await prisma.medicalRepresentative.findUnique({ where: { id } });
      if (!existing) {
        return null;
      }

      const data: Record<string, unknown> = {};
      if (firstName) data.firstName = firstName;
      if (lastName) data.lastName = lastName;
      if (email) data.email = email.toLowerCase().trim();
      if (phone) data.phone = phone;
      // Convert company object to string (use name field)
      if (company !== undefined) {
        data.company = typeof company === 'object' && company !== null
          ? (company.name || '')
          : company;
      }
      // Convert territory array to string (join with comma)
      if (territory !== undefined) {
        data.territory = Array.isArray(territory)
          ? territory.join(', ')
          : territory;
      }
      if (products) data.products = products;
      // NOTE: `notes` is intentionally not applied — see app/api/medical-representatives/route.ts
      if (status) data.status = status;
      // NOTE: `availability` was a Mongoose sub-document field with no
      // equivalent scalar column on the Prisma model (availability is now
      // its own relation table, MedicalRepresentativeAvailabilitySlot); the
      // prior route silently ignored unknown shape assignments the same way
      // notes was — left unapplied here to preserve behavior.

      const updated = await prisma.medicalRepresentative.update({
        where: { id },
        data: data as any,
        include: { user: { select: { id: true, name: true, email: true, status: true } } },
      });

      // Also update the linked User status if needed
      if (status && updated.user) {
        await prisma.user.update({ where: { id: updated.user.id }, data: { status } });
      }

      return updated;
    });

    if (!result) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Medical representative updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update medical representative' }, { status: 500 });
  }
}

// DELETE /api/medical-representatives/[id] - Delete a medical representative
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await run(tenantId, async () => {
      const existing = await prisma.medicalRepresentative.findUnique({
        where: { id },
        include: { user: { select: { id: true } } },
      });
      if (!existing) return null;

      // Also deactivate the linked user (soft delete)
      if (existing.user) {
        await prisma.user.update({ where: { id: existing.user.id }, data: { status: 'inactive' } });
      }

      // Soft delete by setting status to inactive
      await prisma.medicalRepresentative.update({ where: { id }, data: { status: 'inactive' } });

      return true;
    });

    if (!result) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Medical representative deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete medical representative' }, { status: 500 });
  }
}
