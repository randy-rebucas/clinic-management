import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getMedicineById, updateMedicine, deleteMedicine } from '@/lib/data/medicine';

async function resolveTenantId(session: { tenantId?: string | null }) {
  const tenantContext = await getTenantContext();
  return session.tenantId || tenantContext.tenantId;
}

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const tenantId = await resolveTenantId(session);

    const medicine = await run(tenantId, () => getMedicineById(id));

    if (!medicine) {
      return NextResponse.json(
        { success: false, error: 'Medicine not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: medicine });
  } catch (error: any) {
    console.error('Error fetching medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicine' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const tenantId = await resolveTenantId(session);

    let medicine;
    try {
      medicine = await run(tenantId, () => updateMedicine(id, body));
    } catch (error: any) {
      if (error.code === 'P2025') {
        medicine = null;
      } else {
        throw error;
      }
    }

    if (!medicine) {
      return NextResponse.json(
        { success: false, error: 'Medicine not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update medicine' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const tenantId = await resolveTenantId(session);

    let medicine;
    try {
      medicine = await run(tenantId, () => deleteMedicine(id));
    } catch (error: any) {
      if (error.code === 'P2025') {
        medicine = null;
      } else {
        throw error;
      }
    }

    if (!medicine) {
      return NextResponse.json(
        { success: false, error: 'Medicine not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete medicine' },
      { status: 500 }
    );
  }
}
