import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { logShareLinkEvent, revokeShareLink, toShareLinkView } from '@/lib/health-summary-share';

/**
 * DELETE /api/patients/me/share-links/[id]
 * Revoke one of this profile's health-summary share links: it stops opening at once. The record
 * is kept (status 'revoked') so the list still shows how it was used. Revoking twice is a no-op.
 * → { link: ShareLinkView }; 404 when the id isn't one of this profile's links.
 * Not gated on eMCR activation: a patient can always switch off what they shared.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    const { id } = await params;
    const result = await revokeShareLink(session.patientId, id);
    if (!result) return NextResponse.json({ success: false, error: 'Link not found.' }, { status: 404 });
    if (result.changed) await logShareLinkEvent({ event: 'revoked', link: result.link, session, request });
    return NextResponse.json({ success: true, data: { link: toShareLinkView(result.link) } });
  } catch (error) {
    logger.error('Error revoking health summary share link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not revoke the link. Try again.' }, { status: 500 });
  }
}
