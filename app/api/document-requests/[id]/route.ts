import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import DocumentRequest from '@/models/DocumentRequest';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import DocumentSeal from '@/models/DocumentSeal';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { availableUntilFrom, DOCUMENT_AVAILABLE_DAYS, KIND_LABELS } from '@/lib/document-requests';
import { ABSTRACT_LABELS, missingAbstractFields } from '@/lib/clinical-abstract';
import { canIssueMedicalCertificates } from '@/lib/doctor-access';
import logger from '@/lib/logger';

const DecideSchema = z
  .object({
    action: z.enum(['release', 'decline', 'revoke']),
    /** Shown to the patient when declining or withdrawing. Required to decline. */
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => b.action !== 'decline' || !!b.note, { message: 'Tell the patient why the request was declined.', path: ['note'] });

const ALLOWED_FROM = { release: 'pending', decline: 'pending', revoke: 'released' } as const;
const NEXT_STATUS = { release: 'released', decline: 'declined', revoke: 'revoked' } as const;

const unavailable = (error: string) => NextResponse.json({ success: false, error }, { status: 409 });

/**
 * PATCH /api/document-requests/[id]  (visits → write)
 * Body: { action: 'release' | 'decline' | 'revoke', note? }
 *
 * - release (pending): the patient can download the sealed document for DOCUMENT_AVAILABLE_DAYS.
 *   A records copy covers the requested period up to now; a certificate prints what its visit
 *   says when downloaded, so fix the visit first; an abstract needs its required sections saved
 *   (PUT /:id/abstract), else 409 ABSTRACT_INCOMPLETE.
 * - decline (pending): `note` is required and shown to the patient.
 * - revoke (released): the download stops working and copies already downloaded stop verifying
 *   (a records copy's seal reads as withdrawn; a certificate's patient-copy seals issued since the
 *   release are revoked).
 * 409 when the request is no longer in the state the action needs, or can't be issued.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'visits', 'write');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Request');
  const parsed = await parseBody(request, DecideSchema);
  if (isValidationError(parsed)) return parsed;
  const { action, note } = parsed.data;

  try {
    await connectDB();
    const found = await DocumentRequest.findOne({ _id: id, tenantId: ctx.tenantObjectId }).lean<any>();
    if (!found) return notFound('Request');

    const now = new Date();
    const set: Record<string, unknown> = {
      status: NEXT_STATUS[action],
      decidedBy: new Types.ObjectId(ctx.session.userId),
      decidedAt: now,
      ...(note ? { decisionNote: note } : {}),
    };
    if (action === 'release') {
      // A patient record that was erased or deactivated since the request came in can't be released.
      const patient = await Patient.exists(patientTenantFilter(ctx.tenantId, { _id: found.patient, active: { $ne: false } }));
      if (!patient) return unavailable('The patient record is no longer active.');
      if (found.kind === 'medical_certificate') {
        if (!(await canIssueMedicalCertificates(ctx.session))) {
          return NextResponse.json({ success: false, error: 'Only doctors and clinic admins can release medical certificates.' }, { status: 403 });
        }
        const visit = await Visit.exists({ _id: found.visit, tenantId: ctx.tenantObjectId, patient: found.patient, status: { $in: ['open', 'closed'] } });
        if (!visit) return unavailable('The visit was cancelled or is a draft again, so there is nothing to certify. Decline the request instead.');
      } else if (found.kind === 'clinical_abstract') {
        const missing = missingAbstractFields(found.abstractSavedAt ? found.abstract : null);
        if (missing.length) {
          return NextResponse.json(
            {
              success: false,
              code: 'ABSTRACT_INCOMPLETE',
              error: `Write and save the abstract first. Still empty: ${missing.map((f) => ABSTRACT_LABELS[f].toLowerCase()).join(', ')}.`,
            },
            { status: 409 }
          );
        }
      } else {
        set.cutoff = now;
      }
      set.availableUntil = availableUntilFrom(now);
    }

    const updated = await DocumentRequest.findOneAndUpdate(
      { _id: found._id, tenantId: ctx.tenantObjectId, status: ALLOWED_FROM[action] },
      { $set: set },
      { new: true }
    ).lean<any>();
    if (!updated) return unavailable('This request was already handled.');

    // A certificate's seal is the visit's, which stays true; void the patient copies issued
    // under this release instead. (Records copies are sealed on the request itself.)
    if (action === 'revoke' && found.kind === 'medical_certificate' && found.visit) {
      await DocumentSeal.updateMany(
        {
          tenantId: ctx.tenantObjectId,
          documentType: 'medical_certificate',
          documentId: found.visit,
          copyType: 'patient',
          issuedAt: { $gte: found.decidedAt ?? found.createdAt },
          revokedAt: { $exists: false },
        },
        {
          $set: {
            revokedAt: now,
            revokedBy: new Types.ObjectId(ctx.session.userId),
            revokedReason: (note || 'The clinic withdrew this certificate.').slice(0, 300),
          },
        }
      );
    }

    const label = KIND_LABELS[found.kind as keyof typeof KIND_LABELS] ?? 'Document';
    const subject = `${label.toLowerCase()} ${found.requestCode}`;
    after(async () => {
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: action === 'release' ? 'data_export' : 'update',
        resource: 'patient',
        resourceId: String(found.patient),
        dataSubject: String(found.patient),
        isSensitive: action === 'release',
        requestMethod: 'PATCH',
        requestPath: request.nextUrl.pathname,
        description:
          action === 'release'
            ? `Released ${subject} to the patient${
                found.kind === 'medical_records' ? ` (${found.periodFrom ?? 'first record'} to ${found.periodTo ?? 'release'})` : ''
              }, downloadable for ${DOCUMENT_AVAILABLE_DAYS} days`
            : action === 'decline'
              ? `Declined the request for ${subject}: ${note}`
              : `Withdrew released ${subject}${note ? `: ${note}` : ''}`,
        metadata: { documentRequestId: String(found._id), kind: found.kind, action },
      });

      if (action === 'revoke') return;
      try {
        const { sendPushToPatientDevices } = await import('@/lib/push-notifications');
        await sendPushToPatientDevices(
          String(found.patient),
          // Generic on purpose: lock screens and Apple/Google see this text.
          action === 'release'
            ? { title: `Your ${label.toLowerCase()} is ready`, body: 'It’s ready to download in the app.', tag: `document-request-${found._id}` }
            : { title: 'Request update', body: 'The clinic answered your document request.', tag: `document-request-${found._id}` },
          { tenantId: ctx.tenantObjectId }
        );
      } catch (error) {
        logger.error('Document request patient push failed', error as Error);
      }
    });

    return NextResponse.json({ success: true, data: { status: updated.status, availableUntil: updated.availableUntil ?? null } });
  } catch (error) {
    logger.error('Error deciding document request', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to update the request' }, { status: 500 });
  }
}
