import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { findDoctorRawById, listDoctorProfessionalFees, addDoctorProfessionalFee } from '@/lib/data/doctor';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) return permissionCheck;
  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { id } = await params;

    const result = await run(tenantId, async () => {
      const doctor = await findDoctorRawById(id);
      if (!doctor) return { notFound: true as const };
      const fees = await listDoctorProfessionalFees(id);
      return { fees };
    });

    if ('notFound' in result) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.fees });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch fees' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) return permissionCheck;
  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { id } = await params;
    const body = await request.json();

    const result = await run(tenantId, async () => {
      const doctor = await findDoctorRawById(id);
      if (!doctor) return { notFound: true as const };

      try {
        await addDoctorProfessionalFee(id, {
          invoiceId: body.invoiceId,
          amount: body.amount,
          type: body.type,
          notes: body.notes,
        });
      } catch (err: any) {
        if (err.code === 'P2025') {
          return { notFound: true as const };
        }
        throw err;
      }

      const fees = await listDoctorProfessionalFees(id);
      return { fees };
    });

    if ('notFound' in result) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }

    // Audit log
    const { logAudit } = await import('@/app/lib/audit-log');
    await logAudit({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'update',
      resource: 'doctor',
      resourceId: id,
      changes: [{ field: 'professionalFees', newValue: body }],
      description: `Added professional fee for doctor ${id}`,
      success: true,
      requestMethod: request.method,
      requestPath: request.url,
      ipAddress: request.headers.get('x-forwarded-for') || '',
      userAgent: request.headers.get('user-agent') || '',
      metadata: { invoiceId: body.invoiceId, visitId: body.visitId },
    });

    return NextResponse.json({ success: true, data: result.fees });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to add fee' }, { status: 500 });
  }
}
