import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import User from '@/models/User';
import { getPermissionChecker, forbiddenResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { membershipPermissions } from '@/lib/membership-access';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_TIERS, TIER, renewedUntil } from '@/lib/memberships';

// Points, totals, benefits, discount and transactions are deliberately not editable here:
// points go through /points, benefits/discount are derived from tier in the model's save hook.
const membershipUpdateSchema = z.union([
  z.object({ action: z.literal('renew') }).strict(),
  z
    .object({
      tier: z.enum(MEMBERSHIP_TIERS).optional(),
      status: z.enum(MEMBERSHIP_STATUSES).optional(),
      expiryDate: z.coerce.date().nullable().optional(),
      renewalDate: z.coerce.date().nullable().optional(),
      notes: z.string().max(10000).optional(),
    })
    .strict(),
]);

function patientPopulate(path: string, tenantId: string, select = 'firstName lastName patientCode') {
  return { path, select, match: patientTenantFilter(tenantId) };
}

const dateKey = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

/**
 * GET /api/memberships/:id — the record: member, tier, dates, the points history with who
 * recorded each entry, who referred them (with that member's record) and whom they referred.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const can = await getPermissionChecker(ctx.session);
  if (!membershipPermissions(can).canRead) return forbiddenResponse('Cannot read memberships');

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  try {
    await connectDB();

    const membership = await Membership.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .populate(patientPopulate('patient', ctx.tenantId, 'firstName lastName patientCode phone email'))
      .populate(patientPopulate('referredBy', ctx.tenantId))
      .populate(patientPopulate('referrals', ctx.tenantId))
      .populate({ path: 'transactions.performedBy', select: 'name', model: User })
      .lean<any>();

    if (!membership) return notFound('Membership');

    // Link the referrer and the people they brought in to their own memberships, where they have one.
    const people = [membership.referredBy?._id, ...(membership.referrals ?? []).map((r: any) => r?._id)].filter(Boolean);
    const linked = people.length
      ? await Membership.find(tenantFilter(ctx.tenantId, { patient: { $in: people } })).select('_id patient tier').lean<{ _id: Types.ObjectId; patient: Types.ObjectId; tier: string }[]>()
      : [];
    const membershipOf = new Map(linked.map((m) => [String(m.patient), { _id: String(m._id), tier: m.tier }]));

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'view',
      resource: 'membership',
      resourceId: membership._id,
      dataSubject: membership.patient?._id,
      description: `Viewed membership ${membership.membershipNumber}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...membership,
        expiryRemindersSent: undefined,
        expiryRemindersFor: undefined,
        transactions: (membership.transactions ?? []).map((t: any) => ({
          type: t.type,
          points: t.points,
          description: t.description,
          relatedEntity: t.relatedEntity?.type ? { type: t.relatedEntity.type, id: String(t.relatedEntity.id) } : undefined,
          by: t.performedBy?.name ?? null,
          createdAt: t.createdAt,
        })),
        referredBy: membership.referredBy
          ? { ...membership.referredBy, membership: membershipOf.get(String(membership.referredBy._id)) ?? null }
          : null,
        referrals: (membership.referrals ?? []).filter(Boolean).map((r: any) => ({ ...r, membership: membershipOf.get(String(r._id)) ?? null })),
      },
    });
  } catch (error) {
    console.error('Error fetching membership:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch membership' }, { status: 500 });
  }
}

/**
 * PUT /api/memberships/:id
 * `{ action: 'renew' }` extends a membership by a year (from its end date, or from today once
 * that has passed) and makes it active: the billing desk may renew active and expired ones;
 * a suspended or inactive one needs `memberships:write`. Anything else (tier,
 * status, dates, notes) needs `memberships:write`. A membership can't be made active with an
 * end date that has passed; the nightly job would expire it again.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const can = await getPermissionChecker(ctx.session);
  const perms = membershipPermissions(can);

  const { id } = await params;
  if (!isValidId(id)) return notFound('Membership');

  const parsed = await parseBody(request, membershipUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;
  const renew = 'action' in body;

  if (renew ? !perms.canRenew : !perms.canManage) {
    return forbiddenResponse(renew ? 'Cannot renew memberships' : 'Only someone who manages memberships can change this');
  }

  try {
    await connectDB();

    const membership = await Membership.findOne(tenantFilter(ctx.tenantId, { _id: id }));
    if (!membership) return notFound('Membership');

    const before = { tier: membership.tier, status: membership.status, expiryDate: dateKey(membership.expiryDate), notes: membership.notes ?? '' };
    const now = new Date();

    if (renew) {
      // A suspended or inactive membership is put back only by someone who manages memberships.
      if (membership.status !== 'active' && membership.status !== 'expired' && !perms.canManage) {
        return NextResponse.json(
          { success: false, error: `A ${membership.status} membership can't be renewed. Reactivate it first.` },
          { status: 409 }
        );
      }
      membership.expiryDate = renewedUntil(membership.expiryDate, now);
      membership.renewalDate = now;
      membership.status = 'active';
    } else {
      // Load + save (rather than findOneAndUpdate) so the save hook re-derives tier benefits/discount.
      // Only the fields sent change; a date sent as null is cleared.
      for (const [key, value] of Object.entries(body)) {
        if (value === undefined) continue;
        membership.set(key, value === null ? undefined : value);
      }
      if (membership.status === 'active' && membership.expiryDate && membership.expiryDate.getTime() < now.getTime()) {
        return NextResponse.json(
          { success: false, error: 'Its end date has passed. Renew it, or set a later end date, to make it active.' },
          { status: 400 }
        );
      }
    }

    await membership.save();

    const after = { tier: membership.tier, status: membership.status, expiryDate: dateKey(membership.expiryDate), notes: membership.notes ?? '' };
    const changes = (Object.keys(before) as (keyof typeof before)[])
      .filter((k) => before[k] !== after[k])
      .map((k) => ({ field: k, oldValue: k === 'notes' ? undefined : before[k], newValue: k === 'notes' ? undefined : after[k] }));

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'membership',
      resourceId: membership._id,
      dataSubject: membership.patient,
      changes,
      description: renew
        ? `Renewed membership ${membership.membershipNumber} until ${membership.expiryDate?.toISOString().slice(0, 10)}`
        : `Updated membership ${membership.membershipNumber}${before.tier !== after.tier ? ` (${TIER[before.tier as keyof typeof TIER].label} → ${TIER[after.tier as keyof typeof TIER].label})` : ''}`,
    });

    await membership.populate(patientPopulate('patient', ctx.tenantId));
    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error updating membership:', error);
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Invalid membership data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to update membership' }, { status: 500 });
  }
}
