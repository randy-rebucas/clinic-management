import { NextRequest, NextResponse, after } from 'next/server';
import { logPrinted } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { getSettings } from '@/lib/settings';
import { issueSeal, tenantScopedQuery, IssuedSeal } from '@/lib/document-seal';
import { liveOrderTests } from '@/lib/lab-orders';
import {
  escapeHtml as e,
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

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;

    const query = tenantScopedQuery(id, tenantId);
    const labResult = query
      ? await LabResult.findOne(query)
          .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth sex', match: { tenantIds: query.tenantId } })
          .populate({ path: 'visit', select: 'visitCode date visitType diagnoses chiefComplaint soapNotes', match: { tenantId: query.tenantId } })
          .populate('orderedBy', 'name email')
      : null;

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    // A cancelled test never prints or seals a form, even when others on its order are live:
    // the seal would be issued against a cancelled request. Print from one of the live tests.
    if (labResult.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Cancelled lab requests cannot be printed. Print the order from one of its other tests.' },
        { status: 409 }
      );
    }
    // Tests placed together print on one form for the whole order.
    (labResult as any).orderTests = await liveOrderTests(labResult, tenantId);

    const [settings, tz, seal] = await Promise.all([
      getSettings(tenantId),
      getTenantTimezone(tenantId),
      issueSeal({
        request,
        documentType: 'lab_request_form',
        document: labResult,
        tenantId,
        userId: session.userId,
      }),
    ]);

    // Generate HTML for printable lab request form
    const html = generateLabRequestFormHTML(labResult, settings, seal, tz);
    after(() =>
      logPrinted({ session, tenantId, resource: 'lab_result', resourceId: id, patientId: labResult.patient?._id, what: 'a lab request form', seal, request })
    );

    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  } catch (error: any) {
    console.error('Error generating lab request form:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate lab request form' },
      { status: 500 }
    );
  }
}

