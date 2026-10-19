import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import HmoClaimBatch from '@/models/HmoClaimBatch';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { createBatch, listOpenClaims } from '@/lib/hmo-claims';

/**
 * GET: the HMO claims work queue: claims still to send (grouped on the page by payer) and the
 * transmittals, newest first, with what is still owed on each. Billing staff (invoices:write).
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const [open, batches] = await Promise.all([
      listOpenClaims(ctx.tenantId),
      HmoClaimBatch.find({ tenantId: ctx.tenantObjectId })
        .select('hmo hmoName batchNumber status totalClaimed submittedAt dueAt createdAt claims.paid claims.withheld claims.status claims.amount')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean<any[]>(),
    ]);
    const now = Date.now();
    return NextResponse.json({
      success: true,
      data: {
        open,
        batches: batches.map((b) => {
          const received = b.claims.reduce((s: number, c: any) => s + (c.paid || 0) + (c.withheld || 0), 0);
          const outstanding = b.claims.filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + c.amount - (c.paid || 0) - (c.withheld || 0), 0);
          return {
            _id: String(b._id),
            hmoId: String(b.hmo),
            hmoName: b.hmoName,
            batchNumber: b.batchNumber,
            status: b.status,
            claims: b.claims.length,
            totalClaimed: b.totalClaimed,
            received: Math.round(received * 100) / 100,
            outstanding: Math.round(outstanding * 100) / 100,
            submittedAt: b.submittedAt ?? null,
            dueAt: b.dueAt ?? null,
            overdue: Boolean(b.dueAt && ['submitted', 'partial'].includes(b.status) && new Date(b.dueAt).getTime() < now),
            createdAt: b.createdAt,
          };
        }),
      },
    });
  } catch (error) {
    console.error('Error loading HMO claims:', error);
    return NextResponse.json({ success: false, error: 'Failed to load HMO claims' }, { status: 500 });
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
