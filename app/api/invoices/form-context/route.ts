import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';

/**
 * GET /api/invoices/form-context
 * What the invoice form picks from: the clinic's active price list and its doctors (for the
 * professional fee). Gated on invoices:write rather than services/doctors:read, because billing
 * staff (accountants) bill doctors' fees without being allowed to browse the doctor directory.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const [services, doctors] = await Promise.all([
      Service.find(tenantFilter(tenantId, { active: true }))
        .select('name code category unitPrice unit')
        .sort({ category: 1, name: 1 })
        .limit(2000)
        .lean(),
      Doctor.find(tenantFilter(tenantId, { status: { $ne: 'inactive' } }))
        .select('firstName lastName')
        .sort({ lastName: 1, firstName: 1 })
        .limit(500)
        .lean(),
    ]);
    return NextResponse.json({ success: true, data: { services, doctors } });
  } catch (error) {
    console.error('Error loading invoice form context:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the price list' }, { status: 500 });
  }
}
