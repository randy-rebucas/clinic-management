import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { revokePatientLoginQr } from '../../auth/shared';
import { eligibleRecord, readSelfQrTicket, ticketExpiredResponse } from '../../auth/self-qr';

/**
 * POST /api/patients/self-qr/revoke
 * Body: { ticket, patientId }
 *
 * Called when the self-serve page leaves the QR screen (countdown over, "Done", idle), so a
 * photo of the screen can't be used afterwards. Sessions already started from it are kept.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;

  let body: { ticket?: unknown; patientId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const ticket = readSelfQrTicket(body.ticket);
  if (!ticket) return ticketExpiredResponse();

  try {
    const record = await eligibleRecord(ticket, body.patientId);
    if (!record) return NextResponse.json({ success: false, error: 'Person not found' }, { status: 403 });
    await revokePatientLoginQr(record._id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error revoking self-serve QR', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
