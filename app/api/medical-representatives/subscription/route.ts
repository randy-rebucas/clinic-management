import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { getRepPrices, repBookingAccess, teamCoverage } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

/**
 * GET /api/medical-representatives/subscription
 * Prices (standard, Pro, team seat), whether the rep can book visits with clinics now (and
 * through what), their own subscription with its plan, and their team's cover.
 */
export async function GET() {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    await connectDB();
    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep))
      .select('subscription.billingCycle subscription.plan subscription.expiresAt teamId')
      .lean<any>();
    if (!profile) return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });

    const [prices, access, team] = await Promise.all([
      getRepPrices(),
      repBookingAccess(profile),
      profile.teamId ? teamCoverage(profile.teamId) : Promise.resolve(null),
    ]);
    const ends: Date | null = profile.subscription?.expiresAt ?? null;

    return NextResponse.json({
      success: true,
      data: {
        canBookClinics: access.ok,
        coveredBy: access.ok ? access.via : null,
        prices: {
          monthly: prices.monthly,
          yearly: prices.yearly,
          seatMonthly: prices.seatMonthly,
          seatYearly: prices.seatYearly,
          proMonthly: prices.proMonthly,
          proYearly: prices.proYearly,
          currency: 'PHP',
        },
        free: prices.free,
        payable: prices.payable,
        individual: ends
          ? {
              billingCycle: profile.subscription?.billingCycle ?? 'monthly',
              plan: profile.subscription?.plan === 'pro' ? 'pro' : 'standard',
              expiresAt: ends,
              active: ends > new Date(),
            }
          : null,
        team,
      },
    });
  } catch (error) {
    console.error('Get rep subscription error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
