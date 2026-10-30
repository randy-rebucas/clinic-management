import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Membership from '@/models/Membership';
import Tenant from '@/models/Tenant';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { TIER, benefitLabel, billingDiscount, membershipState, type MembershipTier } from '@/lib/memberships';
import { scopedTenantIds } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

/** Points history shown per card, newest first. */
const HISTORY_LIMIT = 10;

/** What a patient sees of their membership (the transactions are trimmed to safe fields below). */
const MEMBERSHIP_FIELDS = Object.fromEntries(
  'tenantId membershipNumber tier status points totalPointsEarned totalPointsRedeemed joinDate expiryDate discountPercentage benefits'
    .split(' ')
    .map((f) => [f, 1])
);

type MembershipRow = {
  _id: Types.ObjectId;
  tenantId?: Types.ObjectId;
  membershipNumber: string;
  tier: MembershipTier;
  status: string;
  points?: number;
  totalPointsEarned?: number;
  totalPointsRedeemed?: number;
  joinDate?: Date;
  expiryDate?: Date;
  discountPercentage?: number;
  benefits?: string[];
  transactions?: Array<{ type: string; points: number; description: string; createdAt?: Date }>;
};

/**
 * The change to the balance: stored earn/redeem/expire amounts are positive (the type says which
 * way they went), adjustments carry their own sign.
 */
function signedPoints(t: { type: string; points: number }): number {
  const n = Number(t.points) || 0;
  if (t.type === 'redeem' || t.type === 'expire') return -Math.abs(n);
  if (t.type === 'earn') return Math.abs(n);
  return n;
}

/**
 * GET /api/patients/me/membership
 * The patient's loyalty memberships, one per clinic (their own record's clinics plus linked
 * ones, narrowed to the session's clinic when it carries one). Read-only. Staff notes, referral
 * links, who recorded each transaction and reminder bookkeeping are never returned.
 * → 200 [{ id, tenantId, clinicName, membershipNumber, tier, tierLabel, status, state, points,
 *          totalPointsEarned, totalPointsRedeemed, discountPercentage, discountActive, benefits,
 *          joinDate, expiryDate, history: [{ type, points (signed: + earned, − used/expired), description, createdAt }] }]
 * An empty array when the patient has no membership.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const linked = await linkedRecords(patient as any);
    // Memberships are per clinic, so only clinics the patient is registered at count.
    const scope = (scopedTenantIds(linked.tenantIds, session) ?? []).map((id) => new Types.ObjectId(String(id)));
    if (!scope.length) return NextResponse.json({ success: true, data: [] });

    const [memberships, tenants] = await Promise.all([
      Membership.find({ patient: { $in: linked.patientIds }, tenantId: { $in: scope } })
        .select({ ...MEMBERSHIP_FIELDS, transactions: { $slice: -HISTORY_LIMIT } })
        .lean<MembershipRow[]>(),
      Tenant.find({ _id: { $in: scope }, status: { $ne: 'inactive' } })
        .select('name displayName')
        .lean<{ _id: Types.ObjectId; name?: string; displayName?: string }[]>(),
    ]);

    const clinicName = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || '']));
    const now = Date.now();

    const data = memberships
      // A clinic that has closed its account no longer shows.
      .filter((m) => clinicName.has(String(m.tenantId)))
      .map((m) => {
        const discount = billingDiscount(m, now);
        return {
          id: String(m._id),
          tenantId: String(m.tenantId),
          clinicName: clinicName.get(String(m.tenantId)) || null,
          membershipNumber: m.membershipNumber,
          tier: m.tier,
          tierLabel: TIER[m.tier]?.label ?? m.tier,
          status: m.status,
          state: membershipState(m, now),
          points: m.points ?? 0,
          totalPointsEarned: m.totalPointsEarned ?? 0,
          totalPointsRedeemed: m.totalPointsRedeemed ?? 0,
          discountPercentage: m.discountPercentage ?? 0,
          discountActive: discount !== null,
          benefits: (m.benefits ?? []).map(benefitLabel),
          joinDate: m.joinDate ?? null,
          expiryDate: m.expiryDate ?? null,
          history: (m.transactions ?? [])
            .map((t) => ({ type: t.type, points: signedPoints(t), description: t.description, createdAt: t.createdAt ?? null }))
            .reverse(),
        };
      })
      // Best tier first, then by clinic name.
      .sort((a, b) => (TIER[b.tier]?.rank ?? 0) - (TIER[a.tier]?.rank ?? 0) || String(a.clinicName).localeCompare(String(b.clinicName)));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching patient membership', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch membership' }, { status: 500 });
  }
}
