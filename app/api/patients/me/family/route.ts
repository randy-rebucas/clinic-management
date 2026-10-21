import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { createAuditLog, recordPatientRefused } from '@/lib/audit';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import {
  addPhoneDependent,
  FAMILY_RELATIONSHIPS,
  findFamilySuggestions,
  listDependents,
  personRecordIds,
} from '@/lib/patient-family';
import { findAccountForSession, listAccountDependents } from '@/lib/emcr/account';
import { checkPhoneProof, otpFailureResponse, otpRequiredResponse } from '../../auth/shared';

type SelfRecord = { _id: unknown; firstName: string; lastName: string; active?: boolean; email?: string; tenantIds?: unknown[] };

async function loadSelf(patientId: string) {
  await connectDB();
  return Patient.findById(patientId).select('firstName lastName active email tenantIds').lean<SelfRecord | null>();
}

/**
 * GET /api/patients/me/family
 * The signed-in person, the family members they manage, and minors registered with their phone
 * number that they can add. Always about the signed-in person (`X-Patient-Profile` is ignored).
 * → { self: { id, firstName, lastName } | null, guardianOnly, members: FamilyMember[], suggestions: FamilySuggestion[] }
 * `self` is null (and `guardianOnly` true) for an eMCR account with no record of its own: the
 * session is signed in on one of `members`.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  try {
    const self = await loadSelf(session.patientId);
    if (!self) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    if (self.active === false) {
      await recordPatientRefused(self, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    // eMCR accounts may also hold dependents themselves (a parent with no record of their own).
    const account = session.acc ? await findAccountForSession(session) : null;
    const accountMembers = account ? await listAccountDependents(account) : [];

    if (session.rel === 'guardian') {
      // Signed in on a record the holder manages: there is no "self" profile.
      return NextResponse.json({ success: true, data: { self: null, guardianOnly: true, members: accountMembers, suggestions: [] } });
    }

    const ids = await personRecordIds(session.patientId);
    const [linkedMembers, suggestions] = await Promise.all([listDependents(ids), findFamilySuggestions(session.patientId)]);
    const seen = new Set(linkedMembers.map((m) => m.id));
    const members = [...linkedMembers, ...accountMembers.filter((m) => !seen.has(m.id))];

    return NextResponse.json({
      success: true,
      data: {
        self: { id: session.patientId, firstName: self.firstName, lastName: self.lastName },
        guardianOnly: false,
        members,
        suggestions,
      },
    });
  } catch (error) {
    logger.error('Error loading patient family', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load family members' }, { status: 500 });
  }
}

const AddSchema = z
  .object({
    key: z.string().trim().min(1).max(300),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    otp: z.string().trim().max(10).optional(),
  })
  .strict();

/**
 * POST /api/patients/me/family
 * Body: { key, relationship?, otp? }
 * Add a suggested minor (a `suggestions[].key` from GET). Needs proof of the phone: a sign-in by
 * SMS code in the last 15 minutes, or a fresh code sent as `otp` (else 400 OTP_REQUIRED).
 * 404 when the suggestion no longer applies. → the updated `members` list.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `patient-family:${session.patientId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Choose a family member to add.' }, { status: 400 });
  }

  try {
    const self = await loadSelf(session.patientId);
    if (!self) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    if (self.active === false) {
      await recordPatientRefused(self, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const proof = await checkPhoneProof(session, parsed.data.otp);
    if (!proof.ok) return otpFailureResponse(proof.reason);
    if (!proof.proven) return otpRequiredResponse();

    const dependentId = await addPhoneDependent(session.patientId, parsed.data.key, parsed.data.relationship);
    if (!dependentId) {
      return NextResponse.json(
        { success: false, error: 'We couldn’t find that family member any more. Pull to refresh and try again.' },
        { status: 404 }
      );
    }

    const dependent = await Patient.findById(dependentId).select('tenantIds').lean<{ tenantIds?: unknown[] } | null>();
    await createAuditLog({
      userId: session.patientId,
      userEmail: session.email,
      userRole: 'patient',
      tenantId: dependent?.tenantIds?.[0] as string | undefined,
      action: 'update',
      resource: 'patient',
      resourceId: dependentId,
      dataSubject: dependentId,
      description: 'Patient added a minor registered with their phone number to their family account',
      metadata: { guardianPatientId: session.patientId, relationship: parsed.data.relationship ?? 'child' },
    });

    const members = await listDependents(await personRecordIds(session.patientId));
    return NextResponse.json({ success: true, data: { members, addedId: dependentId } }, { status: 201 });
  } catch (error) {
    logger.error('Error adding family member', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to add family member' }, { status: 500 });
  }
}
