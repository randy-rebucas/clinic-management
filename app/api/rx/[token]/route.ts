import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import '@/models/Patient';
import '@/models/User';
import '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { issueSeal } from '@/lib/document-seal';
import { loadSigner, pickSignature, signerWroteContent } from '@/lib/doctor-signature';
import { generatePrescriptionHTML } from '@/lib/prescription-document';
import { htmlToPdf, pdfFilename, pdfHeaders } from '@/lib/pdf';
import { readPrescriptionLinkToken } from '@/lib/prescription-link';
import { createAuditLog } from '@/lib/audit';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import logger from '@/lib/logger';

export const maxDuration = 30;

const LIMIT = { name: 'rx-pdf', windowMs: 10 * 60 * 1000, maxRequests: 20 };

/**
 * GET /api/rx/:token — the patient's e-prescription as a sealed PDF (patient copy).
 * The token comes from POST /api/patients/me/prescriptions/:id/pdf-link and lasts 10 minutes.
 * Every download is its own sealed, numbered copy, like a staff reprint.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await consumeRateLimit(LIMIT, getClientIp(request.headers));
  if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many downloads. Try again later.' }, { status: 429 });

  const { token } = await params;
  const id = readPrescriptionLinkToken(token);
  if (!id) {
    return NextResponse.json({ success: false, error: 'This link has expired. Open the prescription in the app again.' }, { status: 410 });
  }

  try {
    await connectDB();
    const prescription = await Prescription.findById(id)
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth address gender' })
      .populate({ path: 'prescribedBy', select: 'name email licenseNumber' })
      .populate({ path: 'visit', select: 'visitCode date followUpDate' });
    if (!prescription || prescription.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Prescription not available.' }, { status: 404 });
    }
    const tenantId = prescription.tenantId ? String(prescription.tenantId) : null;
    if (!tenantId) return NextResponse.json({ success: false, error: 'Prescription not available.' }, { status: 404 });

    const [settings, tz, signer] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      loadSigner({ tenantId, userId: prescription.prescribedBy?._id }),
    ]);
    const seal = await issueSeal({
      request,
      documentType: 'prescription',
      document: prescription,
      tenantId,
      userId: prescription.prescribedBy?._id ? String(prescription.prescribedBy._id) : undefined,
      copyType: 'patient',
    });
    const showSignature = settings.prescriptionDigitalSignatureEnabled !== false;
    const signatureSrc =
      showSignature && signerWroteContent(prescription, prescription.prescribedBy)
        ? pickSignature(prescription.digitalSignature?.signatureData, signer, true)
        : null;
    const html = generatePrescriptionHTML(
      prescription,
      'patient',
      signer,
      signatureSrc,
      settings,
      seal,
      settings.prescriptionPaperSize === 'A5' ? 'A5' : 'A4',
      tz
    );
    const pdf = await htmlToPdf(html);

    await createAuditLog({
      tenantId,
      action: 'download',
      resource: 'prescription',
      resourceId: id,
      dataSubject: prescription.patient?._id,
      description: `Patient downloaded e-prescription ${prescription.prescriptionCode} (copy #${seal.printNumber})`,
      ipAddress: getClientIp(request.headers),
    });

    return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(pdfFilename('Prescription', prescription.prescriptionCode)) });
  } catch (error) {
    logger.error('Error rendering patient e-prescription PDF', error as Error);
    return NextResponse.json({ success: false, error: 'The PDF could not be created right now. Try again.' }, { status: 503 });
  }
}
