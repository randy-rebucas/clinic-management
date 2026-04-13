import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import { buildICalFeed } from '@/lib/ical';
import { Types } from 'mongoose';

/**
 * GET /api/staff/[id]/calendar.ics?token=<hmac>
 *
 * Returns an iCalendar feed of the doctor's appointments.
 * The token is HMAC-SHA256(doctorId, SESSION_SECRET) — stateless, no schema change needed.
 * Calendar apps subscribe to this URL directly.
 *
 * Generate the subscribe URL for a doctor:
 *   const token = createHmac('sha256', SESSION_SECRET).update(doctorId).digest('hex');
 *   const url = `${BASE_URL}/api/staff/${doctorId}/calendar.ics?token=${token}`;
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get('token');

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new NextResponse('Server misconfiguration', { status: 503 });
  }

  // Verify HMAC token
  const expected = createHmac('sha256', secret).update(id).digest('hex');
  if (!token || token !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!Types.ObjectId.isValid(id)) {
    return new NextResponse('Invalid ID', { status: 400 });
  }

  try {
    await connectDB();

    const doctor = await Doctor.findById(id).select('firstName lastName').lean() as any;
    if (!doctor) {
      return new NextResponse('Doctor not found', { status: 404 });
    }

    const doctorName = `Dr. ${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim();

    // Fetch upcoming + recent appointments (±6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAhead = new Date();
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

    const appointments = await Appointment.find({
      doctor: new Types.ObjectId(id),
      status: { $nin: ['cancelled'] },
      appointmentDate: { $gte: sixMonthsAgo, $lte: sixMonthsAhead },
    })
      .populate('patient', 'firstName lastName')
      .lean() as any[];

    const events = appointments.map((appt: any) => {
      const patient = appt.patient;
      const patientName = patient
        ? `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim()
        : 'Unknown Patient';

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

      const descParts = [
        appt.reason ? `Reason: ${appt.reason}` : '',
        appt.notes ? `Notes: ${appt.notes}` : '',
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
