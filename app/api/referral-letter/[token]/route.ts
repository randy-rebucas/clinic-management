import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { issueSeal } from '@/lib/document-seal';
import { loadSigner } from '@/lib/doctor-signature';
import { htmlToPdf, pdfFilename, pdfHeaders } from '@/lib/pdf';
import { populateReferralForLetter, referralLetterHtml, referralLetterUnavailable } from '@/lib/referral-letter';
import { readReferralLetterLinkToken } from '@/lib/referral-letter-link';
import { createAuditLog } from '@/lib/audit';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import logger from '@/lib/logger';

export const maxDuration = 30;

const LIMIT = { name: 'referral-letter-pdf', windowMs: 10 * 60 * 1000, maxRequests: 20 };

/**
 * GET /api/referral-letter/:token — the patient's referral letter as a sealed PDF (patient copy),
 * the same letter staff print. The token comes from
 * POST /api/patients/me/referrals/:id/pdf-link and lasts 10 minutes. Repeat downloads of an
 * unchanged referral carry the same seal.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await consumeRateLimit(LIMIT, getClientIp(request.headers));
  if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many downloads. Try again later.' }, { status: 429 });

  const { token } = await params;
  const id = readReferralLetterLinkToken(token);
  if (!id) {
    return NextResponse.json({ success: false, error: 'This link has expired. Open the referral in the app again.' }, { status: 410 });
  }

  try {
    await connectDB();
    const found = await Referral.findById(id).select('tenantId patient').lean<{ tenantId?: unknown; patient?: unknown } | null>();
    const tenantId = found?.tenantId ? String(found.tenantId) : null;
    if (!tenantId) return NextResponse.json({ success: false, error: 'Referral letter not available.' }, { status: 404 });

    const referral = await populateReferralForLetter(Referral.findOne({ _id: id, tenantId: found!.tenantId }), found!.tenantId);
    // Checked again here: the referral may have been cancelled since the link was made.
    if (!referral || referralLetterUnavailable(referral)) {
      return NextResponse.json({ success: false, error: 'Referral letter not available.' }, { status: 404 });
    }

    const [settings, tz, signer] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      loadSigner({ tenantId, doctorId: referral.referringDoctor?._id }),
    ]);
    const seal = await issueSeal({
      request,
      documentType: 'referral_letter',
      document: referral,
      tenantId,
      copyType: 'patient',
      reuse: true,
    });
    const html = referralLetterHtml(referral, settings, seal, tz, signer?.signatureSrc ?? null);
    const pdf = await htmlToPdf(html);

    await createAuditLog({
      tenantId,
      userRole: 'patient',
      action: 'download',
      resource: 'referral',
      resourceId: id,
      dataSubject: found!.patient ? String(found!.patient) : undefined,
      isSensitive: true,
      description: `Patient downloaded referral letter ${referral.referralCode} (copy #${seal.printNumber})`,
      ipAddress: getClientIp(request.headers),
    });

    return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(pdfFilename('Referral-Letter', referral.referralCode)) });
  } catch (error) {
    logger.error('Error rendering patient referral letter PDF', error as Error);
    return NextResponse.json({ success: false, error: 'The PDF could not be created right now. Try again.' }, { status: 503 });
  }
}
