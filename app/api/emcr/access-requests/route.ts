import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { normalizePhone } from '@/lib/phone';
import { birthDay, firstNameMatches, normalizeName } from '@/lib/emcr/claim';
import { sendSignInInstructions } from '@/lib/emcr/notify';

const RequestSchema = z
  .object({
    tenantId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Choose your clinic.'),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: z.string().trim().email().max(200).optional(),
  })
  .strict();

/**
 * POST /api/emcr/access-requests (no sign-in)
 * Body: { tenantId, firstName, lastName, dateOfBirth: 'YYYY-MM-DD', contactPhone?, contactEmail? }
 *
 * "Request access" for someone who can't sign in with their phone. When the clinic has a record
 * with that name and birth date, sign-in instructions go to the phone/email **on that record**,
 * never to the contact typed here (anyone could type someone else's name). Otherwise the
 * request waits for the clinic's staff, who use the typed contact only to call the person back.
 * Always the same answer, sent before any lookup (the work runs in `after()`), so neither the
 * reply nor its timing tells who is a patient where. A repeat request for the same person keeps
 * the contact given first.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.auth);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Please choose your clinic and fill in your name and birth date.' }, { status: 400 });
  }
  const body = parsed.data;
  const contactPhone = body.contactPhone ? normalizePhone(body.contactPhone) : null;
  if (!contactPhone && !body.contactEmail) {
    return NextResponse.json({ success: false, error: 'Add a phone number or email so the clinic can reach you.' }, { status: 400 });
  }

  // Per person at a clinic, whatever the caller's IP: bounds texting one patient repeatedly.
  const perPerson = await applyRateLimit(
    request,
    rateLimiters.otpSend,
    `emcr-access:${body.tenantId}:${normalizeName(body.lastName)}:${body.dateOfBirth}`
  );
  if (perPerson) return perPerson;

  const generic = NextResponse.json({
    success: true,
    message:
      'Thank you. If the clinic has your record, we’ll send sign-in instructions to the phone number or email the clinic has on file. If not, the clinic will contact you.',
  });

  // Everything that depends on whether the person is a patient there happens after the answer is
  // sent: the reply (and how long it takes) is the same whether or not the clinic has them.
  after(() =>
    handleAccessRequest(body, contactPhone).catch((error) => logger.error('Error in eMCR access request', error as Error))
  );
  return generic;
}

type AccessRequestBody = z.infer<typeof RequestSchema>;

async function handleAccessRequest(body: AccessRequestBody, contactPhone: string | null): Promise<void> {
  await connectDB();
  const tenantId = new Types.ObjectId(body.tenantId);
  const tenant = await Tenant.findOne({ _id: tenantId, status: 'active' }).select('name displayName').lean<{ name?: string; displayName?: string } | null>();
  if (!tenant) return;

  const dayStart = new Date(`${body.dateOfBirth}T00:00:00Z`);
  const candidates = await Patient.find({
    tenantIds: tenantId,
    active: { $ne: false },
    dateOfBirth: { $gte: new Date(dayStart.getTime() - 14 * 3600 * 1000), $lt: new Date(dayStart.getTime() + 38 * 3600 * 1000) },
  })
    .select('firstName lastName dateOfBirth phone email')
    .limit(200)
    .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string; dateOfBirth?: Date; phone?: string; email?: string }[]>();
  const matches = candidates.filter(
    (p) =>
      birthDay(p.dateOfBirth) === body.dateOfBirth &&
      firstNameMatches(body.firstName, p.firstName) &&
      normalizeName(p.lastName) === normalizeName(body.lastName)
  );
  const match = matches.length === 1 ? matches[0] : null;

  if (match && (normalizePhone(match.phone ?? '') || match.email)) {
    const sent = await sendSignInInstructions({
      firstName: match.firstName,
      phone: match.phone,
      email: match.email,
      clinicName: tenant.displayName || tenant.name,
    });
    if (sent.sms || sent.email) {
      logger.info('eMCR access request answered automatically', { tenantId: body.tenantId, patientId: String(match._id) });
      return;
    }
  }

  // Nothing on file to reach them, or no single match: the clinic takes it from here. The contact
  // is kept from the first request: anyone who knows the name and birth date can send another,
  // and must not be able to redirect the clinic's callback to their own number.
  await EmcrAccessRequest.updateOne(
    {
      kind: 'access',
      tenantId,
      status: 'pending',
      firstName: body.firstName,
      lastName: body.lastName,
      dateOfBirth: dayStart,
    },
    {
      $setOnInsert: {
        kind: 'access',
        tenantId,
        status: 'pending',
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: dayStart,
        ...(contactPhone ? { contactPhone } : {}),
        ...(body.contactEmail ? { contactEmail: body.contactEmail.toLowerCase() } : {}),
      },
      ...(match ? { $set: { patientId: match._id } } : {}),
    },
    { upsert: true }
  );
  logger.info('eMCR access request queued for clinic', { tenantId: body.tenantId, matched: !!match });
}
