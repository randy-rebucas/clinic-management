import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DocumentRequest, { DOCUMENT_REQUEST_KINDS } from '@/models/DocumentRequest';
import Patient from '@/models/Patient';
import '@/models/User';
import '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { KIND_LABELS, PURPOSE_LABELS, patientRequestStatus } from '@/lib/document-requests';
import { missingAbstractFields } from '@/lib/clinical-abstract';
import logger from '@/lib/logger';

const STATUSES = ['pending', 'released', 'declined', 'cancelled', 'revoked'] as const;

/**
 * GET /api/document-requests?status=pending|released|declined|cancelled|revoked&kind  (visits → read)
 * Patients' requests for documents from this clinic (medical records copies, medical
 * certificates, clinical abstracts). Pending ones oldest first (the order to answer them in),
 * the rest newest first.
 * → { requests: [...], pending }
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'visits', 'read');
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const status = params.get('status') || 'pending';
  const kind = params.get('kind');
  if (!(STATUSES as readonly string[]).includes(status) || (kind && !(DOCUMENT_REQUEST_KINDS as readonly string[]).includes(kind))) {
    return NextResponse.json({ success: false, error: 'Invalid filter' }, { status: 400 });
  }

  try {
    await connectDB();
    const [rows, pending] = await Promise.all([
      DocumentRequest.find({ tenantId: ctx.tenantObjectId, status, ...(kind ? { kind } : {}) })
        .populate({ path: 'decidedBy', select: 'name' })
        .populate({ path: 'abstractAuthor', select: 'name' })
        .populate({
          path: 'visit',
          select: 'visitCode date status provider treatmentPlan.followUp.instructions',
          match: { tenantId: ctx.tenantObjectId },
          populate: { path: 'provider', select: 'name' },
        })
        .sort({ createdAt: status === 'pending' ? 1 : -1 })
        .limit(200)
        .lean<any[]>(),
      DocumentRequest.countDocuments({ tenantId: ctx.tenantObjectId, status: 'pending' }),
    ]);
    const patients = rows.length
      ? await Patient.find(patientTenantFilter(ctx.tenantId, { _id: { $in: rows.map((r) => r.patient) } }))
          .select('firstName lastName patientCode dateOfBirth')
          .lean<any[]>()
      : [];
    const byId = new Map(patients.map((p) => [String(p._id), p]));

    const now = new Date();
    const requests = rows.map((r) => {
      const p = byId.get(String(r.patient));
      const v = r.visit;
      return {
        id: String(r._id),
        kind: r.kind,
        kindLabel: KIND_LABELS[r.kind as keyof typeof KIND_LABELS] ?? r.kind,
        requestCode: r.requestCode,
        status: r.status,
        expired: patientRequestStatus(r, now) === 'expired',
        purpose: r.purpose,
        purposeLabel: PURPOSE_LABELS[r.purpose as keyof typeof PURPOSE_LABELS] ?? r.purpose,
        purposeNote: r.purposeNote ?? null,
        periodFrom: r.periodFrom ?? null,
        periodTo: r.periodTo ?? null,
        // medical_certificate: the visit it certifies (null if it is gone).
        visit: v
          ? {
              id: String(v._id),
              visitCode: v.visitCode,
              date: v.date,
              status: v.status,
              provider: v.provider?.name ?? null,
              hasRecommendations: !!v.treatmentPlan?.followUp?.instructions,
            }
          : null,
        // clinical_abstract: whether it's written yet, and by whom.
        abstract:
          r.kind === 'clinical_abstract'
            ? {
                savedAt: r.abstractSavedAt ?? null,
                author: r.abstractAuthor?.name ?? null,
                missing: missingAbstractFields(r.abstractSavedAt ? r.abstract : null),
              }
            : null,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt ?? null,
        decidedBy: r.decidedBy?.name ?? null,
        decisionNote: r.decisionNote ?? null,
        availableUntil: r.availableUntil ?? null,
        downloadCount: r.downloadCount ?? 0,
        lastDownloadedAt: r.lastDownloadedAt ?? null,
        patient: p
          ? {
              id: String(p._id),
              firstName: p.firstName,
              lastName: p.lastName,
              patientCode: p.patientCode ?? null,
              dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : null,
            }
          : null,
      };
    });
    return NextResponse.json({ success: true, data: { requests, pending } });
  } catch (error) {
    logger.error('Error listing document requests', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load document requests' }, { status: 500 });
  }
}
