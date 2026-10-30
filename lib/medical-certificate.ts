import 'server-only';
import type { IssuedSeal } from '@/lib/document-seal';
import { pickSignature, signerWroteContent, type Signer } from '@/lib/doctor-signature';
import { escapeHtml as e, protectionHead, sealedDocumentParts, watermarkOverlay } from '@/lib/document-protection';

/**
 * The medical certificate for a visit (staff print: GET /api/visits/:id/print/medical-certificate;
 * patient app: a released `medical_certificate` document request, GET /api/requested-documents/:token).
 * Shared so both render the same sealed document. Without a seal it renders as a staff preview.
 */

/** Long free text is shortened so the certificate never runs past one page; the visit keeps the full notes. */
const CLIP_AT = 400;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (text: string) => (text.length > CLIP_AT ? `${text.slice(0, CLIP_AT).trimEnd()}…` : text);

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

  const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(' ');
  const contact = [settings?.clinicAddress && e(settings.clinicAddress), settings?.clinicPhone && `Tel. ${e(settings.clinicPhone)}`]
    .filter(Boolean)
    .join(' &middot; ');
  // Label → already-escaped value, in reading order; empty fields are left out.
  const findings = [
    visit.chiefComplaint && ['Chief complaint', e(clip(visit.chiefComplaint))],
    primaryDiagnosis && ['Diagnosis', e(diagnosisText)],
    visit.soapNotes?.assessment && ['Assessment', e(clip(visit.soapNotes.assessment))],
    visit.treatmentPlan?.followUp?.instructions && ['Recommendations', e(clip(visit.treatmentPlan.followUp.instructions))],
    visit.followUpDate && ['Follow-up', new Date(visit.followUpDate).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' })],
  ].filter(Boolean) as [string, string][];

  const protection = seal
    ? sealedDocumentParts({ seal, clinicName, documentLabel: 'Medical Certificate', documentCode: visit.visitCode })
    : {
        head: protectionHead(),
        watermark: watermarkOverlay([`PREVIEW · NOT ISSUED · ${clinicName}`, visit.visitCode, 'For clinic staff only'], { warning: true }),
        banner: '<p style="border: 1px solid #b45309; background: #fffbeb; color: #92400e; padding: 6px 10px; margin: 0 0 12px; font: bold 12px/1.4 Arial, sans-serif; text-align: left;">Preview: the patient&rsquo;s copy carries a verifiable seal. It prints what the visit says when it is downloaded.</p>',
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
    /* One A4 page: header on top, content in the middle, footer pinned to the bottom. */
    @page { size: A4; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 13px;
      line-height: 1.45;
      color: #111827;
    }
    .page {
      display: flex;
      flex-direction: column;
      min-height: 271mm;
      max-width: 182mm;
      margin: 0 auto;
    }
    @media screen {
      body { padding: 24px 16px; }
      .page { min-height: 1020px; }
    }
    @media print {
      .page { height: 271mm; overflow: hidden; }
    }
    p { margin: 0; }
    .sans { font-family: Arial, Helvetica, sans-serif; }

    /* Header: clinic, document type, reference */
    .doc-header { text-align: center; }
    .clinic-name { font-size: 18px; font-weight: bold; letter-spacing: .5px; }
    .clinic-contact { font-size: 12px; color: #374151; margin-top: 2px; }
    .rule { border: 0; border-top: 3px double #1f2937; margin: 10px 0 12px; }
    .doc-title { margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 3px; }
    .doc-ref {
      display: flex; justify-content: space-between; margin-top: 10px; padding: 4px 0;
      border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
      font-size: 11px; color: #4b5563;
    }
    .doc-ref strong { color: #111827; }

    /* Content */
    .doc-content { flex: 1 1 auto; padding-top: 18px; }
    .salutation { font-weight: bold; margin-bottom: 10px; }
    .statement { text-align: justify; margin-bottom: 16px; }
    .section-label {
      font-size: 10px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase; color: #4b5563;
      margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e5e7eb;
    }
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; }
    .field { display: flex; gap: 8px; }
    .field .k { flex: 0 0 100px; color: #4b5563; }
    .field .v { font-weight: bold; }
    .findings { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .findings th, .findings td { text-align: left; vertical-align: top; padding: 3px 0; }
    .findings th { width: 120px; font-weight: normal; color: #4b5563; padding-right: 12px; }
    .findings td { text-align: justify; }
    .purpose { text-align: justify; }

    /* Footer: doctor, verification, note */
    .doc-footer { break-inside: avoid; }
    .signatory { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .signature { width: 260px; text-align: center; }
    .signature-img { height: 56px; display: flex; align-items: flex-end; justify-content: center; }
    .signature-img img { max-height: 56px; max-width: 220px; }
    .signature-line { border-top: 1.5px solid #111827; padding-top: 4px; font-weight: bold; }
    .signature-meta { font-size: 11px; color: #374151; line-height: 1.5; }
    .ds-seal-block { margin: 0 0 8px; padding: 6px 10px; }
    .ds-seal-block .ds-qr { width: 72px; height: 72px; }
    .ds-seal-block .ds-stamp { width: 72px; height: 72px; }
    .doc-note {
      border-top: 1px solid #e5e7eb; padding-top: 6px;
      font-size: 10px; line-height: 1.5; color: #6b7280; text-align: center;
    }
  </style>
</head>
<body>
  ${protection.watermark}
  <div class="page">
    <header class="doc-header">
      ${protection.banner}
      <div class="clinic-name">${e(clinicName)}</div>
      ${contact ? `<div class="clinic-contact">${contact}</div>` : ''}
      <hr class="rule" />
      <h1 class="doc-title">MEDICAL CERTIFICATE</h1>
      <div class="doc-ref sans">
        <span>Reference: <strong>${e(visit.visitCode)}</strong></span>
        <span>Date issued: <strong>${today}</strong></span>
      </div>
    </header>

    <main class="doc-content">
      <p class="salutation">TO WHOM IT MAY CONCERN:</p>
      <p class="statement">This is to certify that <strong>${e(patientName)}</strong>${patient.patientCode ? ` (Patient ID: ${e(patient.patientCode)})` : ''} was examined at this clinic on <strong>${visitDate}</strong>, with the findings below.</p>

      <h2 class="section-label sans">Patient</h2>
      <div class="fields">
        <div class="field"><span class="k">Name</span><span class="v">${e(patientName)}</span></div>
        <div class="field"><span class="k">Patient ID</span><span class="v">${patient.patientCode ? e(patient.patientCode) : '&mdash;'}</span></div>
        <div class="field"><span class="k">Date of birth</span><span class="v">${patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '&mdash;'}</span></div>
        <div class="field"><span class="k">Sex</span><span class="v">${patient.gender ? e(titleCase(patient.gender)) : '&mdash;'}</span></div>
        <div class="field"><span class="k">Date examined</span><span class="v">${visitDate}</span></div>
      </div>

      ${findings.length ? `
      <h2 class="section-label sans">Findings</h2>
      <table class="findings">
        ${findings.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}
      </table>
      ` : ''}

      ${options.purpose ? `<p class="purpose">This certification is issued upon the request of the patient for ${e(options.purpose)} purposes.</p>` : ''}
    </main>

    <footer class="doc-footer">
      <div class="signatory">
        <div class="signature">
          <div class="signature-img">${signatureSrc ? `<img src="${signatureSrc}" alt="Signature" />` : ''}</div>
          <div class="signature-line">${e(signer?.name || provider?.name || 'Licensed Physician')}</div>
          <div class="signature-meta">
            Attending Physician<br>
            ${licenseNumber ? `License No. ${e(licenseNumber)}` : 'License No. ____________'}${signer?.ptr ? ` &middot; PTR No. ${e(signer.ptr)}` : ''}
          </div>
        </div>
      </div>
      ${protection.seal}
      <div class="doc-note sans">
        This certificate is issued based on the medical examination conducted on the date stated above.
        ${seal ? `Valid only if the serial verifies at ${e(seal.verifyBaseUrl)}/verify.` : ''}
        Reference ${e(visit.visitCode)}.
      </div>
    </footer>
  </div>
</body>
</html>
  `;
}
