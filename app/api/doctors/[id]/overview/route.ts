import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { combineDateAndTimeInTz, dayRangeInTz, formatInTz } from '@/lib/tz';
import { addDays } from '@/lib/doctors';
import { canSeeDoctorActivity, myDoctorProfileId } from '@/lib/doctor-access';
import { computeDoctorStats } from '../../_lib/doctor-stats';

type DayRow = { _id: string; booked: number; seen: number; noShow: number; cancelled: number };

const AHEAD = 14;
const BEHIND = 30;

/**
 * GET /api/doctors/[id]/overview
 *
 * What a doctor's page needs beyond the profile: the clinic's today and business hours; bookings
 * per day for the next two weeks (appointments:read); and the last 30 days' workload per day plus
 * visit, prescription and payment totals, for admins, accountants and the doctor themselves.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const can = await getPermissionChecker(session);
  if (!can('doctors', 'read')) {
    return refuseAccess(session, 'Unauthorized', 'doctors');
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');
    const exists = await Doctor.exists(tenantFilter(tenantId, { _id: id }));
    if (!exists) return notFound('Doctor');

    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const today = formatInTz(now, 'yyyy-MM-dd', tz);
    const doctorId = new Types.ObjectId(id);
    const myDoctorId = await myDoctorProfileId(tenantId, session.userId);
    const withBookings = can('appointments', 'read');
    const withActivity = canSeeDoctorActivity(session, myDoctorId, id);

    const startOf = (key: string) => combineDateAndTimeInTz(key, '00:00', tz);
    const endOf = (key: string) => dayRangeInTz(combineDateAndTimeInTz(key, '12:00', tz), tz).end;
    const byDay = (from: Date, to: Date) =>
      Appointment.aggregate([
        { $match: { tenantId: tenantObjectId, doctor: doctorId, appointmentDate: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate', timezone: tz } },
            booked: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } },
            seen: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            noShow: { $sum: { $cond: [{ $eq: ['$status', 'no-show'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          },
        },
      ]) as Promise<DayRow[]>;

    const aheadKeys = Array.from({ length: AHEAD }, (_, i) => addDays(today, i));
    const behindKeys = Array.from({ length: BEHIND }, (_, i) => addDays(today, i - BEHIND + 1));

    const [settings, ahead, behind, stats] = await Promise.all([
      getSettings(tenantId).catch(() => null),
      withBookings ? byDay(startOf(aheadKeys[0]), endOf(aheadKeys[AHEAD - 1])) : Promise.resolve(null),
      withActivity ? byDay(startOf(behindKeys[0]), endOf(today)) : Promise.resolve(null),
      withActivity
        ? computeDoctorStats(tenantId, [doctorId], { start: startOf(behindKeys[0]), end: endOf(today) }).then((m) => m.get(id)!)
        : Promise.resolve(null),
    ]);

    const s = settings as { businessHours?: { day: string; open?: string; close?: string; closed?: boolean }[] } | null;
    const pick = (rows: DayRow[] | null, keys: string[]) => {
      const map = new Map((rows ?? []).map((r) => [r._id, r]));
      return keys.map((date) => {
        const r = map.get(date);
        return { date, booked: r?.booked ?? 0, seen: r?.seen ?? 0, noShow: r?.noShow ?? 0 };
      });
    };

    return NextResponse.json({
      success: true,
      data: {
        today,
        now: formatInTz(now, 'HH:mm', tz),
        businessHours: (s?.businessHours ?? []).map((h) => ({ day: String(h.day), open: h.open ?? null, close: h.close ?? null, closed: Boolean(h.closed) })),
        ahead: ahead ? pick(ahead, aheadKeys).map(({ date, booked }) => ({ date, booked })) : null,
        activity:
          behind && stats
            ? {
                days: pick(behind, behindKeys).map(({ date, booked, seen, noShow }) => ({ date, booked, seen, noShow })),
                visits: stats.totalVisits,
                prescriptions: stats.totalPrescriptions,
                collected: stats.totalRevenue,
                billed: stats.totalBilled,
              }
            : null,
      },
    });
  } catch (error) {
    console.error('Error building the doctor overview:', error);
    return NextResponse.json({ success: false, error: 'Failed to load this doctor’s figures' }, { status: 500 });
  }
}
