import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import SupportRequestModel from '@/models/SupportRequest';
import { localNow, parseVisitDay } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

const EXPIRY_WINDOW_DAYS = 30;
/** The rep app's calendar: visit days are clinic days, and the clinics are in the Philippines. */
const REP_TIME_ZONE = 'Asia/Manila';
/** Most of today's stops returned for the route (Google Maps takes 9 in between plus the end). */
const TODAY_LIMIT = 20;
const VISIT_FIELDS = 'clinicId clinicName clinicLocation purpose date time duration status checkedInAt';

/**
 * GET /api/medical-representatives/dashboard
 * Home-screen summary for the mobile app: profile header, visit/product/support counts and the
 * next few scheduled visits, plus every scheduled visit today (`todayVisits`, for the route).
 * "Today" and "this month" are Manila days, as the app shows them; visits are stored at UTC
 * midnight of their day, so the bounds are UTC midnights of those days.
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    await connectDB();

    const now = new Date();
    const todayStart = parseVisitDay(localNow(REP_TIME_ZONE, now).day)!;
    const monthStart = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth() + 1, 1));
    const expiryCutoff = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const owner = rep.ownerFilter;
    const thisMonth = { $gte: monthStart, $lt: nextMonthStart };

    const [
      profile,
      totalVisits,
      visitsThisMonth,
      completedThisMonth,
      upcomingVisits,
      pendingRequests,
      nextVisits,
      todayVisits,
      activeProducts,
      expiringProducts,
      openSupportRequests,
    ] = await Promise.all([
      MedicalRepresentative.findOne(repProfileFilter(rep))
        // No profileImage: it can be a 2 MB data URI; the profile screen loads it from /session.
        .select('firstName lastName company title territory isActivated status')
        .lean(),
      MedicalRepresentativeVisit.countDocuments(owner),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: thisMonth, status: { $nin: ['cancelled', 'declined'] } }),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: thisMonth, status: 'completed' }),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: { $gte: todayStart }, status: 'scheduled' }),
      MedicalRepresentativeVisit.countDocuments({ ...owner, date: { $gte: todayStart }, status: 'requested' }),
      MedicalRepresentativeVisit.find({ ...owner, date: { $gte: todayStart }, status: 'scheduled' })
        .select(VISIT_FIELDS)
        .sort({ date: 1, time: 1 })
        .limit(5)
        .lean(),
      MedicalRepresentativeVisit.find({ ...owner, date: todayStart, status: 'scheduled' })
        .select(VISIT_FIELDS)
        .sort({ time: 1 })
        .limit(TODAY_LIMIT)
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
          pendingRequests,
          activeProducts,
          expiringProducts,
          openSupportRequests,
        },
        nextVisits,
        todayVisits,
      },
    });
  } catch (error: any) {
    console.error('Medical representative dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