function generateLabRequestFormHTML(labResult: any, settings: any, seal: IssuedSeal, tz: string): string {
  const patient = labResult.patient || {};
  const provider = labResult.orderedBy;
  const visit = labResult.visit;
  const request = labResult.request || {};
  // An order of several tests prints under its order code, every live test listed.
  const orderTests: any[] = labResult.orderTests?.length ? labResult.orderTests : [labResult];
  const code = labResult.orderTests?.length ? labResult.orderCode : labResult.requestCode;
  const clinicName = settings?.clinicName || 'Clinic';
  const shortDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
  const ageOf = (dob: string | Date) => {
    const b = new Date(dob);
    const n = new Date();
    if (Number.isNaN(b.getTime())) return '';
    const years = n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
    return years >= 0 ? ` (${years} yr${years === 1 ? '' : 's'})` : '';
  };
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const contact = [settings?.clinicAddress, settings?.clinicPhone, settings?.clinicEmail]
    .filter((v: unknown) => typeof v === 'string' && v.trim())
    .map((v: string) => e(v))
    .join(' · ');
  const infoRow = (label: string, valueHtml: string) => `<dt>${e(label)}</dt><dd>${valueHtml}</dd>`;
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const protection = sealedDocumentParts({
    seal,
    clinicName,
    documentLabel: 'Laboratory Request',
    documentCode: code,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lab Request Form - ${e(code)}</title>
  ${protection.head}
  <style>
    /* Sized to print on one A4 sheet: tight margins, small type, compact blocks. */
    @page {
      size: A4;
      margin: 12mm;
    }
    @media print {
      body {
        max-width: none;
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none;
      }
      .ds-seal-block .ds-qr,
      .ds-seal-block .ds-stamp {
        width: 70px;
        height: 70px;
      }
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 12.5px;
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
      line-height: 1.35;
      color: #111827;
    }
    h2, h3 {
      margin: 0 0 6px 0;
      font-size: 14px;
    }
    p {
      margin: 2px 0;
    }
    /* One sheet: the header at the top, the footer held at the bottom of the page. */
    .page {
      display: flex;
      flex-direction: column;
    }
    /* On paper the footer is fixed to the foot of the sheet; the page keeps room for it. */
    @media print {
      .page {
        padding-bottom: 16mm;
      }
      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        background: #fff;
      }
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .letterhead {
      margin-bottom: 4px;
    }
    .clinic-name {
      font-size: 16px;
      font-weight: bold;
    }
    .clinic-contact {
      font-size: 11px;
      color: #4b5563;
    }
    .header h1 {
      margin: 0;
      color: #2563eb;
      font-size: 20px;
    }
    .header-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-code {
      white-space: nowrap;
    }
    /* Patient on the left, the request on the right; labels in one column, values in the next. */
    .info-section {
      margin-bottom: 10px;
      padding: 8px 12px;
      background-color: #f9fafb;
      border-left: 3px solid #2563eb;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
    }
    .info-col {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 2px 12px;
      margin: 0;
      align-content: start;
    }
    .info-col dt {
      color: #6b7280;
    }
    .info-col dd {
      margin: 0;
    }
    @media screen and (max-width: 600px) {
      .info-section {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
    .test-section {
      margin: 10px 0;
      padding: 10px 12px;
      border: 1.5px solid #2563eb;
      border-radius: 4px;
    }
    .test-section h2 {
      color: #2563eb;
    }
    /* The order's tests as a grid of cards: four across on paper, fewer on narrow screens. */
    .test-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    @media screen and (max-width: 700px) {
      .test-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .test-item {
      padding: 6px 8px;
      background-color: #f0f9ff;
      border-left: 3px solid #2563eb;
      border-radius: 3px;
      break-inside: avoid;
      overflow-wrap: anywhere;
    }
    .test-name {
      display: block;
      font-size: 13px;
    }
    .test-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px 6px;
      margin-top: 3px;
    }
    .test-item small {
      font-size: 10.5px;
    }
    .urgency-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 9.5px;
      text-transform: uppercase;
    }
    .clinical-info {
      margin: 10px 0;
      padding: 8px 12px;
      background-color: #fff7ed;
      border-left: 3px solid #f59e0b;
    }
    .instructions {
      margin: 10px 0;
      padding: 8px 12px;
      background-color: #fef3c7;
      border-left: 3px solid #fbbf24;
    }
    /* The seal and the doctor's signature share one row at the foot of the page. */
    .sign-row {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      margin: 12px 0 10px;
      break-inside: avoid;
    }
    .sign-row .ds-seal-block {
      flex: 1 1 auto;
      /* Its one-line microtext would otherwise hold it wide and push the signature off the page. */
      min-width: 0;
      margin: 0;
      padding: 8px 10px;
      gap: 10px;
    }
    .signature-section {
      flex: 0 0 auto;
      text-align: center;
    }
    .signature-box {
      display: inline-block;
      border-top: 1.5px solid #333;
      padding-top: 3px;
      margin-top: 0;
      min-width: 200px;
      text-align: center;
      font-size: 12px;
    }
    .ds-seal-block {
      break-inside: avoid;
    }
    .footer {
      margin-top: auto;
      padding-top: 6px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #6b7280;
      text-align: center;
    }
    .print-button {
      margin-bottom: 12px;
      text-align: center;
    }
    .print-button button {
      padding: 10px 22px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 15px;
    }
  </style>
</head>
<body>
  ${protection.watermark}
  <div class="no-print print-button">
    <button data-print>Print Request Form</button>
  </div>
  ${protection.banner}

  <div class="page">
  <header class="header">
    <div class="letterhead">
      <div class="clinic-name">${e(clinicName)}</div>
      ${contact ? `<div class="clinic-contact">${contact}</div>` : ''}
    </div>
    <div class="header-row">
      <h1>LABORATORY REQUEST FORM</h1>
      <div class="header-code"><strong>Request Code:</strong> ${e(code)}</div>
    </div>
  </header>

  <div class="info-section">
    <dl class="info-col">
      ${infoRow('Patient', `<strong>${e(patient.firstName)} ${e(patient.lastName)}</strong>`)}
      ${patient.patientCode ? infoRow('Patient ID', e(patient.patientCode)) : ''}
      ${patient.dateOfBirth ? infoRow('Date of birth', `${shortDate(patient.dateOfBirth)}${ageOf(patient.dateOfBirth)}`) : ''}
      ${patient.sex ? infoRow('Sex', e(capitalize(patient.sex))) : ''}
      ${patient.phone ? infoRow('Phone', e(patient.phone)) : ''}
    </dl>
    <dl class="info-col">
      ${infoRow('Request date', today)}
      ${provider ? infoRow('Requested by', e(provider.name)) : ''}
      ${visit ? infoRow('Visit', `${e(visit.visitCode)} · ${shortDate(visit.date)}`) : ''}
      ${labResult.thirdPartyLab?.labName ? infoRow('Outside lab', `${e(labResult.thirdPartyLab.labName)}${labResult.thirdPartyLab.labCode ? ` (${e(labResult.thirdPartyLab.labCode)})` : ''}`) : ''}
      ${labResult.thirdPartyLab?.externalRequestId ? infoRow('Lab reference', e(labResult.thirdPartyLab.externalRequestId)) : ''}
    </dl>
  </div>

  ${visit && (visit.diagnoses?.length > 0 || visit.chiefComplaint) ? `
  <div class="clinical-info">
    <h3>Clinical Information</h3>
    ${visit.diagnoses?.length > 0 ? `
      <p><strong>Diagnosis:</strong> ${e(visit.diagnoses.map((d: any) =>
        `${d.code ? `(${d.code}) ` : ''}${d.description || ''}`
      ).join(', '))}</p>
    ` : ''}
    ${visit.chiefComplaint ? `
      <p><strong>Chief Complaint:</strong> ${e(visit.chiefComplaint)}</p>
    ` : ''}
    ${visit.soapNotes?.assessment ? `
      <p><strong>Clinical Assessment:</strong> ${e(visit.soapNotes.assessment)}</p>
    ` : ''}
  </div>
  ` : ''}

  <div class="test-section">
    <h2>Requested Laboratory ${orderTests.length > 1 ? `Tests (${orderTests.length})` : 'Test'}</h2>
    <div class="test-grid">
    ${orderTests
      .map((t: any) => {
        const r = t.request || {};
        const urgency = r.urgency || request.urgency;
        return `
      <div class="test-item">
        <strong class="test-name">${e(r.testType)}</strong>
        <div class="test-meta">
          <span class="urgency-badge" style="background-color: ${urgency === 'stat' ? '#fee2e2' : urgency === 'urgent' ? '#fef3c7' : '#dbeafe'}; color: ${urgency === 'stat' ? '#991b1b' : urgency === 'urgent' ? '#92400e' : '#1e40af'};">
            ${e(urgency?.toUpperCase() || 'ROUTINE')}
          </span>
          ${orderTests.length > 1 && t.requestCode ? `<small style="color: #6b7280; font-family: monospace;">${e(t.requestCode)}</small>` : ''}
        </div>
        ${r.testCode ? `<small style="display: block; margin-top: 2px; color: #6b7280;">Test code: ${e(r.testCode)}</small>` : ''}
        ${r.description ? `<p style="margin: 2px 0 0 0; font-size: 11px;">${e(r.description)}</p>` : ''}
      </div>`;
      })
      .join('')}
    </div>
  </div>

  ${request.fastingRequired || request.preparationNotes || request.specialInstructions ? `
  <div class="instructions">
    <h3>Special Instructions</h3>
    ${request.fastingRequired ? `
      <p><strong>⚠️ Fasting Required:</strong> Patient must fast for 8-12 hours before the test.</p>
    ` : ''}
    ${request.preparationNotes ? `
      <p><strong>Preparation:</strong> ${e(request.preparationNotes)}</p>
    ` : ''}
    ${request.specialInstructions ? `
      <p><strong>Additional Instructions:</strong> ${e(request.specialInstructions)}</p>
    ` : ''}
  </div>
  ` : ''}

  <div class="sign-row">
    ${protection.seal}
    <div class="signature-section">
      <div class="signature-box">
        <div>${provider ? e(provider.name) : 'Licensed Physician'}</div>
        <div style="font-size: 11px;">${settings?.licenseNumber ? `License No: ${e(settings.licenseNumber)}` : 'Medical License Number'}</div>
        <div style="font-size: 10.5px;">Date: ${today}</div>
      </div>
    </div>
  </div>


  <footer class="footer">
    <p>This is a computer-generated lab request form. Please verify the serial above before processing.</p>
    <p>For questions, please contact the requesting physician${settings?.clinicPhone ? ` at ${e(settings.clinicPhone)}` : ''}. · Request Code: ${e(code)}</p>
  </footer>
  </div>
</body>
</html>
  `;
}
