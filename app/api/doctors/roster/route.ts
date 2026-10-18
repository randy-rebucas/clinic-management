import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import '@/models/Specialization';
import { getPermissionChecker, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { combineDateAndTimeInTz, dayRangeInTz, formatInTz } from '@/lib/tz';
import { addDays, timeOffDate, weekStartOf } from '@/lib/doctors';

/**
 * GET /api/doctors/roster?week=yyyy-MM-dd
 *
 * One clinic week (Sunday to Saturday, the week holding `week`, this week by default): each
 * active or on-leave doctor's weekly hours and that week's time off, the clinic's business
 * hours, and, for roles that may read appointments, how many bookings each doctor has per day.
 * Counts come from one aggregation; no appointment records leave the server.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const can = await getPermissionChecker(session);
  if (!can('doctors', 'read')) {
    return refuseAccess(session, 'Unauthorized', 'doctors');
  }

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const today = formatInTz(now, 'yyyy-MM-dd', tz);
    const param = request.nextUrl.searchParams.get('week');
    const anchor = param && /^\d{4}-\d{2}-\d{2}$/.test(param) && !Number.isNaN(Date.parse(param)) ? param : today;
    const start = weekStartOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const from = combineDateAndTimeInTz(days[0], '00:00', tz);
    const to = dayRangeInTz(combineDateAndTimeInTz(days[6], '12:00', tz), tz).end;

    const withBookings = can('appointments', 'read');
    const [doctors, rows, settings] = await Promise.all([
      Doctor.find(tenantFilter(tenantId, { status: { $in: ['active', 'on-leave'] } }))
        .select('firstName lastName title status specializationId schedule availabilityOverrides')
        .populate('specializationId', 'name')
        .sort({ lastName: 1, firstName: 1 })
        .lean<any[]>(),
      withBookings
        ? Appointment.aggregate([
            { $match: { tenantId: tenantObjectId, appointmentDate: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
            {
              $group: {
                _id: { doctor: '$doctor', day: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate', timezone: tz } } },
                booked: { $sum: 1 },
                seen: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              },
            },
          ])
        : Promise.resolve([]),
      getSettings(tenantId).catch(() => null),
    ]);

    const bookings: Record<string, Record<string, { booked: number; seen: number }>> = {};
    for (const r of rows as { _id: { doctor: unknown; day: string }; booked: number; seen: number }[]) {
      if (!r._id.doctor) continue;
      const id = String(r._id.doctor);
      (bookings[id] ??= {})[r._id.day] = { booked: r.booked, seen: r.seen };
    }

    const s = settings as { businessHours?: { day: string; open?: string; close?: string; closed?: boolean }[] } | null;
    const inWeek = new Set(days);

    return NextResponse.json({
      success: true,
      data: {
        today,
        now: formatInTz(now, 'HH:mm', tz),
        days,
        businessHours: (s?.businessHours ?? []).map((h) => ({ day: String(h.day), open: h.open ?? null, close: h.close ?? null, closed: Boolean(h.closed) })),
        bookings: withBookings ? bookings : null,
        doctors: doctors.map((d) => ({
          _id: String(d._id),
          firstName: d.firstName,
          lastName: d.lastName,
          title: d.title,
          status: d.status,
          specialty: d.specializationId?.name ?? null,
          schedule: (d.schedule ?? []).map((x: any) => ({ dayOfWeek: x.dayOfWeek, startTime: x.startTime, endTime: x.endTime, isAvailable: x.isAvailable !== false })),
          availabilityOverrides: (d.availabilityOverrides ?? [])
            .filter((o: any) => o.date && inWeek.has(timeOffDate(o.date)))
            .map((o: any) => ({ _id: String(o._id), date: new Date(o.date).toISOString(), isAvailable: o.isAvailable, startTime: o.startTime, endTime: o.endTime, reason: o.reason })),
        })),
      },
    });
  } catch (error) {
    console.error('Error building the doctors roster:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the week’s roster' }, { status: 500 });
  }
}
