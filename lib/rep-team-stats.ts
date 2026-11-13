import { Types } from 'mongoose';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { localNow, parseVisitDay } from '@/lib/rep-visit-rules';

/** The rep app's calendar: visit days are clinic days, and the clinics are in the Philippines. */
const REP_TIME_ZONE = 'Asia/Manila';

export type MemberStats = { visitsThisMonth: number; completedThisMonth: number; upcoming: number; pendingRequests: number; lastVisitAt: Date | null };

/**
 * Each member's counts for the manager, defined exactly as the member's own Home
 * (dashboard route) defines them, so a manager's row matches their Home:
 * "today" and "this month" are Manila days (visits are stored at UTC midnight of their day),
 * and a request only counts as waiting from today on (an older one the clinic never answered
 * isn't waiting on anything any more).
 */
export async function memberStats(userIds: Types.ObjectId[], now = new Date()): Promise<Map<string, MemberStats>> {
  const today = parseVisitDay(localNow(REP_TIME_ZONE, now).day)!;
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const inMonth = { $and: [{ $gte: ['$date', monthStart] }, { $lt: ['$date', nextMonth] }] };
  const fromToday = { $gte: ['$date', today] };
  const rows = await MedicalRepresentativeVisit.aggregate([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        visitsThisMonth: { $sum: { $cond: [{ $and: [inMonth, { $not: [{ $in: ['$status', ['cancelled', 'declined']] }] }] }, 1, 0] } },
        completedThisMonth: { $sum: { $cond: [{ $and: [inMonth, { $eq: ['$status', 'completed'] }] }, 1, 0] } },
        upcoming: { $sum: { $cond: [{ $and: [fromToday, { $eq: ['$status', 'scheduled'] }] }, 1, 0] } },
        pendingRequests: { $sum: { $cond: [{ $and: [fromToday, { $eq: ['$status', 'requested'] }] }, 1, 0] } },
        lastVisitAt: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, '$date', null] } },
      },
    },
  ]);
  return new Map(rows.map((r: any) => [String(r._id), { ...r, _id: undefined }]));
}
