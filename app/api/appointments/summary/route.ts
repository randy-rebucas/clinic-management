import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { combineDateAndTimeInTz, formatInTz, monthRangeInTz } from '@/lib/tz';

/**
 * GET /api/appointments/summary?month=yyyy-MM[&doctorId=]
 *
 * Per-day booking load for one clinic-local month, plus what the schedule board needs
 * to draw any day: business hours, default duration, and the clinic's today/now.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();

    const monthParam = searchParams.get('month');
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : formatInTz(now, 'yyyy-MM', tz);
    const { start, end } = monthRangeInTz(combineDateAndTimeInTz(`${month}-15`, '12:00', tz), tz);

    const match: Record<string, unknown> = { tenantId: tenantObjectId, appointmentDate: { $gte: start, $lte: end } };
    const doctorId = searchParams.get('doctorId');
    if (doctorId) {
      if (!isValidId(doctorId)) return NextResponse.json({ success: false, error: 'Invalid doctor' }, { status: 400 });
      match.doctor = new Types.ObjectId(doctorId);
    }

    const notCancelled = { $ne: ['$status', 'cancelled'] };
    const [rows, settings] = await Promise.all([
      Appointment.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate', timezone: tz } },
            booked: { $sum: { $cond: [notCancelled, 1, 0] } },
            walkIns: { $sum: { $cond: [{ $and: [notCancelled, { $eq: ['$isWalkIn', true] }] }, 1, 0] } },
            cancelled: { $sum: { $cond: [notCancelled, 0, 1] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      getSettings(tenantId).catch(() => null),
    ]);

    const s = settings as {
      businessHours?: { day: string; open?: string; close?: string; closed?: boolean }[];
      appointmentSettings?: { defaultDuration?: number };
    } | null;
    const businessHours = (s?.businessHours ?? []).map((h) => ({
      day: String(h.day),
      open: h.open ?? null,
      close: h.close ?? null,
      closed: Boolean(h.closed),
    }));

    return NextResponse.json({
      success: true,
      data: {
        month,
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        now: formatInTz(now, 'HH:mm', tz),
        defaultDuration: s?.appointmentSettings?.defaultDuration || 30,
        businessHours,
        days: rows.map((r: { _id: string; booked: number; walkIns: number; cancelled: number }) => ({
          date: r._id,
          booked: r.booked,
          walkIns: r.walkIns,
          cancelled: r.cancelled,
        })),
      },
    });
  } catch (error) {
    console.error('Error building appointment summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the appointment calendar' }, { status: 500 });
  }
}
