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
/** Weeks in Home's visit chart, this one included. */
const TREND_WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The last TREND_WEEKS Monday-start weeks, oldest first, each with its completed visits and its
 * still-open ones (requested or scheduled). Cancelled, declined and no-show visits aren't counted.
 * `days` is the per-day aggregation; visit days are UTC midnights, so day keys are ISO dates.
 */
function weeklySeries(weekStart: Date, days: { _id: Date; completed: number; open: number }[]) {
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => ({
    week: new Date(weekStart.getTime() + i * 7 * DAY_MS).toISOString().slice(0, 10),
    completed: 0,
    open: 0,
  }));
  for (const d of days) {
    const i = Math.floor((new Date(d._id).getTime() - weekStart.getTime()) / (7 * DAY_MS));
    if (i < 0 || i >= TREND_WEEKS) continue;
    weeks[i].completed += d.completed;
    weeks[i].open += d.open;
  }
  return weeks;
}

/**
 * GET /api/medical-representatives/dashboard
 * Home-screen summary for the mobile app: profile header, visit/product/support counts and the
 * next few scheduled visits, plus every scheduled visit today (`todayVisits`, for the route) and
 * the last 8 weeks of visits (`weeklyVisits`, for Home's chart).
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
    const owner = rep.ownerFilter;
    const thisMonth = { $gte: monthStart, $lt: nextMonthStart };
    // Monday of this week (getUTCDay: Sunday 0), then back TREND_WEEKS - 1 weeks.
    const thisMonday = new Date(todayStart.getTime() - ((todayStart.getUTCDay() + 6) % 7) * DAY_MS);
    const trendStart = new Date(thisMonday.getTime() - (TREND_WEEKS - 1) * 7 * DAY_MS);
    const trendEnd = new Date(thisMonday.getTime() + 7 * DAY_MS);

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
      trendDays,
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
      // Already expired counts too: a rep still carrying expired stock needs to know first.
      Product.countDocuments({ ...owner, status: 'active', expiryDate: { $lt: new Date(todayStart.getTime() + (EXPIRY_WINDOW_DAYS + 1) * DAY_MS) } }),
      SupportRequestModel.countDocuments({ ...owner, status: { $in: ['open', 'in-progress'] } }),
      // Per day, not per week: at most 56 groups, and no $dateTrunc week maths in the database.
      MedicalRepresentativeVisit.aggregate<{ _id: Date; completed: number; open: number }>([
        {
          $match: {
            ...owner,
            date: { $gte: trendStart, $lt: trendEnd },
            status: { $in: ['completed', 'scheduled', 'requested'] },
          },
        },
        {
          $group: {
            _id: '$date',
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            open: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 0, 1] } },
          },
        },
      ]),
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
        weeklyVisits: weeklySeries(trendStart, trendDays),
      },
    });
  } catch (error: any) {
    console.error('Medical representative dashboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
