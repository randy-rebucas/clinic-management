import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { repReferralView } from '@/lib/rep-referral';
import { requireRepSession, isRepSessionError, repProfileFilter, type RepSession } from '../_lib/rep-session';

async function profileOf(rep: RepSession) {
  await connectDB();
  return MedicalRepresentative.findOne(repProfileFilter(rep))
    .select('_id status isActivated')
    .lean<{ _id: Types.ObjectId; status?: string; isActivated?: boolean } | null>();
}

const inactive = () =>
  NextResponse.json(
    { success: false, error: 'Your account needs to be active before clinics can use your code.', code: 'REP_INACTIVE' },
    { status: 403 }
  );

async function handle(regenerate: boolean) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const profile = await profileOf(rep);
    if (!profile) return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    if (profile.status !== 'active' || !profile.isActivated) return inactive();
    return NextResponse.json({ success: true, data: await repReferralView(profile._id, { regenerate }) });
  } catch (error) {
    console.error('Rep referral code error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/medical-representatives/referral-code
 * The rep's referral code (made on first use), its clinic signup link, and the clinics that
 * joined with the rep's codes: { code, link, clinics: [{ name, joinedOn }], total }.
 */
export async function GET() {
  return handle(false);
}

/**
 * POST /api/medical-representatives/referral-code
 * Replace the rep's code with a new one; the old code and link stop working. Same response as GET.
 */
export async function POST() {
  return handle(true);
}
