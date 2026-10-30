import { NextRequest, NextResponse, after } from 'next/server';
import { logPrinted } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { issueSeal, tenantScopedQuery } from '@/lib/document-seal';
import { loadSigner } from '@/lib/doctor-signature';
import { generateMedicalCertificateHTML, populateVisitForCertificate } from '@/lib/medical-certificate';
import { canIssueMedicalCertificates } from '@/lib/doctor-access';
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

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }
  // Only doctors and clinic admins issue medical certificates.
  if (!(await canIssueMedicalCertificates(session))) {
    return NextResponse.json({ success: false, error: 'Only doctors and clinic admins can issue medical certificates.' }, { status: 403 });
  }

  try {
    await connectDB();
    const { id } = await params;

    const query = tenantScopedQuery(id, tenantId);
    const visit = query
      ? await populateVisitForCertificate(Visit.findOne(query), query.tenantId)
      : null;

    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    if (visit.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Certificates cannot be issued for cancelled visits' },
        { status: 409 }
      );
    }

    const [settings, tz, seal, signer] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      issueSeal({
        request,
        documentType: 'medical_certificate',
        document: visit,
        tenantId,
        userId: session.userId,
      }),
      loadSigner({ tenantId, userId: visit.provider?._id }),
    ]);

    // Optional "issued upon the request of the patient for … purposes" line (patient page dialog).
    const purpose = request.nextUrl.searchParams.get('purpose')?.trim().slice(0, 120) || null;
    const html = generateMedicalCertificateHTML(visit, settings, seal, tz, signer, { purpose });
    after(() =>
      logPrinted({ session, tenantId, resource: 'visit', resourceId: id, patientId: visit.patient?._id, what: 'a medical certificate', seal, request })
    );

    return documentResponse(request, html, pdfFilename('Medical-Certificate', visit.visitCode));
  } catch (error: any) {
    console.error('Error generating medical certificate:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate medical certificate' },
      { status: 500 }
    );
  }
}
