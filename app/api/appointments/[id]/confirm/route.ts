import { NextRequest, NextResponse } from 'next/server';
import { processConfirmationResponse } from '@/lib/automations/appointment-confirmation';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { verifyAppointmentActionToken } from '@/lib/appointment-links';
import { isValidId } from '@/lib/api/tenant-session';

/**
 * Patient confirm/cancel links (sent by SMS/email).
 *
 * Links carry an HMAC token bound to the appointment id and action. GET only renders a
 * page with a button; the change happens on POST, so link scanners and previewers that
 * fetch URLs can't confirm or cancel appointments.
 */

type Params = { params: Promise<{ id: string }> };

function htmlPage(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; text-align: center; padding: 50px 16px; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
    .title { font-size: 24px; font-weight: bold; }
    .message { margin: 20px 0; }
    button { font-size: 16px; padding: 10px 24px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
    button.danger { background: #dc2626; }
  </style>
</head>
<body>
  <div class="container">${body}</div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

const invalidLink = () =>
  htmlPage('Invalid link', '<div class="title">Invalid or expired link</div><div class="message">Please contact the clinic to manage your appointment.</div>', 400);

async function resolve(request: NextRequest, params: Params['params']) {
  const { id: appointmentId } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';
  const token = searchParams.get('token');
  if (!isValidId(appointmentId) || (action !== 'yes' && action !== 'no')) return null;
  if (!verifyAppointmentActionToken(appointmentId, action, token)) return null;
  return { appointmentId, action: action as 'yes' | 'no', token: token as string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const link = await resolve(request, params);
    if (!link) return invalidLink();

    await connectDB();
    const appointment = await Appointment.findById(link.appointmentId).select('_id status').lean();
    if (!appointment) return invalidLink();

    const confirming = link.action === 'yes';
    const actionUrl = `/api/appointments/${link.appointmentId}/confirm?action=${link.action}&token=${encodeURIComponent(link.token)}`;
    return htmlPage(
      confirming ? 'Confirm appointment' : 'Cancel appointment',
      `<div class="title">${confirming ? 'Confirm your appointment' : 'Cancel your appointment'}</div>
       <div class="message">${confirming ? 'Tap the button below to confirm.' : 'Tap the button below to cancel this appointment.'}</div>
       <form method="POST" action="${actionUrl}">
         <button type="submit"${confirming ? '' : ' class="danger"'}>${confirming ? 'Confirm appointment' : 'Cancel appointment'}</button>
       </form>`
    );
  } catch (error: any) {
    console.error('Error rendering appointment confirmation:', error);
    return htmlPage('Error', '<div class="title">Something went wrong</div><div class="message">Please try again later.</div>', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const link = await resolve(request, params);
    if (!link) return invalidLink();

    await connectDB();
    const appointment = await Appointment.findById(link.appointmentId).select('_id tenantId').lean() as any;
    if (!appointment) return invalidLink();

    const result = await processConfirmationResponse(link.appointmentId, link.action, appointment.tenantId);
    if (!result.success) {
      return htmlPage('Unable to update', '<div class="title">We couldn\'t update this appointment</div><div class="message">Please contact the clinic.</div>', 400);
    }

    const statusMessage = result.status === 'confirmed'
      ? 'Your appointment has been confirmed!'
      : 'Your appointment has been cancelled.';

    return htmlPage(
      'Success',
      `<div class="title" style="color:#4CAF50">&#10003; Success</div><div class="message">${statusMessage}</div><p>You can close this window.</p>`
    );
  } catch (error: any) {
    console.error('Error processing appointment confirmation:', error);
    return htmlPage('Error', '<div class="title">Something went wrong</div><div class="message">Please try again later.</div>', 500);
  }
}
