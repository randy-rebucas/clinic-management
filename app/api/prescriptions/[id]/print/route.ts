import { NextRequest, NextResponse, after } from 'next/server';
import { logPrinted } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { issueSeal, tenantScopedQuery } from '@/lib/document-seal';
import { loadSigner, pickSignature } from '@/lib/doctor-signature';
import { generatePrescriptionHTML, type PaperSize } from '@/lib/prescription-document';
import { documentResponse, pdfFilename } from '@/lib/pdf';

// Headroom for a cold Chromium start when ?format=pdf.
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const copyType = searchParams.get('copy') === 'clinic' ? 'clinic' : 'patient';

    const [settingInfo, tz] = await Promise.all([getSettings(tenantId), getTenantTimezone(tenantId)]);

    // Digital signature toggle: use tenant setting if present, else fallback to query param
    let showSignature = true;
    if (typeof settingInfo.prescriptionDigitalSignatureEnabled === 'boolean') {
      showSignature = settingInfo.prescriptionDigitalSignatureEnabled;
    } else {
      showSignature = searchParams.get('showSignature') !== '0';
    }

    // Only an explicit A5 choice prints A5; unset/legacy settings keep the original A4 layout.
    const paperSize: PaperSize = settingInfo.prescriptionPaperSize === 'A5' ? 'A5' : 'A4';

    const query = tenantScopedQuery(id, tenantId);
    const prescription = query
      ? await Prescription.findOne(query)
          .populate({
            path: 'patient',
            select: 'firstName lastName patientCode email phone dateOfBirth address gender',
            match: { tenantIds: query.tenantId },
          })
          .populate({ path: 'prescribedBy', select: 'name email licenseNumber' })
          .populate({ path: 'visit', select: 'visitCode date followUpDate', match: { tenantId: query.tenantId } })
      : null;

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }

    if (prescription.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Cancelled prescriptions cannot be printed' },
        { status: 409 }
      );
    }

    // Update archive tracking
    if (copyType === 'patient') {
      prescription.copies = prescription.copies || {};
      prescription.copies.patientCopy = {
        ...prescription.copies.patientCopy,
        printedAt: new Date(),
        printedBy: session.userId as any,
      };

      await prescription.save();
    } else {
      prescription.copies = prescription.copies || {};
      prescription.copies.clinicCopy = {
        ...prescription.copies.clinicCopy,
        archivedAt: new Date(),
        archivedBy: session.userId as any,
        location: 'Digital Archive',
      };
      await prescription.save();
    }

    const [seal, signer] = await Promise.all([
      issueSeal({
        request,
        documentType: 'prescription',
        document: prescription,
        tenantId,
        userId: session.userId,
        copyType,
      }),
      loadSigner({ tenantId, userId: prescription.prescribedBy?._id }),
    ]);
    const signatureSrc = showSignature
      ? pickSignature(prescription.digitalSignature?.signatureData, signer, true)
      : null;

    // Generate HTML for printable prescription
    const html = generatePrescriptionHTML(prescription, copyType, signer, signatureSrc, settingInfo, seal, paperSize, tz);
    after(() =>
      logPrinted({
        session,
        tenantId,
        resource: 'prescription',
        resourceId: id,
        patientId: prescription.patient?._id,
        what: `the prescription (${copyType === 'clinic' ? 'clinic' : 'patient'} copy)`,
        seal,
        request,
      })
    );

    return documentResponse(request, html, pdfFilename('Prescription', prescription.prescriptionCode));
  } catch (error: any) {
    console.error('Error generating prescription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate prescription' },
      { status: 500 }
    );
  }
}
