import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { sanitizeSearch } from '@/lib/utils';
import {
  listServices,
  createService,
  getLastServiceByCodePrefix,
} from '@/lib/data/service';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';
    const search = searchParams.get('search');

    const opts = {
      category: category || undefined,
      active,
      search: search ? sanitizeSearch(search) : undefined,
      take: 200,
    };

    const services = tenantId
      ? await runWithTenant(tenantId, () => listServices(opts))
      : await runAsSystem(() => listServices(opts));

    return NextResponse.json({ success: true, data: services });
  } catch (error: any) {
    console.error('Error fetching services:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can add services
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const run = <T,>(fn: () => T | Promise<T>) =>
      tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);

    const service = await run(async () => {
      // Auto-generate code if not provided (tenant-scoped)
      if (!body.code) {
        const categoryPrefix = body.category?.toUpperCase().substring(0, 4) || 'SERV';
        const lastService = await getLastServiceByCodePrefix(categoryPrefix);

        let nextNumber = 1;
        if (lastService?.code) {
          const match = lastService.code.match(/(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
          }
        }

        body.code = `${categoryPrefix}-${String(nextNumber).padStart(3, '0')}`;
      }

      return createService(body);
    });

    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Service with this code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create service' },
      { status: 500 }
    );
  }
}
