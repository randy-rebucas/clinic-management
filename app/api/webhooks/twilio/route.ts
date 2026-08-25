import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { runAsSystem } from '@/lib/tenant-context';
import { findPatientIdsByPhone } from '@/lib/data/patient';
import { findUpcomingAppointmentForPatients, updateAppointment } from '@/lib/data/appointment';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/webhooks/twilio
 *
 * Handles inbound SMS replies from patients.
 * Twilio calls this URL when a patient replies to an appointment reminder.
 *
 * Setup in Twilio Console:
 *   Phone Number → Messaging → A Message Comes In → Webhook → POST {BASE_URL}/api/webhooks/twilio
 *
 * Validates the Twilio signature to prevent spoofing.
 *
 * Patient workflow:
 *   Clinic sends: "Your appointment on Apr 10 at 9am. Reply YES to confirm, NO to cancel."
 *   Patient replies: "YES" → appointment confirmed
 *   Patient replies: "NO" → appointment cancelled
 */

/**
 * Verify Twilio webhook signature.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join('');
  const expectedSignature = createHmac('sha1', authToken)
    .update(url + paramString)
    .digest('base64');
  return expectedSignature === twilioSignature;
}

/**
 * Find the most recent pending/confirmed appointment for a phone number
 * within the next 7 days. Runs cross-tenant (runAsSystem) since this
 * unauthenticated webhook has no session-derived tenant to scope by.
 */
async function findUpcomingAppointmentByPhone(phone: string) {
  return runAsSystem(async () => {
    const patientIds = await findPatientIdsByPhone(phone);
    if (!patientIds.length) return null;

    const now = new Date();
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return findUpcomingAppointmentForPatients(patientIds, now, sevenDaysAhead);
  });
}

export async function POST(request: NextRequest) {
  try {
    // Parse form body (Twilio sends application/x-www-form-urlencoded)
    const body = await request.text();
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(body)) {
      params[k] = v;
    }

    // Validate Twilio signature in production
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken && process.env.NODE_ENV === 'production') {
      const twilioSignature = request.headers.get('x-twilio-signature') ?? '';
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
      if (!validateTwilioSignature(authToken, twilioSignature, url, params)) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const fromPhone = params['From'] ?? '';
    const rawBody = (params['Body'] ?? '').trim().toUpperCase();

    // Determine intent from message body
    const isConfirm = /^(YES|Y|CONFIRM|OK|1)$/.test(rawBody);
    const isCancel = /^(NO|N|CANCEL|2)$/.test(rawBody);

    if (!isConfirm && !isCancel) {
      // Unknown reply — send a helpful message back
      return twimlResponse(
        'Sorry, we did not understand your reply. Please reply YES to confirm or NO to cancel your appointment.'
      );
    }

    const appointment = await findUpcomingAppointmentByPhone(fromPhone);

    if (!appointment) {
      return twimlResponse(
        'We could not find an upcoming appointment associated with this number. Please contact the clinic directly.'
      );
    }

    const patient = appointment.patient as any;
    const apptDate = appointment.appointmentDate
      ? new Date(appointment.appointmentDate).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'your upcoming appointment';
    const apptTime = appointment.appointmentTime ?? '';

    if (isConfirm) {
      await runAsSystem(() => updateAppointment(appointment.id, { status: 'confirmed' }));

      // Notify staff via in-app notification
      if (appointment.tenantId) {
        await createNotification({
          tenantId: appointment.tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Appointment Confirmed via SMS',
          message: `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} confirmed their appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''}.`,
          actionUrl: `/appointments/${appointment.id}`,
        } as any);
      }

      return twimlResponse(
        `Thank you! Your appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''} has been confirmed. We look forward to seeing you.`
      );
    } else {
      await runAsSystem(() => updateAppointment(appointment.id, { status: 'cancelled' }));

      if (appointment.tenantId) {
        await createNotification({
          tenantId: appointment.tenantId,
          type: 'appointment',
          priority: 'high',
          title: 'Appointment Cancelled via SMS',
          message: `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} cancelled their appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''}.`,
          actionUrl: `/appointments/${appointment.id}`,
        } as any);
      }

      return twimlResponse(
        `Your appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''} has been cancelled. Please call us if you would like to reschedule.`
      );
    }
  } catch (error: any) {
    console.error('Error handling Twilio webhook:', error);
    return twimlResponse('Sorry, something went wrong. Please contact the clinic directly.');
  }
}

/** Return a TwiML MessagingResponse */
function twimlResponse(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
