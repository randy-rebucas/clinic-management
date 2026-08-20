import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { sanitizeSearch } from '@/lib/utils';
import { listMedicines, createMedicine } from '@/lib/data/medicine';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';

    const opts = {
      category: category || undefined,
      active,
      search: search ? sanitizeSearch(search) : undefined,
      take: 100,
    };

    const medicines = tenantId
      ? await runWithTenant(tenantId, () => listMedicines(opts))
      : await runAsSystem(() => listMedicines(opts));

    return NextResponse.json({ success: true, data: medicines });
  } catch (error: any) {
    console.error('Error fetching medicines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicines' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can add medicines
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const medicine = tenantId
      ? await runWithTenant(tenantId, () => createMedicine(body))
      : await runAsSystem(() => createMedicine(body));

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create medicine' },
      { status: 500 }
    );
  }
}
