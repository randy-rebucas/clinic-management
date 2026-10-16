import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { issueSeal, tenantScopedQuery, IssuedSeal } from '@/lib/document-seal';
import {
  escapeHtml as e,
  safeImageSrc,
  sealedDocumentParts,
  PROTECTED_DOCUMENT_HEADERS,
  withScriptNonce,
} from '@/lib/document-protection';

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

  try {
    await connectDB();
    const { id } = await params;

    const query = tenantScopedQuery(id, tenantId);
    const visit = query
      ? await Visit.findOne(query)
          .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth gender', match: { tenantIds: query.tenantId } })
          .populate('provider', 'name email')
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

    const [settings, tz, seal] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      issueSeal({
        request,
        documentType: 'medical_certificate',
        document: visit,
        tenantId,
        userId: session.userId,
      }),
    ]);

    // Generate HTML for printable medical certificate
    const html = generateMedicalCertificateHTML(visit, settings, seal, tz);

    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  } catch (error: any) {
    console.error('Error generating medical certificate:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate medical certificate' },
      { status: 500 }
    );
  }
}

function generateMedicalCertificateHTML(visit: any, settings: any, seal: IssuedSeal, tz: string): string {
  const patient = visit.patient || {};
  const provider = visit.provider;
  const clinicName = settings?.clinicName || 'Clinic';
  const signatureSrc = safeImageSrc(visit.digitalSignature?.signatureData);
  const visitDate = new Date(visit.date).toLocaleDateString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Get primary diagnosis or first diagnosis
  const primaryDiagnosis = visit.diagnoses?.find((d: any) => d.primary) || visit.diagnoses?.[0];
  const diagnosisText = primaryDiagnosis
    ? `${primaryDiagnosis.code ? `(${primaryDiagnosis.code}) ` : ''}${primaryDiagnosis.description || ''}`
    : 'Medical condition';

  const protection = sealedDocumentParts({
    seal,
    clinicName,
    documentLabel: 'Medical Certificate',
    documentCode: visit.visitCode,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Medical Certificate - ${e(visit.visitCode)}</title>
  ${protection.head}
  <style>
    @media print {
      @page {
        size: A4;
        margin: 20mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
    }
    body {
      font-family: 'Times New Roman', serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      line-height: 1.8;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px double #333;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 2px;
    }
    .clinic-info {
      font-size: 13px;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .certificate-body {
      margin: 40px 0;
      text-align: justify;
    }
    .patient-info {
      margin: 20px 0;
      padding: 15px;
      background-color: #f9f9f9;
      border-left: 4px solid #2563eb;
    }
    .info-row {
      margin: 8px 0;
    }
    .info-label {
      font-weight: bold;
      display: inline-block;
      width: 150px;
    }
    .signature-section {
      margin-top: 60px;
      text-align: right;
    }
    .signature-box {
      display: inline-block;
      border-top: 2px solid #333;
      padding-top: 5px;
      margin-top: 60px;
      min-width: 250px;
      text-align: center;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  ${protection.watermark}
  ${protection.banner}
  <div class="header">
    <div class="clinic-info">
      <strong style="font-size: 16px;">${e(clinicName)}</strong><br>
      ${settings?.clinicAddress ? `${e(settings.clinicAddress)}<br>` : ''}
      ${settings?.clinicPhone ? `Tel: ${e(settings.clinicPhone)}` : ''}
    </div>
    <h1>MEDICAL CERTIFICATE</h1>
  </div>

  <div class="certificate-body">
    <p>This is to certify that I have examined <strong>${e(patient.firstName)} ${e(patient.lastName)}</strong>${patient.patientCode ? ` (Patient ID: ${e(patient.patientCode)})` : ''} on <strong>${visitDate}</strong>.</p>

    <div class="patient-info">
      <div class="info-row">
        <span class="info-label">Patient Name:</span>
        <span>${e(patient.firstName)} ${e(patient.lastName)}</span>
      </div>
      ${patient.dateOfBirth ? `
      <div class="info-row">
        <span class="info-label">Date of Birth:</span>
        <span>${new Date(patient.dateOfBirth).toLocaleDateString('en-US', { timeZone: tz })}</span>
      </div>
      ` : ''}
      ${patient.gender ? `
      <div class="info-row">
        <span class="info-label">Gender:</span>
        <span>${e(patient.gender)}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="info-label">Visit Date:</span>
        <span>${visitDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Visit Code:</span>
        <span>${e(visit.visitCode)}</span>
      </div>
    </div>

    ${visit.chiefComplaint ? `
    <p><strong>Chief Complaint:</strong> ${e(visit.chiefComplaint)}</p>
    ` : ''}

    ${primaryDiagnosis ? `
    <p><strong>Diagnosis:</strong> ${e(diagnosisText)}</p>
    ` : ''}

    ${visit.soapNotes?.assessment ? `
    <p><strong>Clinical Assessment:</strong> ${e(visit.soapNotes.assessment)}</p>
    ` : ''}

    ${visit.treatmentPlan?.followUp?.instructions ? `
    <p><strong>Recommendations:</strong> ${e(visit.treatmentPlan.followUp.instructions)}</p>
    ` : ''}

    ${visit.followUpDate ? `
    <p><strong>Follow-up Date:</strong> ${new Date(visit.followUpDate).toLocaleDateString('en-US', { timeZone: tz })}</p>
    ` : ''}
  </div>

  <div class="signature-section">
    ${signatureSrc ? `
      <div style="margin-bottom: 20px;">
        <img src="${signatureSrc}" alt="Signature" style="max-height: 80px;" />
      </div>
    ` : ''}
    <div class="signature-box">
      <div>${provider ? e(provider.name) : 'Licensed Physician'}</div>
      <div style="font-size: 12px; margin-top: 5px;">${settings?.licenseNumber ? `License No: ${e(settings.licenseNumber)}` : 'Medical License Number'}</div>
      <div style="font-size: 11px; margin-top: 10px;">Date: ${today}</div>
    </div>
  </div>

  ${protection.seal}

  <div class="footer">
    <p>This certificate is issued based on medical examination conducted on the date specified above.</p>
    <p>Valid only if the serial above verifies at ${e(seal.verifyBaseUrl)}/verify. Visit Code: ${e(visit.visitCode)}</p>
  </div>
</body>
</html>
  `;
}
