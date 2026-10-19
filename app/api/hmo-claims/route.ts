import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { createBatch, listBatches } from '@/lib/hmo-claims';
import { isBatchShow, isOwedAgingKey } from '@/lib/hmo';

/**
 * GET: transmittals, one page at a time. `show` = waiting | overdue | draft | done, `hmo` = a
 * payer id, `aging` = days since sent (waiting only), `search` = transmittal number, payer,
 * patient, invoice or LOA number. Billing staff (invoices:write).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  const sp = request.nextUrl.searchParams;
  const show = sp.get('show');
  const aging = sp.get('aging');
  const hmo = sp.get('hmo');
  const page = Math.max(1, Math.floor(Number(sp.get('page')) || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(sp.get('limit')) || 20)));

  try {
    await connectDB();
    const { rows, total } = await listBatches({
      tenantId: ctx.tenantId,
      show: isBatchShow(show) ? show : null,
      aging: isOwedAgingKey(aging) ? aging : null,
      hmo: hmo && isValidId(hmo) ? hmo : null,
      search: (sp.get('search') ?? '').slice(0, 100),
      page,
      limit,
    });
    return NextResponse.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    console.error('Error loading HMO transmittals:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the transmittals' }, { status: 500 });
  }
}

const createSchema = z.object({ hmo: zObjectId, invoices: z.array(zObjectId).min(1).max(500) });

/** POST: a new draft transmittal from claims to one HMO. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const parsed = await parseBody(request, createSchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const result = await createBatch({ tenantId: ctx.tenantId, hmoId: parsed.data.hmo, invoiceIds: parsed.data.invoices, userId: ctx.session.userId });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'hmo_claim',
      resourceId: result.batchId,
      description: `Put ${parsed.data.invoices.length} HMO claims in a transmittal`,
    });
    return NextResponse.json({ success: true, data: { _id: result.batchId } }, { status: 201 });
  } catch (error) {
    console.error('Error creating transmittal:', error);
    return NextResponse.json({ success: false, error: 'Failed to create the transmittal' }, { status: 500 });
  }
}
