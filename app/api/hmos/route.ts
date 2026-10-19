import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Hmo from '@/models/Hmo';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { HMO_FIELDS, hmoCreateSchema } from './schema';

/** GET: the clinic's HMOs, insurers and company accounts, by name. `active=true` for billing pickers. */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const query: Record<string, unknown> = { tenantId: ctx.tenantObjectId };
    if (request.nextUrl.searchParams.get('active') === 'true') query.active = true;
    const hmos = await Hmo.find(query).select(HMO_FIELDS).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).limit(500).lean();
    return NextResponse.json({ success: true, data: hmos });
  } catch (error) {
    console.error('Error fetching HMOs:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch HMOs' }, { status: 500 });
  }
}

/** POST: add an HMO to the directory. Billing staff (invoices:write). Audited. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, hmoCreateSchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const hmo = await Hmo.create({ ...parsed.data, tenantId: ctx.tenantObjectId });
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'hmo',
      resourceId: String(hmo._id),
      description: `Added ${hmo.name} to the HMO list`,
    });
    return NextResponse.json({ success: true, data: hmo }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: `${parsed.data.name} is already on the list.` }, { status: 409 });
    console.error('Error creating HMO:', error);
    return NextResponse.json({ success: false, error: 'Failed to add the HMO' }, { status: 500 });
  }
}
