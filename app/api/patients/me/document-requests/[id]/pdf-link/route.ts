import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { createDocumentRequestLinkToken } from '@/lib/document-request-link';
import { isDownloadable, patientRequestStatus } from '@/lib/document-requests';
import { requestOrigin } from '@/lib/signed-link';
import { ownedDocumentRequest, requestNotFound, signedInPatient } from '../../_lib/request-scope';

/**
 * POST /api/patients/me/document-requests/:id/pdf-link → { url, expiresAt }
 * A 10-minute link to the released document as a sealed PDF (GET /api/requested-documents/:token).
 * 409 NOT_RELEASED while pending, or once declined, cancelled or withdrawn; 410 EXPIRED after
 * the download window (ask again).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (!isDownloadable(found)) {
      return patientRequestStatus(found) === 'expired'
        ? NextResponse.json(
            { success: false, code: 'EXPIRED', error: 'This document is no longer available to download. Send a new request.' },
            { status: 410 }
          )
        : NextResponse.json({ success: false, code: 'NOT_RELEASED', error: 'The clinic hasn’t released this document.' }, { status: 409 });
    }

    const { token, expiresAt } = createDocumentRequestLinkToken(String(found._id));
    return NextResponse.json({
      success: true,
      data: { url: `${requestOrigin(request)}/api/requested-documents/${token}`, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    logger.error('Error creating document request PDF link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not prepare the PDF. Try again.' }, { status: 500 });
  }
}
