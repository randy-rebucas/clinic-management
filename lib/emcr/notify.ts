import 'server-only';
import { sendSMS } from '@/lib/sms';
import { sendEmail, escapeHtml } from '@/lib/email';
import { normalizePhone } from '@/lib/phone';

/** Where patients get the app. Override with EMCR_APP_URL (store link or landing page). */
export function emcrAppUrl(): string {
  return process.env.EMCR_APP_URL || `${(process.env.NEXT_PUBLIC_APP_URL || 'https://myclinicsoft.com').replace(/\/$/, '')}/emcr`;
}

/**
 * Tell a patient how to sign in to eMCR, on the phone and email **the clinic has on file**. No
 * password or code is sent: signing in is by an SMS code to that same number, so the message is
 * useless to anyone else. Returns whether anything was delivered.
 */
export async function sendSignInInstructions(record: {
  firstName?: string;
  phone?: string | null;
  email?: string | null;
  clinicName?: string;
}): Promise<{ sms: boolean; email: boolean }> {
  const name = record.firstName ? `Hi ${record.firstName}, ` : '';
  const clinic = record.clinicName ? ` at ${record.clinicName}` : '';
  const url = emcrAppUrl();
  const phone = normalizePhone(record.phone ?? '');
  let sms = false;
  let email = false;

  if (phone) {
    const result = await sendSMS({
      to: phone,
      message: `${name}your records${clinic} are ready on eMCR. Get the app at ${url} and sign in with this mobile number; we'll text you a code.`,
    });
    sms = !!result.success;
  }
  if (record.email) {
    const result = await sendEmail({
      to: record.email,
      subject: 'Your records are ready on eMCR',
      html: `<p>${escapeHtml(name)}your records${escapeHtml(clinic)} are ready on eMCR.</p>
<p>Get the app at <a href="${escapeHtml(url)}">${escapeHtml(url)}</a> and sign in with the mobile number your clinic has on file. We'll text you a sign-in code.</p>
<p>If you didn't ask for this, you can ignore this email.</p>`,
    });
    email = !!result.success;
  }
  return { sms, email };
}
