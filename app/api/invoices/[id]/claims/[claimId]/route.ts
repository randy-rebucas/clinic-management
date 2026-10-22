import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { decidePaymentClaim } from '@/lib/payments/invoice-pay';

const Body = z.object({ action: z.enum(['confirm', 'reject']), reason: z.string().trim().max(300).optional() }).strict();

/**
 * POST /api/invoices/[id]/claims/[claimId] { action, reason? }: confirm a patient's "I've paid"
 * (records the payment) after checking it arrived in the account, or reject it. Billing staff.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id, claimId } = await params;
  if (!isValidId(id) || !isValidId(claimId)) return notFound('Payment claim');
  const parsed = await parseBody(request, Body);
  if (isValidationError(parsed)) return parsed;

  const r = await decidePaymentClaim({ tenantId: ctx.tenantId, invoiceId: id, claimId, action: parsed.data.action, reason: parsed.data.reason, userId: ctx.session.userId });
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'update',
    resource: 'invoice',
    resourceId: id,
    description: `${parsed.data.action === 'confirm' ? 'Confirmed' : 'Rejected'} a payment the patient reported from the pay page`,
    metadata: { claimId, reason: parsed.data.reason },
  });
  return NextResponse.json({ success: true });
}
