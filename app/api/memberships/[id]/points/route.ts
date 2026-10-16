import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  const parsed = await parseBody(request, pointsSchema);
  if (isValidationError(parsed)) return parsed;
  const { points, description, relatedEntity } = parsed.data;
  const transactionType = parsed.data.type || (points > 0 ? 'earn' : 'redeem');

  // Earning/redeeming is a billing-desk action; arbitrary adjustments are admin-level.
  const permissionCheck = await requirePermission(
    ctx.session,
    transactionType === 'adjustment' ? 'memberships' : 'invoices',
    'write'
  );
  if (permissionCheck) return permissionCheck;

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

    const filter: Record<string, unknown> = tenantFilter(ctx.tenantId, { _id: id });
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
            createdAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    );

    if (!membership) {
      if (balanceChange < 0) {
        const exists = await Membership.exists(tenantFilter(ctx.tenantId, { _id: id }));
        if (exists) {
          return NextResponse.json(
            { success: false, error: 'Insufficient points' },
            { status: 400 }
          );
        }
      }
      return notFound('Membership');
    }

    return NextResponse.json({ success: true, data: membership });
  } catch (error) {
    console.error('Error updating points:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update points' },
      { status: 500 }
    );
  }
}
