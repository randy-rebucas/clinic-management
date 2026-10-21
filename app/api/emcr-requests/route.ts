import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';

/**
 * GET /api/emcr-requests?status=pending|approved|rejected  (patients → read)
 * eMCR requests waiting on this clinic: "Request access" forms it must answer, and account
 * holders asking to manage an adult patient's records (consent to confirm in person).
 * → { requests: [...], pending }
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'patients', 'read');
  if (denied) return denied;

  const status = request.nextUrl.searchParams.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  try {
    await connectDB();
    const [rows, pending] = await Promise.all([
      EmcrAccessRequest.find({ tenantId: ctx.tenantObjectId, status })
        .sort({ createdAt: status === 'pending' ? 1 : -1 })
        .limit(200)
        .lean<any[]>(),
      EmcrAccessRequest.countDocuments({ tenantId: ctx.tenantObjectId, status: 'pending' }),
    ]);
    const patientIds = rows.map((r) => r.patientId).filter(Boolean) as Types.ObjectId[];
    const patients = patientIds.length
      ? await Patient.find(patientTenantFilter(ctx.tenantId, { _id: { $in: patientIds }, active: { $ne: false } }))
          .select('firstName lastName patientCode dateOfBirth phone email')
          .lean<any[]>()
      : [];
    const byId = new Map(patients.map((p) => [String(p._id), p]));

    // adult_profile: who is asking, so staff can check consent with the right person.
    const accountIds = rows.filter((r) => r.kind === 'adult_profile' && r.accountId).map((r) => r.accountId);
    const accounts = accountIds.length
      ? await EmcrAccount.find({ _id: { $in: accountIds } }).select('phone selfPatientId').lean<any[]>()
      : [];
    const holderIds = accounts.map((a) => a.selfPatientId).filter(Boolean);
    const holderRecords = holderIds.length
      ? await Patient.find({ _id: { $in: holderIds } }).select('firstName lastName').lean<any[]>()
      : [];
    const holderName = new Map(holderRecords.map((h) => [String(h._id), `${h.firstName ?? ''} ${h.lastName ?? ''}`.trim()]));
    const holders = new Map(
      accounts.map((a) => [
        String(a._id),
        { name: a.selfPatientId ? holderName.get(String(a.selfPatientId)) ?? null : null, phone: a.phone ?? null },
      ])
    );

    const requests = rows.map((r) => {
      const p = r.patientId ? byId.get(String(r.patientId)) : null;
      return {
        id: String(r._id),
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt ?? null,
        note: r.note ?? null,
        relationship: r.relationship ?? null,
        firstName: r.firstName,
        lastName: r.lastName ?? null,
        dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth).toISOString().slice(0, 10) : null,
        contactPhone: r.contactPhone ?? null,
        contactEmail: r.contactEmail ?? null,
        // adult_profile: the eMCR account holder asking (name is null for a parent with no record).
        holder: r.kind === 'adult_profile' && r.accountId ? holders.get(String(r.accountId)) ?? null : null,
        patient: p
          ? {
              id: String(p._id),
              firstName: p.firstName,
              lastName: p.lastName,
              patientCode: p.patientCode ?? null,
              hasPhone: !!p.phone,
              hasEmail: !!p.email,
            }
          : null,
      };
    });
    return NextResponse.json({ success: true, data: { requests, pending } });
  } catch (error) {
    logger.error('Error listing eMCR requests', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load eMCR requests' }, { status: 500 });
  }
}
