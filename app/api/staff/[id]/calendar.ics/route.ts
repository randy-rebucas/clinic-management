import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { buildICalFeed } from '@/lib/ical';
import { runAsSystem } from '@/lib/tenant-context';
import prisma from '@/lib/prisma';

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

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Invalid ID', { status: 400 });
  }

  try {
    // This feed is a public, token-authenticated, cross-tenant lookup by
    // doctor id (no session/tenant to scope by) — mirrors the pre-Prisma
    // route, which queried Doctor/Appointment with no tenant filter either.
    const ical = await runAsSystem(async () => {
      const doctor = await prisma.doctor.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      });
      if (!doctor) return null;

      const doctorName = `Dr. ${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim();

      // Fetch upcoming + recent appointments (±6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAhead = new Date();
      sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

      const appointments = await prisma.appointment.findMany({
        where: {
          doctorId: id,
          status: { not: 'cancelled' },
          appointmentDate: { gte: sixMonthsAgo, lte: sixMonthsAhead },
        },
        include: {
          patient: { select: { firstName: true, lastName: true } },
        },
      });

      const events = appointments.map((appt) => {
        const patient = appt.patient;
        const patientName = patient
          ? `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim()
          : 'Unknown Patient';

        // Determine start datetime
        let dtstart: Date;
        if (appt.scheduledAt) {
          dtstart = new Date(appt.scheduledAt);
        } else if (appt.appointmentDate && appt.appointmentTime) {
          const [h, m] = appt.appointmentTime.split(':').map(Number);
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
          uid: `appt-${appt.id}@myclinicsoftware`,
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
      return buildICalFeed(calName, events);
    });

    if (ical === null) {
      return new NextResponse('Doctor not found', { status: 404 });
    }

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
