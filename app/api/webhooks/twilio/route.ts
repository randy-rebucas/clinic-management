import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { Types } from 'mongoose';

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
 * within the next 7 days.
 */
async function findUpcomingAppointmentByPhone(phone: string) {
  const normalised = phone.replace(/\s+/g, '');
  const patients = await Patient.find({
    $or: [{ phone: normalised }, { phone: phone }],
  })
    .select('_id')
    .lean();

  if (!patients.length) return null;

  const patientIds = patients.map((p) => p._id);
  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return Appointment.findOne({
    patient: { $in: patientIds },
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
    appointmentDate: { $gte: now, $lte: sevenDaysAhead },
  })
    .sort({ appointmentDate: 1 })
    .populate('patient', 'firstName lastName phone')
    .lean() as any;
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

    await connectDB();

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
      await Appointment.findByIdAndUpdate(appointment._id, { status: 'confirmed' });

      // Notify staff via in-app notification
      if (appointment.tenantId) {
        await createNotification({
          tenantId: new Types.ObjectId(appointment.tenantId.toString()),
          type: 'appointment',
          priority: 'normal',
          title: 'Appointment Confirmed via SMS',
          message: `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} confirmed their appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''}.`,
          actionUrl: `/appointments/${appointment._id}`,
        } as any);
      }

      return twimlResponse(
        `Thank you! Your appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''} has been confirmed. We look forward to seeing you.`
      );
    } else {
      await Appointment.findByIdAndUpdate(appointment._id, { status: 'cancelled' });

      if (appointment.tenantId) {
        await createNotification({
          tenantId: new Types.ObjectId(appointment.tenantId.toString()),
          type: 'appointment',
          priority: 'high',
          title: 'Appointment Cancelled via SMS',
          message: `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''} cancelled their appointment on ${apptDate}${apptTime ? ` at ${apptTime}` : ''}.`,
          actionUrl: `/appointments/${appointment._id}`,
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
