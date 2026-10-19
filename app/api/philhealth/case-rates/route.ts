import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PhilhealthCaseRate from '@/models/PhilhealthCaseRate';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { caseRateSchema } from './schema';

/** GET: the clinic's PhilHealth case rates, by code. `active=true` for the invoice form. */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'read');
  if (permissionCheck) return permissionCheck;
  try {
    await connectDB();
    const query: Record<string, unknown> = { tenantId: ctx.tenantObjectId };
    if (request.nextUrl.searchParams.get('active') === 'true') query.active = true;
    const rows = await PhilhealthCaseRate.find(query).select('code kind description amount hciShare pfShare active').sort({ code: 1 }).limit(2000).lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching case rates:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch case rates' }, { status: 500 });
  }
}

/** POST: add a case rate. Billing staff (invoices:write). */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const parsed = await parseBody(request, caseRateSchema);
  if (isValidationError(parsed)) return parsed;
  try {
    await connectDB();
    const row = await PhilhealthCaseRate.create({ ...parsed.data, tenantId: ctx.tenantObjectId });
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'philhealth',
      resourceId: String(row._id),
      description: `Added PhilHealth case rate ${row.code} at ${row.amount}`,
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: `Case rate ${parsed.data.code} is already on the list.` }, { status: 409 });
    console.error('Error creating case rate:', error);
    return NextResponse.json({ success: false, error: 'Failed to add the case rate' }, { status: 500 });
  }
}
