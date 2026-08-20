import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { buildInventoryWhere, createInventoryItem, listInventoryItems } from '@/lib/data/inventory';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Inventory access - admin only for now (can be extended with inventory permission)
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required for inventory');
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const lowStock = searchParams.get('lowStock') === 'true';

    const where = buildInventoryWhere({
      category: category || undefined,
      status: lowStock ? ['low-stock', 'out-of-stock'] : status || undefined,
    });

    const items = await run(tenantId, () => listInventoryItems(where));

    return NextResponse.json({ success: true, data: items || [] });
  } catch (error: any) {
    console.error('Error fetching inventory:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    const errorMessage = error?.message || 'Failed to fetch inventory';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can add inventory items
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required for inventory management');
  }

  try {
    const body = await request.json();

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const item = await run(tenantId, async () => {
      // Validate that the medicine belongs to the tenant
      if (body.medicineId && tenantId) {
        const medicine = await prisma.medicine.findUnique({ where: { id: body.medicineId } });
        if (!medicine) {
          throw Object.assign(new Error('Invalid medicine selected. Please select a medicine from this clinic.'), { status: 400 });
        }
      }

      return createInventoryItem(body);
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating inventory item:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    if (error?.status === 400) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}
