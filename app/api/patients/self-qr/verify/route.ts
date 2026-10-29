import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { normalizePhone } from '@/lib/phone';
import {
  consumePatientOtp,
  invalidTenantResponse,
  otpFailureResponse,
  parseOptionalTenantId,
  phoneFilter,
  phoneRateKey,
} from '../../auth/shared';
import { createSelfQrTicket, selfServePeople } from '../../auth/self-qr';

/**
 * POST /api/patients/self-qr/verify
 * Body: { phone, otp, tenantId? }   (the code from POST /api/patients/auth/otp/request)
 *
 * Step 2 of the self-serve QR page. Spends the SMS code and returns a 10-minute `ticket` plus
 * the people on this phone the caller may get a QR for. Nothing is issued yet: each person's
 * QR still needs the verification answers (POST /api/patients/self-qr/issue).
 */
export async function POST(request: NextRequest) {
  let body: { phone?: unknown; otp?: unknown; tenantId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const tenant = parseOptionalTenantId(body.tenantId);
  if (!tenant.ok) return invalidTenantResponse();
  if (!phone || !otp) {
    return NextResponse.json({ success: false, error: 'Enter your phone number and the code we sent.' }, { status: 400 });
  }

  const limited = await applyAuthRateLimits(request, `selfqr:${phoneRateKey(phone)}`);
  if (limited) return limited;

  try {
    const e164 = normalizePhone(phone);
    if (!e164) return otpFailureResponse('invalid');

    const filter: Record<string, unknown> = phoneFilter(phone);
    if (tenant.tenantId) filter.tenantIds = tenant.tenantId;
    const result = await consumePatientOtp(filter, otp);
    if (!result.ok) return otpFailureResponse(result.reason);

    const tenantId = tenant.tenantId ? String(tenant.tenantId) : undefined;
    const people = await selfServePeople(e164, tenantId);
    if (!people.length) return otpFailureResponse('invalid');

    const { token, expiresAt } = createSelfQrTicket(e164, tenantId);
    return NextResponse.json(
      { success: true, data: { ticket: token, expiresAt, people } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error verifying self-serve QR code', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
