import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import SupportRequestModel from '@/models/SupportRequest';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

const EXPIRY_WINDOW_DAYS = 30;

/**
 * GET /api/medical-representatives/dashboard
 * Home-screen summary for the mobile app: profile header, visit/product/support counts and the
 * next few scheduled visits. Month boundaries are UTC (reps are not tied to one clinic's timezone).
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    await connectDB();

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expiryCutoff = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const owner = rep.ownerFilter;
    const thisMonth = { $gte: monthStart, $lt: nextMonthStart };

    const [
      profile,
      totalVisits,
      visitsThisMonth,
      completedThisMonth,
      upcomingVisits,
      nextVisits,
      activeProducts,
      expiringProducts,
      openSupportRequests,
    ] = await Promise.all([
      MedicalRepresentative.findOne(repProfileFilter(rep))
        // No profileImage: it can be a 2 MB data URI; the profile screen loads it from /session.
        .select('firstName lastName company title territory isActivated status')
        .lean(),
      MedicalRepresentativeVisit.countDocuments(owner),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: thisMonth, status: { $ne: 'cancelled' } }),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: thisMonth, status: 'completed' }),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: { $gte: todayStart }, status: 'scheduled' }),
      MedicalRepresentativeVisit.find({ ...owner, date: { $gte: todayStart }, status: 'scheduled' })
        .select('clinicName clinicLocation purpose date time duration status')
        .sort({ date: 1, time: 1 })
        .limit(5)
        .lean(),
      Product.countDocuments({ ...owner, status: 'active' }),
      Product.countDocuments({ ...owner, status: 'active', expiryDate: { $gte: now, $lte: expiryCutoff } }),
      SupportRequestModel.countDocuments({ ...owner, status: { $in: ['open', 'in-progress'] } }),
    ]);

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        profile,
        stats: {
          totalVisits,
          visitsThisMonth,
          completedThisMonth,
          upcomingVisits,
          activeProducts,
          expiringProducts,
          openSupportRequests,
        },
        nextVisits,
      },
    });
  } catch (error: any) {
    console.error('Medical representative dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
