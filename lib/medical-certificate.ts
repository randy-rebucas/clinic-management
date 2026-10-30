import 'server-only';
import type { IssuedSeal } from '@/lib/document-seal';
import { pickSignature, signerWroteContent, type Signer } from '@/lib/doctor-signature';
import { escapeHtml as e, protectionHead, sealedDocumentParts, watermarkOverlay } from '@/lib/document-protection';

/**
 * The medical certificate for a visit (staff print: GET /api/visits/:id/print/medical-certificate;
 * patient app: a released `medical_certificate` document request, GET /api/requested-documents/:token).
 * Shared so both render the same sealed document. Without a seal it renders as a staff preview.
 */

/** Load the visit with what the certificate prints, each populate matched to the visit's clinic. */
export function populateVisitForCertificate<T>(query: T, tenantId: unknown): T {
  return (query as any)
    .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth gender', match: { tenantIds: tenantId } })
    .populate('provider', 'name email');
}

/**
 * The visit's certificate as HTML. `options.purpose` adds the "issued upon the request of the
 * patient for … purposes" line (patient-requested certificates).
 */
export function generateMedicalCertificateHTML(
  visit: any,
  settings: any,
  seal: IssuedSeal | null,
  tz: string,
  signer: Signer | null,
  options: { purpose?: string | null } = {}
): string {
  const patient = visit.patient || {};
  const provider = visit.provider;
  const clinicName = settings?.clinicName || 'Clinic';
  // A draft visit is not signed off yet, so it never carries the doctor's stored signature; nor
  // does a visit whose notes someone other than the doctor wrote last.
  const signatureSrc = signerWroteContent(visit, visit.provider)
    ? pickSignature(visit.digitalSignature?.signatureData, signer, visit.status !== 'draft')
    : null;
  const licenseNumber = signer?.licenseNumber || settings?.licenseNumber;
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

  const protection = seal
    ? sealedDocumentParts({ seal, clinicName, documentLabel: 'Medical Certificate', documentCode: visit.visitCode })
    : {
        head: protectionHead(),
        watermark: watermarkOverlay([`PREVIEW · NOT ISSUED · ${clinicName}`, visit.visitCode, 'For clinic staff only'], { warning: true }),
        banner: '<p style="border: 1px solid #b45309; background: #fffbeb; color: #92400e; padding: 6px 10px; font-family: Arial, sans-serif; font-weight: bold;">Preview: the patient&rsquo;s copy carries a verifiable seal. It prints what the visit says when it is downloaded.</p>',
        seal: '',
      };

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

    ${options.purpose ? `
    <p>This certification is issued upon the request of the patient for ${e(options.purpose)} purposes.</p>
    ` : ''}
  </div>

  <div class="signature-section">
    ${signatureSrc ? `
      <div>
        <img src="${signatureSrc}" alt="Signature" style="max-height: 80px; max-width: 260px;" />
      </div>
    ` : ''}
    <div class="signature-box"${signatureSrc ? ' style="margin-top: 0;"' : ''}>
      <div>${e(signer?.name || provider?.name || 'Licensed Physician')}</div>
      <div style="font-size: 12px; margin-top: 5px;">${licenseNumber ? `License No: ${e(licenseNumber)}` : 'Medical License Number'}${signer?.ptr ? ` · PTR No: ${e(signer.ptr)}` : ''}</div>
      <div style="font-size: 11px; margin-top: 10px;">Date: ${today}</div>
    </div>
  </div>

  ${protection.seal}

  <div class="footer">
    <p>This certificate is issued based on medical examination conducted on the date specified above.</p>
    <p>${seal ? `Valid only if the serial above verifies at ${e(seal.verifyBaseUrl)}/verify. ` : ''}Visit Code: ${e(visit.visitCode)}</p>
  </div>
</body>
</html>
  `;
}
