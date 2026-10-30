import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { logPrinted } from '@/lib/audit';
import { issueSeal, tenantScopedQuery } from '@/lib/document-seal';
import { populateReferralForLetter, referralLetterHtml, referralLetterUnavailable } from '@/lib/referral-letter';
import { loadSigner } from '@/lib/doctor-signature';
import { documentResponse, pdfFilename } from '@/lib/pdf';

// Headroom for a cold Chromium start when ?format=pdf.
export const maxDuration = 30;

/**
 * GET /api/referrals/:id/letter
 * The referral letter the patient carries to the receiving doctor: who they are, why they are
 * referred, the clinical summary, allergies and current medicines, signed by the referring doctor
 * and sealed (serial + QR) like every other printout. Only for referrals this clinic sends.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    const query = tenantScopedQuery(id, tenantId);
    const referral = query
      ? await populateReferralForLetter(Referral.findOne(query), query.tenantId)
      : null;

    if (!referral) return NextResponse.json({ success: false, error: 'Referral not found' }, { status: 404 });
    const unavailable = referralLetterUnavailable(referral);
    if (unavailable) return NextResponse.json({ success: false, error: unavailable }, { status: 409 });

    const [settings, tz, seal, signer] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      issueSeal({ request, documentType: 'referral_letter', document: referral, tenantId, userId: session.userId }),
      loadSigner({ tenantId, doctorId: referral.referringDoctor?._id }),
    ]);

    await logPrinted({
      session,
      tenantId,
      resource: 'referral',
      resourceId: referral._id,
      patientId: (referral.patient as any)?._id,
      what: `referral letter ${referral.referralCode}`,
      seal,
      request,
    });

    const html = referralLetterHtml(referral, settings, seal, tz, signer?.signatureSrc ?? null);
    return documentResponse(request, html, pdfFilename('Referral-Letter', referral.referralCode));
  } catch (error) {
    console.error('Error generating referral letter:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the referral letter' }, { status: 500 });
  }
}
