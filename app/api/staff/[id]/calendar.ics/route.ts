import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { verifyCalendarFeedToken } from '@/app/lib/auth-helpers';
import { buildICalFeed } from '@/lib/ical';
import { Types } from 'mongoose';

/**
 * GET /api/staff/[id]/calendar.ics?token=<hmac>
 *
 * Returns an iCalendar feed of the doctor's appointments. Patient names are reduced to
 * initials because calendar providers store and sync this data outside the clinic.
 *
 * The token is calendarFeedToken(doctorId, sessionVersion) from app/lib/auth-helpers:
 * an HMAC with a key derived from SESSION_SECRET, bound to the linked user's
 * sessionVersion, so revokeUserSessions() also revokes existing feed links.
 *
 *   const url = `${BASE_URL}/api/staff/${doctorId}/calendar.ics?token=${calendarFeedToken(doctorId, user.sessionVersion ?? 0)}`;
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get('token');

  if (!process.env.SESSION_SECRET) {
    return new NextResponse('Server misconfiguration', { status: 503 });
  }

  if (!token || !Types.ObjectId.isValid(id)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    await connectDB();

    const linkedUser = await User.findOne({ doctorProfile: new Types.ObjectId(id) })
      .select('sessionVersion status')
      .lean<{ sessionVersion?: number; status?: string } | null>();
    if (
      !linkedUser ||
      linkedUser.status !== 'active' ||
      !verifyCalendarFeedToken(id, linkedUser.sessionVersion ?? 0, token)
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const doctor = await Doctor.findById(id).select('firstName lastName tenantId').lean() as any;
    if (!doctor) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const doctorName = `Dr. ${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim();

    // Fetch upcoming + recent appointments (±6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAhead = new Date();
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

    const appointments = await Appointment.find({
      ...(doctor.tenantId ? { tenantId: doctor.tenantId } : {}),
      doctor: new Types.ObjectId(id),
      status: { $nin: ['cancelled'] },
      appointmentDate: { $gte: sixMonthsAgo, $lte: sixMonthsAhead },
    })
      .populate('patient', 'firstName lastName')
      .lean() as any[];

    const events = appointments.map((appt: any) => {
      const patient = appt.patient;
      const patientName = patient
        ? [patient.firstName, patient.lastName]
            .map((n: unknown) => (typeof n === 'string' && n.trim() ? `${n.trim()[0].toUpperCase()}.` : ''))
            .join(' ')
            .trim() || 'Patient'
        : 'Patient';

      // Determine start datetime
      let dtstart: Date;
      if (appt.scheduledAt) {
        dtstart = new Date(appt.scheduledAt);
      } else if (appt.appointmentDate && appt.appointmentTime) {
        const [h, m] = (appt.appointmentTime as string).split(':').map(Number);
        dtstart = new Date(appt.appointmentDate);
        dtstart.setUTCHours(h, m, 0, 0);
      } else {
        dtstart = new Date(appt.appointmentDate ?? appt.createdAt);
      }

      const durationMs = (appt.duration ?? 30) * 60 * 1000;
      const dtend = new Date(dtstart.getTime() + durationMs);

      const statusMap: Record<string, 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'> = {
        confirmed: 'CONFIRMED',
        scheduled: 'CONFIRMED',
        pending: 'TENTATIVE',
        rescheduled: 'TENTATIVE',
      };

      // Reason/notes are clinical details; keep them out of third-party calendars
      const descParts = [
        appt.appointmentCode ? `Code: ${appt.appointmentCode}` : '',
      ].filter(Boolean);

      return {
        uid: `appt-${appt._id}@myclinicsoftware`,
        summary: `Appointment — ${patientName}`,
        description: descParts.join('\n'),
        dtstart,
        dtend,
        status: statusMap[appt.status] ?? 'CONFIRMED',
        location: appt.room ?? '',
        organizer: doctorName,
      };
    });

    const calName = `${doctorName}'s Schedule`;
    const ical = buildICalFeed(calName, events);

    return new NextResponse(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="schedule-${id}.ics"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error: any) {
    console.error('Error generating iCal feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
