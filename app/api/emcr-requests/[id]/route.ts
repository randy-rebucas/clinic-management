import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import { parseBody, isValidationError } from '@/lib/api/validate';
import logger from '@/lib/logger';
import { addClinicGuardian } from '@/lib/patient-family';
import { forgetAccountCache, type EmcrAccountLean } from '@/lib/emcr/account';
import { sendSignInInstructions } from '@/lib/emcr/notify';

const DecideSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    /** Access requests: the clinic record that is this person (staff pick it). */
    patientId: z.string().refine((v) => Types.ObjectId.isValid(v)).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * PATCH /api/emcr-requests/[id]  (patients → write)
 * Body: { action: 'approve' | 'reject', patientId?, note? }
 *
 * - access, approve: send eMCR sign-in instructions to the phone/email **on the patient's
 *   record** (`patientId`, or the record matched when the request came in). Fix the record's
 *   contact details first; 409 NO_CONTACT when it has neither.
 * - adult_profile, approve: after confirming consent in person, the account holder may manage
 *   this patient's records (a clinic family link, which does not lapse).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'write');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Request');
  const parsed = await parseBody(request, DecideSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  try {
    await connectDB();
    const req = await EmcrAccessRequest.findOne({ _id: id, tenantId: ctx.tenantObjectId }).lean<any>();
    if (!req) return notFound('Request');
    if (req.status !== 'pending') return NextResponse.json({ success: false, error: 'This request was already handled.' }, { status: 409 });

    const decided = { decidedBy: new Types.ObjectId(ctx.session.userId), decidedAt: new Date(), ...(body.note ? { note: body.note } : {}) };

    if (body.action === 'reject') {
      await EmcrAccessRequest.updateOne({ _id: req._id, status: 'pending' }, { $set: { status: 'rejected', ...decided } });
      await audit(ctx, request, req, 'rejected');
      return NextResponse.json({ success: true });
    }

    const patientId = body.patientId ?? (req.patientId ? String(req.patientId) : null);
    if (!patientId) return NextResponse.json({ success: false, error: 'Choose the patient record this request is for.' }, { status: 400 });
    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: patientId, active: { $ne: false } }))
      .select('firstName phone email')
      .lean<{ _id: Types.ObjectId; firstName?: string; phone?: string; email?: string } | null>();
    if (!patient) return notFound('Patient');

    if (req.kind === 'access') {
      const tenant = await Tenant.findById(ctx.tenantObjectId).select('name displayName').lean<{ name?: string; displayName?: string } | null>();
      const sent = await sendSignInInstructions({
        firstName: patient.firstName,
        phone: patient.phone,
        email: patient.email,
        clinicName: tenant?.displayName || tenant?.name,
      });
      if (!sent.sms && !sent.email) {
        return NextResponse.json(
          { success: false, code: 'NO_CONTACT', error: 'Add a mobile number or email to the patient’s record first, then approve again.' },
          { status: 409 }
        );
      }
      await EmcrAccessRequest.updateOne({ _id: req._id, status: 'pending' }, { $set: { status: 'approved', patientId: patient._id, ...decided } });
      await audit(ctx, request, req, 'approved', patient._id);
      return NextResponse.json({ success: true, data: { sentBy: sent.sms ? 'sms' : 'email' } });
    }

    // adult_profile
    const account = await EmcrAccount.findById(req.accountId).lean<EmcrAccountLean | null>();
    if (!account || account.disabled) return NextResponse.json({ success: false, error: 'The eMCR account no longer exists.' }, { status: 409 });
    if (account.selfPatientId) {
      await addClinicGuardian({
        dependentId: patient._id,
        guardianId: account.selfPatientId,
        tenantId: ctx.tenantObjectId,
        relationship: req.relationship,
        addedBy: ctx.session.userId,
      });
    } else {
      await EmcrAccount.updateOne(
        { _id: account._id },
        { $pull: { dependents: { patientId: patient._id } } }
      );
      await EmcrAccount.updateOne(
        { _id: account._id },
        { $push: { dependents: { patientId: patient._id, relationship: req.relationship, source: 'clinic', tenantId: ctx.tenantObjectId, addedAt: new Date() } } }
      );
      forgetAccountCache();
    }
    // Settles duplicates of this request at this clinic only: the link opens just this clinic's
    // records, so each other clinic still checks consent at its own desk.
    await EmcrAccessRequest.updateMany(
      { kind: 'adult_profile', accountId: account._id, tenantId: ctx.tenantObjectId, status: 'pending', $or: [{ _id: req._id }, { patientId: patient._id }, { firstName: req.firstName, dateOfBirth: req.dateOfBirth }] },
      { $set: { status: 'approved', ...decided } }
    );
    await audit(ctx, request, req, 'approved', patient._id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deciding eMCR request', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to update the request' }, { status: 500 });
  }
}

async function audit(ctx: { session: any; tenantId: string }, request: NextRequest, req: any, outcome: string, patientId?: Types.ObjectId) {
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'update',
    resource: 'patient',
    resourceId: patientId ?? req.patientId,
    dataSubject: patientId ?? req.patientId,
    requestMethod: 'PATCH',
    requestPath: request.nextUrl.pathname,
    description:
      req.kind === 'access'
        ? `eMCR access request ${outcome}${outcome === 'approved' ? ': sign-in instructions sent to the contact on file' : ''}`
        : `eMCR request to manage this patient’s records ${outcome}${req.relationship ? ` (${req.relationship})` : ''}`,
    metadata: { emcrRequestId: String(req._id), kind: req.kind },
  });
}
