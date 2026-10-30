import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import { createAuditLog } from '@/lib/audit';
import DocumentRequest, { DOCUMENT_REQUEST_KINDS, DOCUMENT_REQUEST_PURPOSES } from '@/models/DocumentRequest';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { getTenantContext } from '@/lib/tenant';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { formatCode, maxCodeSeed, nextSequence } from '@/lib/counters';
import {
  DOCUMENT_AVAILABLE_DAYS,
  KIND_CODE_PREFIX,
  KIND_LABELS,
  KIND_PURPOSES,
  PURPOSE_LABELS,
  toPatientDocumentRequest,
} from '@/lib/document-requests';
import { memberTenantIds, resolveTenantFilter } from '../_lib/patient-scope';
import { recordAtClinic } from '../_lib/linked-records';
import { clinicNames } from '../_lib/clinic-names';
import { signedInPatient } from './_lib/request-scope';

const VISIT_POPULATE = { path: 'visit', select: 'visitCode date' } as const;

/**
 * GET /api/patients/me/document-requests?tenantId&kind
 * This person's document requests (medical records copies, medical certificates) at their
 * clinics, newest first (the last 50). → { requests, availableDays, purposes }
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'records');
  if (locked) return locked;

  try {
    const me = await signedInPatient(request, session.patientId);
    if (me instanceof NextResponse) return me;
    const params = request.nextUrl.searchParams;
    const tenant = resolveTenantFilter(me.linked.tenantIds, session, params.get('tenantId'));
    if (!tenant.ok) return tenant.response;
    const kind = params.get('kind');
    if (kind && !(DOCUMENT_REQUEST_KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json({ success: false, error: 'Invalid kind' }, { status: 400 });
    }

    const rows = await DocumentRequest.find({ patient: { $in: me.linked.patientIds }, ...tenant.filter, ...(kind ? { kind } : {}) })
      .select('-decidedBy -downloadCount -lastDownloadedAt -cutoff')
      .populate(VISIT_POPULATE)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<Record<string, any>[]>();
    const names = await clinicNames(rows.map((r) => r.tenantId));

    return NextResponse.json({
      success: true,
      data: {
        requests: rows.map((r) => toPatientDocumentRequest(r, names)),
        availableDays: DOCUMENT_AVAILABLE_DAYS,
        // What the request form offers for each kind.
        purposes: Object.fromEntries(
          DOCUMENT_REQUEST_KINDS.map((k) => [k, KIND_PURPOSES[k].map((value) => ({ value, label: PURPOSE_LABELS[value] }))])
        ),
      },
    });
  } catch (error) {
    logger.error('Error fetching patient document requests', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch your requests' }, { status: 500 });
  }
}

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be yyyy-MM-dd.');

const createSchema = z
  .object({
    kind: z.enum(DOCUMENT_REQUEST_KINDS),
    purpose: z.enum(DOCUMENT_REQUEST_PURPOSES),
    purposeNote: z.string().trim().max(500).optional(),
    /** medical_records, clinical_abstract: the clinic to ask. Optional when the person has records at one clinic only. */
    tenantId: zObjectId.optional(),
    /** medical_records: left out = from the first record / up to the latest. */
    periodFrom: day.optional(),
    periodTo: day.optional(),
    /** medical_certificate: the visit to certify (its clinic is the request's). */
    visitId: zObjectId.optional(),
  })
  .strict()
  .refine((b) => KIND_PURPOSES[b.kind].includes(b.purpose), { message: 'Choose one of the purposes offered.', path: ['purpose'] })
  .refine((b) => b.purpose !== 'other' || !!b.purposeNote, { message: 'Tell the clinic what it is for.', path: ['purposeNote'] })
  .refine((b) => b.kind !== 'medical_certificate' || !!b.visitId, { message: 'Choose the visit to certify.', path: ['visitId'] })
  .refine((b) => b.kind !== 'medical_certificate' || (!b.periodFrom && !b.periodTo && !b.tenantId), {
    message: 'A certificate is for one visit; leave out the clinic and period.',
    path: ['visitId'],
  })
  .refine((b) => b.kind === 'medical_certificate' || !b.visitId, { message: 'Only a certificate is for one visit.', path: ['visitId'] })
  .refine((b) => b.kind !== 'clinical_abstract' || (!b.periodFrom && !b.periodTo), {
    message: 'The doctor decides what the abstract covers; leave out the period.',
    path: ['periodFrom'],
  })
  .refine((b) => !b.periodFrom || !b.periodTo || b.periodFrom <= b.periodTo, {
    message: 'The start date must be on or before the end date.',
    path: ['periodTo'],
  });

const conflict = (code: string, error: string) => NextResponse.json({ success: false, code, error }, { status: 409 });
const clinicNotFound = () => NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });
const visitNotFound = () => NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });

