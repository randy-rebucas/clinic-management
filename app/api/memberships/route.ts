import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { getPermissionChecker, forbiddenResponse as forbiddenJson } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, escapeRegex } from '@/lib/api/validate';
import { membershipPermissions } from '@/lib/membership-access';
import {
  MEMBERSHIP_TIERS,
  REFERRAL_BONUS,
  RENEWAL_DAYS,
  SORTS,
  STATUS_FILTERS,
  type MembershipSort,
  type MembershipStatusFilter,
} from '@/lib/memberships';

const membershipCreateSchema = z.object({
  patientId: zObjectId,
  tier: z.enum(MEMBERSHIP_TIERS).optional(),
  referredBy: zObjectId.optional().or(z.literal('').transform(() => undefined)),
  expiryDate: z.coerce.date().nullable().optional(),
});

const DAY = 86_400_000;
const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

function patientPopulate(path: string, tenantId: string, select = 'firstName lastName patientCode') {
  return { path, select, match: patientTenantFilter(tenantId) };
}

/** The list's status filter as a query. "Active" still includes renewals due; "expired" includes active ones past their date. */
function statusQuery(status: MembershipStatusFilter, now: Date): Record<string, unknown> {
  const notPast = { $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] };
  switch (status) {
    case 'active':
      return { status: 'active', ...notPast };
    case 'due':
      return { status: 'active', expiryDate: { $gte: now, $lte: new Date(now.getTime() + RENEWAL_DAYS * DAY) } };
    case 'expired':
      return { $or: [{ status: 'expired' }, { status: 'active', expiryDate: { $lt: now } }] };
    default:
      return { status };
  }
}

