import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';

const Schema = z
  .object({
    registeredName: z.string().trim().max(200),
    /** The clinic's TIN as printed on DevCom Digital's invoices, e.g. 123-456-789-00000. Optional. */
    tin: z.string().trim().max(20).regex(/^$|^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/, 'Enter the TIN as 123-456-789 or 123-456-789-00000'),
    address: z.string().trim().max(500),
    email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email').max(254)]),
  })
  .strict();

/**
 * PUT /api/subscription/billing-profile: who the subscription sales invoices are made out to.
 * Admin/owner only. Applies to invoices issued from now on; issued ones keep their buyer.
 */
export async function PUT(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'write');

  const parsed = await parseBody(request, Schema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  await Tenant.updateOne({ _id: ctx.tenantObjectId }, { $set: { billingProfile: parsed.data } });
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'update',
    resource: 'settings',
    description: 'Updated the billing details on subscription invoices',
  });
  return NextResponse.json({ success: true, data: parsed.data });
}
