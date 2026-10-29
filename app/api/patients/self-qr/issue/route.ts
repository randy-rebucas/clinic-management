import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import logger from '@/lib/logger';
import { applyAuthRateLimits, applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { FAMILY_RELATIONSHIPS } from '@/lib/patient-family';
import { formatInviteCode, inviteLink, issueInvite } from '@/lib/emcr/invite';
import { issuePatientLoginQr, maskPhone } from '../../auth/shared';
import {
  answersMatch,
  eligibleRecord,
  readSelfQrTicket,
  recentVisitEvents,
  recordTenantId,
  relationOf,
  SELF_QR_TTL_SECONDS,
  ticketExpiredResponse,
} from '../../auth/self-qr';

const IssueSchema = z
  .object({
    ticket: z.string().min(1).max(1000),
    patientId: z.string().min(1).max(64),
    kind: z.enum(['login', 'invite']),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    answers: z
      .object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        patientCode: z.string().trim().max(64).optional(),
        lastVisitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        doctorId: z.string().min(1).max(64),
      })
      .strict(),
  })
  .strict();

const NO_MATCH =
  'Those answers don’t match our records. Check them against your latest prescription, or ask the front desk.';

/**
 * POST /api/patients/self-qr/issue
 * Body: { ticket, patientId, kind: 'login' | 'invite', relationship?,
 *         answers: { firstName, lastName, dateOfBirth, patientCode?, lastVisitDate, doctorId } }
 *
 * Step 3 of the self-serve QR page. With a ticket from verify (phone proven) and every answer
 * matching the record, issues:
 * - `login`: a single-use app sign-in QR, valid SELF_QR_TTL_SECONDS, not limited to one clinic
 *   → { qrData, expiresAt };
 * - `invite`: an app invite for this phone at the record's clinic → { code, link, expiresAt }.
 * A wrong answer is 400 `NO_MATCH` without saying which one; 5 tries per 15 minutes and 10 per
 * day per record.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const parsed = IssueSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Please answer every question.' }, { status: 400 });
  }
  const body = parsed.data;

  const ticket = readSelfQrTicket(body.ticket);
  if (!ticket) return ticketExpiredResponse();

  const rateKey = `selfqr-answers:${body.patientId}`;
  const limited =
    (await applyAuthRateLimits(request, rateKey)) || (await applyRateLimit(request, rateLimiters.emcrClaimDaily, rateKey));
  if (limited) return limited;

  try {
    const record = await eligibleRecord(ticket, body.patientId);
    if (!record) return NextResponse.json({ success: false, error: 'Person not found' }, { status: 403 });

    const events = await recentVisitEvents(record._id, ticket.tenantId);
    if (!answersMatch(record, events, body.answers)) {
      logger.info('Self-serve QR answers did not match', { patientId: body.patientId });
      return NextResponse.json({ success: false, code: 'NO_MATCH', error: NO_MATCH }, { status: 400 });
    }

    const tenantId = recordTenantId(record, ticket.tenantId);
    const relation = relationOf(record);
    let data: Record<string, unknown>;
    let description: string;

    if (body.kind === 'login') {
      // Not scoped to a clinic: the phone and the answers both prove this person (or their parent).
      const { qrData, expiresAt } = await issuePatientLoginQr(record._id, { ttlSeconds: SELF_QR_TTL_SECONDS });
      data = { kind: 'login', qrData, expiresAt };
      description = `Patient self-serve: single-use app sign-in QR issued (valid ${SELF_QR_TTL_SECONDS} seconds) after phone code and verification questions`;
    } else {
      if (!tenantId) return NextResponse.json({ success: false, error: 'Please ask the front desk for an invite.' }, { status: 409 });
      const { code, expiresAt } = await issueInvite({
        tenantId: new Types.ObjectId(tenantId),
        patientId: record._id,
        mode: relation === 'self' ? 'self' : 'guardian',
        phone: ticket.phone,
        channel: 'print',
        relationship: relation === 'child' ? body.relationship ?? 'child' : undefined,
      });
      data = { kind: 'invite', code: formatInviteCode(code), link: inviteLink(code), expiresAt };
      description = 'Patient self-serve: app invite issued after phone code and verification questions';
    }

    const { createAuditLog } = await import('@/lib/audit');
    after(() =>
      createAuditLog({
        userEmail: `self-serve ${maskPhone(ticket.phone)}`,
        userRole: relation === 'child' ? 'guardian' : 'patient',
        tenantId,
        action: 'create',
        resource: 'patient',
        resourceId: String(record._id),
        dataSubject: String(record._id),
        isSensitive: true,
        description,
      })
    );

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error issuing self-serve QR', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