/**
 * POST /api/patients/me/document-requests
 * - { kind: 'medical_records', purpose, purposeNote?, tenantId?, periodFrom?, periodTo? }
 * - { kind: 'medical_certificate', purpose, purposeNote?, visitId }
 * - { kind: 'clinical_abstract', purpose, purposeNote?, tenantId? }
 * Ask a clinic for a document. Staff review it on the Document requests page; once released,
 * POST /:id/pdf-link downloads it for DOCUMENT_AVAILABLE_DAYS. One pending request of each kind
 * per clinic. 400 CHOOSE_CLINIC when a records or abstract request could be for several clinics.
 * 409 ALREADY_PENDING. → 201 { request }
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'records');
  if (locked) return locked;

  try {
    const parsed = await parseBody(request, createSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const me = await signedInPatient(request, session.patientId);
    if (me instanceof NextResponse) return me;
    const clinics = memberTenantIds(me.linked.tenantIds, session).map(String);
    const ctx = await getTenantContext();

    let tenantId: Types.ObjectId;
    let patientId: Types.ObjectId | null;
    let visit: { _id: Types.ObjectId; visitCode?: string; date?: Date } | null = null;

    if (body.kind === 'medical_certificate') {
      // One of this person's own visits that the clinic has written up (not a draft or cancelled).
      visit = await Visit.findOne({
        _id: new Types.ObjectId(body.visitId),
        patient: { $in: me.linked.patientIds },
        tenantId: { $in: clinics.map((id) => new Types.ObjectId(id)) },
        status: { $in: ['open', 'closed'] },
      })
        .select('tenantId patient visitCode date')
        .lean<{ _id: Types.ObjectId; tenantId: Types.ObjectId; patient: Types.ObjectId; visitCode?: string; date?: Date } | null>();
      if (!visit) return visitNotFound();
      tenantId = (visit as any).tenantId;
      patientId = (visit as any).patient;
      if (ctx.tenantId && ctx.tenantId !== String(tenantId)) return visitNotFound();
    } else {
      const wanted = body.tenantId ?? (clinics.length === 1 ? clinics[0] : null);
      if (!wanted) {
        return NextResponse.json({ success: false, code: 'CHOOSE_CLINIC', error: 'Choose the clinic to ask.' }, { status: 400 });
      }
      if (!clinics.includes(wanted) || (ctx.tenantId && ctx.tenantId !== wanted)) return clinicNotFound();
      tenantId = new Types.ObjectId(wanted);
      // Each clinic keeps its own record of this person; the request is made on that one.
      patientId = recordAtClinic(me.linked, tenantId);
      if (!patientId) return clinicNotFound();
    }

    const already = 'You already have a request like this waiting at the clinic. Cancel it first to change it.';
    if (await DocumentRequest.exists({ tenantId, patient: patientId, kind: body.kind, status: 'pending' })) {
      return conflict('ALREADY_PENDING', already);
    }

    const prefix = KIND_CODE_PREFIX[body.kind];
    const seq = await nextSequence(
      tenantId,
      `document_request:${body.kind}`,
      maxCodeSeed(DocumentRequest, 'requestCode', { tenantId, kind: body.kind })
    );
    let created;
    try {
      created = await DocumentRequest.create({
        tenantId,
        patient: patientId,
        kind: body.kind,
        requestCode: formatCode(prefix, seq),
        purpose: body.purpose,
        purposeNote: body.purposeNote || undefined,
        ...(visit ? { visit: visit._id } : body.kind === 'medical_records' ? { periodFrom: body.periodFrom, periodTo: body.periodTo } : {}),
      });
    } catch (err: any) {
      // Two taps at once: the partial unique index keeps one pending request per kind and clinic.
      if (err?.code === 11000) return conflict('ALREADY_PENDING', already);
      throw err;
    }

    const what = visit
      ? `a medical certificate for visit ${visit.visitCode ?? ''}`.trim()
      : body.kind === 'clinical_abstract'
        ? 'a clinical abstract'
        : 'a copy of their medical records';
    after(async () => {
      await createAuditLog({
        tenantId: String(tenantId),
        userRole: 'patient',
        action: 'create',
        resource: 'patient',
        resourceId: String(patientId),
        dataSubject: String(patientId),
        requestMethod: 'POST',
        requestPath: request.nextUrl.pathname,
        ipAddress: getClientIp(request.headers),
        description: `Patient requested ${what} (${created.requestCode}, ${PURPOSE_LABELS[body.purpose]})`,
        metadata: {
          documentRequestId: String(created._id),
          kind: body.kind,
          ...(visit ? { visitId: String(visit._id) } : body.kind === 'medical_records' ? { periodFrom: body.periodFrom ?? null, periodTo: body.periodTo ?? null } : {}),
        },
      });
      try {
        const { sendPushToTenant } = await import('@/lib/push-notifications');
        await sendPushToTenant(String(tenantId), {
          title: `${KIND_LABELS[body.kind]} request`,
          // Never the visit code: push text passes through the browser vendor's servers.
          body: `A patient asked for ${visit ? 'a medical certificate' : what}.`,
          url: '/document-requests',
          tag: `document-request-${created._id}`,
        });
      } catch (error) {
        logger.error('Document request staff push failed', error as Error);
      }
    });

    const view = { ...created.toObject(), ...(visit ? { visit } : {}) };
    return NextResponse.json(
      { success: true, data: { request: toPatientDocumentRequest(view, await clinicNames([tenantId])) } },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Error creating patient document request', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t send your request. Please try again.' }, { status: 500 });
  }
}
