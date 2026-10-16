import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { createNotification } from '@/lib/notifications';
import { normalizePhone } from '@/lib/phone';
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
 * Every request must carry a valid X-Twilio-Signature (TWILIO_AUTH_TOKEN is required).
 *
 * Patient workflow:
 *   Clinic sends: "Your appointment on Apr 10 at 9am. Reply YES to confirm, NO to cancel."
 *   Patient replies: "YES" → appointment confirmed
 *   Patient replies: "NO" → appointment cancelled
 */

/**
 * The URL Twilio signed: the public URL configured in the console. Behind a proxy
 * request.url is the internal address, so prefer the configured app URL.
 */
function signedUrl(request: NextRequest): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  if (base) {
    const { pathname, search } = new URL(request.url);
    return `${base}${pathname}${search}`;
  }
  return request.url;
}

/** Stored phone formats vary (local 09…, E.164, digits only); match all of them. */
function phoneVariants(raw: string): string[] {
  const variants = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) variants.add(trimmed);
  const e164 = normalizePhone(trimmed);
  if (e164) {
    variants.add(e164);
    variants.add(e164.slice(1));
    if (e164.startsWith('+63')) variants.add(`0${e164.slice(3)}`);
  }
  return [...variants];
}

/**
 * Find the patient's next pending/confirmed appointment within 7 days. The SMS number is
 * shared by every clinic, so the clinic is inferred from the appointment; if replies could
 * belong to appointments at more than one clinic, nothing is changed.
 */
async function findUpcomingAppointmentByPhone(phone: string) {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return { appointment: null, ambiguous: false };

  const patients = await Patient.find({ phone: { $in: variants } })
    .select('_id tenantIds')
    .lean<Array<{ _id: Types.ObjectId; tenantIds?: Types.ObjectId[] }>>();

  if (!patients.length) return { appointment: null, ambiguous: false };

  const patientTenants = new Map(
    patients.map((p) => [String(p._id), new Set((p.tenantIds || []).map(String))])
  );

  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const appointments = (await Appointment.find({
    patient: { $in: patients.map((p) => p._id) },
    tenantId: { $exists: true, $ne: null },
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
    appointmentDate: { $gte: now, $lte: sevenDaysAhead },
  })
    .sort({ appointmentDate: 1 })
    .populate('patient', 'firstName lastName')
    .lean()) as any[];

  // Only appointments whose patient actually belongs to the appointment's clinic.
  const eligible = appointments.filter((a) => {
    const patientId = String(a.patient?._id ?? a.patient);
    return patientTenants.get(patientId)?.has(String(a.tenantId));
  });

  if (!eligible.length) return { appointment: null, ambiguous: false };

  const tenants = new Set(eligible.map((a) => String(a.tenantId)));
  if (tenants.size > 1) return { appointment: null, ambiguous: true };

  return { appointment: eligible[0], ambiguous: false };
}

export async function POST(request: NextRequest) {
  // Parse form body (Twilio sends application/x-www-form-urlencoded)
  let params: Record<string, string>;
  try {
    const body = await request.text();
    params = {};
    for (const [k, v] of new URLSearchParams(body)) {
      params[k] = v;
    }
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[Twilio webhook] TWILIO_AUTH_TOKEN is not configured; rejecting request');
    return new NextResponse('Service Unavailable', { status: 503 });
  }

  const twilioSignature = request.headers.get('x-twilio-signature') ?? '';
  if (!twilioSignature || !validateRequest(authToken, twilioSignature, signedUrl(request), params)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const fromPhone = params['From'] ?? '';
    const rawBody = (params['Body'] ?? '').trim().toUpperCase();

    // Determine intent from message body
    const isConfirm = /^(YES|Y|CONFIRM|OK|1)$/.test(rawBody);
    const isCancel = /^(NO|N|CANCEL|2)$/.test(rawBody);

    if (!isConfirm && !isCancel) {
      return twimlResponse(
        'Sorry, we did not understand your reply. Please reply YES to confirm or NO to cancel your appointment.'
      );
    }

    await connectDB();

    const { appointment, ambiguous } = await findUpcomingAppointmentByPhone(fromPhone);

    if (ambiguous) {
      return twimlResponse(
        'You have upcoming appointments at more than one clinic. Please contact the clinic directly to confirm or cancel.'
      );
    }

    if (!appointment) {
      return twimlResponse(
        'We could not find an upcoming appointment associated with this number. Please contact the clinic directly.'
      );
    }

    const patient = appointment.patient as any;
    const tenantObjectId = new Types.ObjectId(String(appointment.tenantId));
    const apptDate = appointment.appointmentDate
      ? new Date(appointment.appointmentDate).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'your upcoming appointment';
    const apptTime = appointment.appointmentTime ?? '';
    const when = `${apptDate}${apptTime ? ` at ${apptTime}` : ''}`;
    const patientName = `${patient?.firstName ?? 'Patient'} ${patient?.lastName ?? ''}`.trim();

    const newStatus = isConfirm ? 'confirmed' : 'cancelled';
    await Appointment.updateOne(
      { _id: appointment._id, tenantId: tenantObjectId },
      { $set: { status: newStatus } }
    );

    if (appointment.createdBy) {
      try {
        await createNotification({
          tenantId: tenantObjectId,
          userId: appointment.createdBy,
          type: 'appointment',
          priority: isConfirm ? 'normal' : 'high',
          title: isConfirm ? 'Appointment Confirmed via SMS' : 'Appointment Cancelled via SMS',
          message: `${patientName} ${isConfirm ? 'confirmed' : 'cancelled'} their appointment on ${when}.`,
          actionUrl: `/appointments/${appointment._id}`,
        } as any);
      } catch (notifyError) {
        console.error('[Twilio webhook] Failed to create staff notification:', notifyError);
      }
    }

    return twimlResponse(
      isConfirm
        ? `Thank you! Your appointment on ${when} has been confirmed. We look forward to seeing you.`
        : `Your appointment on ${when} has been cancelled. Please call us if you would like to reschedule.`
    );
  } catch (error: any) {
    console.error('Error handling Twilio webhook:', error);
    return twimlResponse('Sorry, something went wrong. Please contact the clinic directly.');
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Return a TwiML MessagingResponse */
function twimlResponse(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