/**
 * GET /api/memberships
 * Paged list: `page`, `limit`, `search` (patient name or code, membership number), `tier`,
 * `status` (active | due | expired | suspended | inactive), `sort` (newest | points | expiry | name),
 * `patientId`. Points history is not sent here; the record page loads it.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const can = await getPermissionChecker(ctx.session);
  if (!membershipPermissions(can).canRead) return forbiddenJson('Cannot read memberships');

  try {
    await connectDB();

    const sp = request.nextUrl.searchParams;
    const patientId = sp.get('patientId');
    const tier = sp.get('tier');
    const status = sp.get('status') as MembershipStatusFilter | null;
    const search = sp.get('search')?.trim().slice(0, 100);
    const sort: MembershipSort = (SORTS as readonly string[]).includes(sp.get('sort') || '') ? (sp.get('sort') as MembershipSort) : 'newest';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '25', 10) || 25, 1), 100);
    const now = new Date();

    const and: Record<string, unknown>[] = [tenantFilter(ctx.tenantId)];
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      and.push({ patient: new Types.ObjectId(patientId) });
    }
    if (tier && (MEMBERSHIP_TIERS as readonly string[]).includes(tier)) and.push({ tier });
    if (status && (STATUS_FILTERS as readonly string[]).includes(status)) and.push(statusQuery(status, now));
    if (search) {
      const words = search.split(/\s+/).filter(Boolean).map((w) => new RegExp(escapeRegex(w), 'i'));
      const people = await Patient.find(patientTenantFilter(ctx.tenantId, { $and: words.map((w) => ({ $or: [{ firstName: w }, { lastName: w }, { patientCode: w }] })) }))
        .select('_id')
        .limit(300)
        .lean();
      and.push({ $or: [{ patient: { $in: people.map((p) => p._id) } }, { membershipNumber: new RegExp(escapeRegex(search), 'i') }] });
    }

    const sortStage: Record<string, 1 | -1> =
      sort === 'points'
        ? { points: -1, _id: -1 }
        : sort === 'expiry'
          ? { _exp: 1, _id: 1 }
          : sort === 'name'
            ? { _last: 1, _first: 1, _id: 1 }
            : { joinDate: -1, _id: -1 };

    const [result] = await Membership.aggregate([
      { $match: { $and: and } },
      {
        $lookup: {
          from: Patient.collection.name,
          let: { pid: '$patient' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$pid'] }, tenantIds: new Types.ObjectId(ctx.tenantId) } },
            { $project: { firstName: 1, lastName: 1, patientCode: 1, phone: 1 } },
          ],
          as: '_patient',
        },
      },
      {
        $addFields: {
          patient: { $ifNull: [{ $arrayElemAt: ['$_patient', 0] }, null] },
          _exp: { $ifNull: ['$expiryDate', FAR_FUTURE] },
          _last: { $toLower: { $ifNull: [{ $arrayElemAt: ['$_patient.lastName', 0] }, ''] } },
          _first: { $toLower: { $ifNull: [{ $arrayElemAt: ['$_patient.firstName', 0] }, ''] } },
        },
      },
      { $sort: sortStage },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                patient: 1,
                membershipNumber: 1,
                tier: 1,
                status: 1,
                points: 1,
                totalPointsEarned: 1,
                totalPointsRedeemed: 1,
                discountPercentage: 1,
                joinDate: 1,
                expiryDate: 1,
                renewalDate: 1,
                referralCount: { $size: { $ifNull: ['$referrals', []] } },
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    const total = result?.total?.[0]?.n ?? 0;
    return NextResponse.json({
      success: true,
      data: result?.rows ?? [],
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching memberships:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch memberships' }, { status: 500 });
  }
}

/**
 * POST /api/memberships — enrol a patient. The billing desk enrols at Bronze; a higher tier
 * needs `memberships:write`, as changing a tier does. A referrer gets the bonus with the new member.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const can = await getPermissionChecker(ctx.session);
  const perms = membershipPermissions(can);
  if (!perms.canEnrol) return forbiddenJson('Cannot enrol members');

  const parsed = await parseBody(request, membershipCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const { patientId, tier, referredBy, expiryDate } = parsed.data;

  if (tier && tier !== 'bronze' && !perms.canManage) {
    return forbiddenJson('Only someone who manages memberships can enrol above Bronze');
  }
  if (referredBy && referredBy === patientId) {
    return NextResponse.json({ success: false, error: 'A patient cannot refer themselves' }, { status: 400 });
  }
  if (expiryDate && expiryDate.getTime() < Date.now()) {
    return NextResponse.json({ success: false, error: 'The end date has already passed' }, { status: 400 });
  }

  try {
    await connectDB();

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: patientId })).select('_id firstName lastName').lean<{ _id: Types.ObjectId; firstName: string; lastName: string }>();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    if (referredBy) {
      const referrer = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: referredBy })).select('_id').lean();
      if (!referrer) {
        return NextResponse.json({ success: false, error: 'Referring patient not found' }, { status: 400 });
      }
    }

    const existing = await Membership.findOne(tenantFilter(ctx.tenantId, { patient: patientId })).select('_id membershipNumber').lean<{ _id: Types.ObjectId; membershipNumber: string }>();
    if (existing) {
      return NextResponse.json(
        { success: false, error: `${patient.firstName} ${patient.lastName} is already a member (${existing.membershipNumber})`, existingId: String(existing._id) },
        { status: 409 }
      );
    }

    const membership = new Membership({
      tenantId: ctx.tenantObjectId,
      patient: patientId,
      tier: tier || 'bronze',
      referredBy: referredBy || undefined,
      expiryDate: expiryDate ?? undefined,
    });

    if (referredBy) {
      membership.points += REFERRAL_BONUS;
      membership.totalPointsEarned += REFERRAL_BONUS;
      membership.transactions.push({
        type: 'earn',
        points: REFERRAL_BONUS,
        description: 'Welcome bonus (referred)',
        performedBy: new Types.ObjectId(ctx.session.userId),
        createdAt: new Date(),
      });
    }

    await membership.save();

    if (referredBy) {
      await Membership.updateOne(
        tenantFilter(ctx.tenantId, { patient: referredBy }),
        {
          $addToSet: { referrals: membership.patient },
          $inc: { points: REFERRAL_BONUS, totalPointsEarned: REFERRAL_BONUS },
          $push: {
            transactions: {
              type: 'earn',
              points: REFERRAL_BONUS,
              description: `Referral bonus (${patient.firstName} ${patient.lastName} joined)`,
              performedBy: new Types.ObjectId(ctx.session.userId),
              createdAt: new Date(),
            },
          },
        }
      );
    }

    await membership.populate(patientPopulate('patient', ctx.tenantId));

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'membership',
      resourceId: membership._id,
      dataSubject: membership.patient?._id ?? patientId,
      description: `Enrolled ${patient.firstName} ${patient.lastName} as ${membership.tier} member ${membership.membershipNumber}`,
    });

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating membership:', error);
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, error: 'Patient already has a membership' }, { status: 409 });
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Invalid membership data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create membership' }, { status: 500 });
  }
}
