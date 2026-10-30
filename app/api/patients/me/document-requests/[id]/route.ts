import { NextRequest, NextResponse, after } from 'next/server';
import { createAuditLog } from '@/lib/audit';
import DocumentRequest from '@/models/DocumentRequest';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { toPatientDocumentRequest } from '@/lib/document-requests';
import { clinicNames } from '../../_lib/clinic-names';
import { ownedDocumentRequest, requestNotFound, signedInPatient } from '../_lib/request-scope';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/patients/me/document-requests/:id
 * Withdraw a request the clinic hasn't answered yet. 409 NOT_PENDING once it was released,
 * declined or already cancelled. → { request }
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'records');
  if (locked) return locked;

  try {
    const { id } = await params;
    const me = await signedInPatient(request, session.patientId);
    if (me instanceof NextResponse) return me;
    const found = await ownedDocumentRequest(id, me.linked, session);
    if (!found) return requestNotFound();

    const updated = await DocumentRequest.findOneAndUpdate(
      { _id: found._id, status: 'pending' },
      { $set: { status: 'cancelled', decidedAt: new Date() } },
      { new: true }
    )
      .populate({ path: 'visit', select: 'visitCode date' })
      .lean<Record<string, any> | null>();
    if (!updated) {
      return NextResponse.json(
        { success: false, code: 'NOT_PENDING', error: 'The clinic has already answered this request.' },
        { status: 409 }
      );
    }

    after(() =>
      createAuditLog({
        tenantId: String(found.tenantId),
        userRole: 'patient',
        action: 'update',
        resource: 'patient',
        resourceId: String(found.patient),
        dataSubject: String(found.patient),
        requestMethod: 'DELETE',
        requestPath: request.nextUrl.pathname,
        ipAddress: getClientIp(request.headers),
        description: `Patient cancelled document request ${found.requestCode}`,
        metadata: { documentRequestId: String(found._id), kind: found.kind },
      })
    );

    return NextResponse.json({ success: true, data: { request: toPatientDocumentRequest(updated, await clinicNames([updated.tenantId])) } });
  } catch (error) {
    logger.error('Error cancelling patient document request', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t cancel the request. Please try again.' }, { status: 500 });
  }
}
