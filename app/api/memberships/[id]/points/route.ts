import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import { getPermissionChecker, forbiddenResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { membershipPermissions } from '@/lib/membership-access';

const MAX_POINTS = 1_000_000;

const pointsSchema = z
  .object({
    points: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= MAX_POINTS, 'Invalid points value'),
    description: z.string().trim().min(1).max(500),
    type: z.enum(['earn', 'redeem', 'adjustment']).optional(),
    relatedEntity: z
      .object({
        type: z.enum(['visit', 'appointment', 'invoice']),
        id: zObjectId,
      })
      .optional(),
  })
  .refine((b) => b.type === 'adjustment' || b.type === undefined || b.points > 0, {
    message: 'Points must be positive for earn/redeem',
    path: ['points'],
  });

/**
 * POST /api/memberships/:id/points
 * Earn and redeem are billing-desk actions and need a membership that is active and in date.
 * A correction (`adjustment`, either sign) needs `memberships:write` and works in any state.
 * Every entry records who made it, and is audit-logged.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  const parsed = await parseBody(request, pointsSchema);
  if (isValidationError(parsed)) return parsed;
  const { points, description, relatedEntity } = parsed.data;
  const transactionType = parsed.data.type || (points > 0 ? 'earn' : 'redeem');

  const perms = membershipPermissions(await getPermissionChecker(ctx.session));
  if (transactionType === 'adjustment' ? !perms.canManage : !perms.canPoints) {
    return forbiddenResponse(transactionType === 'adjustment' ? 'Only someone who manages memberships can correct points' : 'Cannot record points');
  }

  try {
    await connectDB();

    const amount = Math.abs(points);
    let balanceChange: number;
    const inc: Record<string, number> = {};
    if (transactionType === 'earn') {
      balanceChange = amount;
      inc.totalPointsEarned = amount;
    } else if (transactionType === 'redeem') {
      balanceChange = -amount;
      inc.totalPointsRedeemed = amount;
    } else {
      balanceChange = points;
    }
    inc.points = balanceChange;

    const now = new Date();
    const filter: Record<string, unknown> = tenantFilter(ctx.tenantId, { _id: id });
    if (transactionType !== 'adjustment') {
      filter.status = 'active';
      filter.$or = [{ expiryDate: null }, { expiryDate: { $gte: now } }];
    }
    // Guard decrements in the filter so concurrent redemptions can't take the balance negative.
    if (balanceChange < 0) {
      filter.points = { $gte: -balanceChange };
    }

    const membership = await Membership.findOneAndUpdate(
      filter,
      {
        $inc: inc,
        $push: {
          transactions: {
            type: transactionType,
            points: transactionType === 'adjustment' ? points : amount,
            description,
            relatedEntity: relatedEntity || undefined,
            performedBy: new Types.ObjectId(ctx.session.userId),
            createdAt: now,
          },
        },
      },
      { new: true, runValidators: true }
    );

    if (!membership) {
      const current = await Membership.findOne(tenantFilter(ctx.tenantId, { _id: id })).select('status expiryDate points').lean<{ status: string; expiryDate?: Date; points: number }>();
      if (!current) return notFound('Membership');
      if (transactionType !== 'adjustment' && (current.status !== 'active' || (current.expiryDate && current.expiryDate < now))) {
        const why = current.status === 'active' ? 'expired' : current.status;
        return NextResponse.json({ success: false, error: `The membership is ${why}, so points can't be earned or used. Renew or reactivate it first.` }, { status: 409 });
      }
      return NextResponse.json(
        { success: false, error: `Not enough points: ${current.points.toLocaleString('en-US')} available` },
        { status: 400 }
      );
    }

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'membership',
      resourceId: membership._id,
      dataSubject: membership.patient,
      changes: [{ field: 'points', oldValue: membership.points - balanceChange, newValue: membership.points }],
      description: `${transactionType === 'earn' ? 'Added' : transactionType === 'redeem' ? 'Used' : 'Corrected'} ${amount} points on ${membership.membershipNumber}: ${description}`,
    });

    return NextResponse.json({ success: true, data: { _id: membership._id, points: membership.points, totalPointsEarned: membership.totalPointsEarned, totalPointsRedeemed: membership.totalPointsRedeemed } });
  } catch (error) {
    console.error('Error updating points:', error);
    return NextResponse.json({ success: false, error: 'Failed to update points' }, { status: 500 });
  }
}
