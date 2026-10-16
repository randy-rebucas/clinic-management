import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { WAIT_BUCKETS } from '@/lib/referrals';

const present = (field: string) => ({ $ne: [{ $ifNull: [field, ''] }, ''] });

/** `directionOf` (lib/referrals) as an aggregation expression. */
const DIRECTION_EXPR = {
  $switch: {
    branches: [
      { case: { $eq: ['$type', 'doctor_to_doctor'] }, then: 'internal' },
      { case: { $eq: ['$type', 'patient_to_patient'] }, then: 'patient' },
      { case: { $ne: [{ $ifNull: ['$referringDoctor', null] }, null] }, then: 'out' },
      {
        case: { $and: [present('$receivingClinic'), { $not: [present('$referringClinic')] }, { $not: [present('$referringContact.name')] }] },
        then: 'out',
      },
    ],
    default: 'in',
  },
};

/**
 * GET /api/referrals/insights[?mine=true]
 * What needs following up: referrals still waiting for a reply by how long they've waited (and how
 * many are urgent, and how many wait on the signed-in doctor), where every referral stands, where
 * the clinic sends patients most, and how referrals split by direction. `mine` = referrals the
 * signed-in doctor sent or receives.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const now = new Date();
    const day = 86_400_000;
    const me = await myDoctorProfileId(tenantId, session.userId);
    const meId = me ? new Types.ObjectId(me) : null;

    const scope: Record<string, unknown> = { tenantId: tenantObjectId };
    if (request.nextUrl.searchParams.get('mine') === 'true') {
      if (!meId) return NextResponse.json({ success: false, error: 'Your login is not linked to a doctor profile' }, { status: 400 });
      scope.$or = [{ referringDoctor: meId }, { receivingDoctor: meId }];
    }
    const yearAgo = new Date(now.getTime() - 365 * day);

    const [statusRows, waitRows, urgentWaiting, toMe, destRows, directionRows] = await Promise.all([
      Referral.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Referral.aggregate([
        { $match: { ...scope, status: 'pending' } },
        { $project: { days: { $floor: { $divide: [{ $subtract: [now, '$referredDate'] }, day] } } } },
        {
          $group: {
            _id: {
              $switch: {
                branches: WAIT_BUCKETS.filter((b) => b.max !== null).map((b) => ({ case: { $lte: ['$days', b.max as number] }, then: b.key })),
                default: WAIT_BUCKETS[WAIT_BUCKETS.length - 1].key,
              },
            },
            n: { $sum: 1 },
            oldest: { $max: '$days' },
          },
        },
      ]),
      Referral.countDocuments({ ...scope, status: 'pending', urgency: { $in: ['urgent', 'stat'] } }),
      meId ? Referral.countDocuments({ tenantId: tenantObjectId, status: 'pending', receivingDoctor: meId }) : Promise.resolve(null),
      Referral.aggregate([
        { $match: { ...scope, referredDate: { $gte: yearAgo }, status: { $ne: 'cancelled' } } },
        {
          $project: {
            doctor: '$receivingDoctor',
            clinic: { $trim: { input: { $ifNull: ['$receivingClinic', ''] } } },
          },
        },
        { $match: { $or: [{ doctor: { $ne: null } }, { clinic: { $ne: '' } }] } },
        {
          $group: {
            _id: { $cond: [{ $ne: [{ $ifNull: ['$doctor', null] }, null] }, { $concat: ['d:', { $toString: '$doctor' }] }, { $concat: ['c:', { $toLower: '$clinic' }] }] },
            doctor: { $first: '$doctor' },
            clinic: { $first: '$clinic' },
            n: { $sum: 1 },
          },
        },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 6 },
      ]),
      Referral.aggregate([{ $match: scope }, { $group: { _id: DIRECTION_EXPR, n: { $sum: 1 } } }]),
    ]);

    const doctorIds = (destRows as { doctor?: Types.ObjectId | null }[]).map((r) => r.doctor).filter(Boolean) as Types.ObjectId[];
    const doctors = doctorIds.length
      ? await Doctor.find({ _id: { $in: doctorIds }, tenantId: tenantObjectId }).select('firstName lastName specializationId').populate('specializationId', 'name').lean<any[]>()
      : [];
    const doctorName = new Map(doctors.map((d) => [String(d._id), { name: `Dr. ${d.firstName} ${d.lastName}`.trim(), specialty: d.specializationId?.name ?? null }]));

    const waitMap = new Map((waitRows as { _id: string; n: number; oldest: number }[]).map((r) => [r._id, r]));
    const oldest = Math.max(-1, ...(waitRows as { oldest: number }[]).map((r) => r.oldest ?? -1));

    return NextResponse.json({
      success: true,
      data: {
        status: Object.fromEntries((statusRows as { _id: string; n: number }[]).map((r) => [r._id || 'pending', r.n])),
        waiting: WAIT_BUCKETS.map((b) => ({ key: b.key, label: b.label, short: b.short, count: waitMap.get(b.key)?.n || 0 })),
        oldestWaitingDays: oldest >= 0 ? oldest : null,
        urgentWaiting,
        toMe,
        destinations: (destRows as { _id: string; doctor?: Types.ObjectId | null; clinic?: string; n: number }[]).map((r) => {
          const doc = r.doctor ? doctorName.get(String(r.doctor)) : null;
          return {
            key: r._id,
            name: r.doctor ? (doc?.name ?? 'A doctor no longer on file') : r.clinic || 'Unnamed clinic',
            note: r.doctor ? (doc?.specialty ?? 'Doctor here') : 'Outside',
            count: r.n,
          };
        }),
        directions: Object.fromEntries((directionRows as { _id: string; n: number }[]).map((r) => [r._id, r.n])),
      },
    });
  } catch (error) {
    console.error('Error building referral insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load referral insights' }, { status: 500 });
  }
}
