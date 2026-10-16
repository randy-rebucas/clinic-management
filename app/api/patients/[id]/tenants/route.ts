import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';

// GET /api/patients/[id]/tenants
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('tenantIds').lean();
    if (!patient) return notFound('Patient');

    const tenantIds = Array.isArray((patient as any).tenantIds) ? (patient as any).tenantIds : [];
    if (!tenantIds.length) {
      return NextResponse.json({ success: true, tenants: [] });
    }
    // Public-facing clinic info only; never another clinic's settings or billing.
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name displayName subdomain')
      .lean();
    return NextResponse.json({ success: true, tenants });
  } catch (error: any) {
    console.error('Error fetching patient clinics:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch clinics' }, { status: 500 });
  }
}
