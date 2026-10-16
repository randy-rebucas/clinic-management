import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import { requirePermission } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';

// Points, totals, benefits, discount and transactions are deliberately not editable here:
// points go through /points, benefits/discount are derived from tier in the model's save hook.
const membershipUpdateSchema = z.object({
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  status: z.enum(['active', 'inactive', 'expired', 'suspended']).optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  renewalDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(10000).optional(),
});

function patientPopulate(path: string, tenantId: string, select = 'firstName lastName patientCode') {
  return { path, select, match: patientTenantFilter(tenantId) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  try {
    await connectDB();

    const membership = await Membership.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .populate(patientPopulate('patient', ctx.tenantId, 'firstName lastName patientCode email phone'))
      .populate(patientPopulate('referredBy', ctx.tenantId))
      .populate(patientPopulate('referrals', ctx.tenantId));

    if (!membership) return notFound('Membership');

    return NextResponse.json({ success: true, data: membership });
  } catch (error) {
    console.error('Error fetching membership:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch membership' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'memberships', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  const parsed = await parseBody(request, membershipUpdateSchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();

    const membership = await Membership.findOne(tenantFilter(ctx.tenantId, { _id: id }));
    if (!membership) return notFound('Membership');

    // Load + save (rather than findOneAndUpdate) so the save hook re-derives tier benefits/discount.
    membership.set(parsed.data);
    await membership.save();

    await membership.populate(patientPopulate('patient', ctx.tenantId));
    await membership.populate(patientPopulate('referredBy', ctx.tenantId));

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error updating membership:', error);
    if (error?.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid membership data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update membership' },
      { status: 500 }
    );
  }
}
