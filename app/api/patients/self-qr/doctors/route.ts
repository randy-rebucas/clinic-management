import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { doctorChoices, eligibleRecord, readSelfQrTicket, ticketExpiredResponse } from '../../auth/self-qr';

/**
 * POST /api/patients/self-qr/doctors
 * Body: { ticket, patientId }
 *
 * The doctors to choose from for "who did you see at your last visit?": the real ones mixed with
 * others from the same clinic, shuffled. Empty when the person has no visit on file (they then
 * need the front desk). Requires the ticket from verify, so the phone is already proven.
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
    const doctors = await doctorChoices(record, ticket.tenantId);
    return NextResponse.json({ success: true, data: { doctors } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error listing self-serve QR doctors', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
