import { NextRequest, NextResponse, after } from 'next/server';
import { logPrinted } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { issueSeal, tenantScopedQuery, IssuedSeal } from '@/lib/document-seal';
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
          .populate({
            path: 'prescribedBy',
            select: 'name email doctorProfile licenseNumber',
            populate: {
              path: 'doctorProfile',
              select: 'licenseNumber ptrNumber ptr s2Number',
            },
          })
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

    const seal = await issueSeal({
      request,
      documentType: 'prescription',
      document: prescription,
      tenantId,
      userId: session.userId,
      copyType,
    });

    // Generate HTML for printable prescription
    const html = generatePrescriptionHTML(prescription, copyType, showSignature, settingInfo, seal, paperSize, tz);
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

    return new NextResponse(withScriptNonce(html, request), { headers: PROTECTED_DOCUMENT_HEADERS });
  } catch (error: any) {
    console.error('Error generating prescription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate prescription' },
      { status: 500 }
    );
  }
}

type PaperSize = 'A5' | 'A4';

// A5 is half of A4, so it gets a tighter margin, narrower screen preview and smaller type.
const A5_OVERRIDES = `
    body {
      max-width: 560px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.4;
    }
    .header h1 { font-size: 20px; }
    .header h2 { font-size: 15px; }
    .info-label { width: 100px; }
    .info-col { min-width: 0; }
    .medication-name { font-size: 15px; }
    .medication-details { font-size: 14px; }
    .signature-box { margin-top: 28px; min-width: 160px; }
    .footer { font-size: 10px; }
    .footer p { line-height: 12px; }
`;

function generatePrescriptionHTML(
  prescription: any,
  copyType: string,
  showSignature: boolean,
  settingInfo: any,
  seal: IssuedSeal,
  paperSize: PaperSize,
  tz: string
): string {
  const isA5 = paperSize === 'A5';

  const patient = prescription.patient || {};
  const provider = prescription.prescribedBy;
  const date = formatInTz(prescription.issuedAt || new Date(), 'MM/dd/yyyy', tz);
  const isPatientCopy = copyType === 'patient';
  const clinicName = settingInfo?.clinicName || 'Clinic Name';
  const protection = sealedDocumentParts({
    seal,
    clinicName,
    documentLabel: 'Prescription',
    documentCode: prescription.prescriptionCode,
    fileCopy: !isPatientCopy,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Prescription ${e(prescription.prescriptionCode)}</title>
  ${protection.head}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 200);
    };
  </script>
  <style>
    @media print {
      @page {
        size: ${paperSize} portrait;
        margin: ${isA5 ? '8mm' : '10mm'};
      }
      body {
        margin: 0;
        padding: 0;
      }
    }
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #000000;
    }
    .info-section {
      margin-bottom: 20px;
    }
    .info-row {
      display: flex;
      margin-bottom: 2px;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
    }
    .info-col {
      flex: 1;
      min-width: 280px;
    }
    .medications {
      margin-top: 20px;
    }
    .medication-item {
      padding-top: 6px;
    }
    .medication-name {
      font-size: 18px;
      font-weight: bold;
      color: #000000;
    }
    .medication-details {
      margin-left: 20px;
      color: #000000;
      font-family: monospace;
      font-size: 18px;
      font-style: italic;
    }
    .signature-section {
      text-align: right;
    }
    .signature-box {
      display: inline-block;
      border-top: 1px solid #333;
      padding-top: 5px;
      margin-top: 38px;
      min-width: 200px;
    }
    .footer {
      padding-top: 4px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #000000;
      text-align: center;
    }
    .footer p {
      margin: unset;
      line-height: 14px;
    }
    ${isA5 ? A5_OVERRIDES : ''}
  </style>
</head>
<body>
  ${protection.watermark}
  <div style="display: flex; flex-direction: column; min-height: calc(100vh - 50px);">
    ${protection.banner}
    <!-- HEADER ROW -->
    <div class="header" style="flex: 0 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin-bottom: 4px;">${e(clinicName)}</h1>
          <div style="font-size: 14px; color: #000000;">${e(settingInfo?.clinicAddress)}</div>
          <div style="font-size: 14px; color: #000000;">${settingInfo?.clinicPhone ? 'Tel: ' + e(settingInfo.clinicPhone) : ''}</div>
          <div style="font-size: 14px; color: #000000;">${settingInfo?.clinicEmail ? 'Email: ' + e(settingInfo.clinicEmail) : ''}</div>
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; color: #000000;">PRESCRIPTION ${isPatientCopy ? '(PATIENT COPY)' : '(CLINIC COPY)'}</h2>
          <strong>Code:</strong> ${e(prescription.prescriptionCode)}<br>
          ${!isPatientCopy ? `<small style="color: #000000;">Archived: ${formatInTz(new Date(), 'MM/dd/yyyy h:mm a', tz)}</small>` : ''}
        </div>
      </div>
    </div>

    <!-- CONTENT ROW -->
    <div style="flex: 1 1 auto;">
      <div class="info-section" style="display: flex; flex-wrap: wrap;">
        <div class="info-col">
          <div class="info-row">
            <div class="info-label">Patient:</div>
            <div>${e(patient.firstName)} ${e(patient.lastName)}</div>
          </div>
          ${patient.dateOfBirth ? `
          <div class="info-row">
            <div class="info-label">Date of Birth:</div>
            <div>${formatInTz(patient.dateOfBirth, 'MM/dd/yyyy', tz)}</div>
          </div>
          ` : ''}
          ${patient.gender ? `
          <div class="info-row">
            <div class="info-label">Gender:</div>
            <div>${e(patient.gender)}</div>
          </div>
          ` : ''}
          ${patient.dateOfBirth ? `
          <div class="info-row">
            <div class="info-label">Age:</div>
            <div>${formatAgeWithMonths(patient.dateOfBirth)}</div>
          </div>
          ` : ''}
        </div>
        <div class="info-col">
          ${patient.phone ? `
          <div class="info-row">
            <div class="info-label">Phone:</div>
            <div>${e(patient.phone)}</div>
          </div>
          ` : ''}
          <div class="info-row">
            <div class="info-label">Date Issued:</div>
            <div>${date}</div>
          </div>
        </div>
        ${patient.address ? `
        <div class="info-row">
          <div class="info-label">Address:</div>
          <div>${e((() => {
        if (typeof patient.address === 'object' && patient.address !== null) {
          const { street, city, state, zipCode } = patient.address;
          return [street, city, state, zipCode].filter(Boolean).join(', ');
        }
        return patient.address;
      })())}</div>
        </div>
        ` : ''}
      </div>

      <div class="medications">
        ${(prescription.medications || []).map((med: any, index: number) => `
          <div class="medication-item">
            <div class="medication-name" style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center;">
              <span>${index + 1}. ${e(med.name)}</span>
              ${med.genericName ? `<span>(${e(med.genericName)})</span>` : ''}
              ${med.strength ? `<span>${e(med.strength)}</span>` : ''}
              ${med.form ? `<span>${e(med.form)}</span>` : ''}
            </div>
            <div class="medication-details" style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between;">
              ${med.dose ? `<span><strong>Dose:</strong> ${e(med.dose)}</span>` : ''}
              ${med.route ? `<span><strong>Route:</strong> ${e(med.route)}</span>` : ''}
              ${med.frequency ? `<span><strong>Freq:</strong> ${e(med.frequency)}</span>` : ''}
              ${med.durationDays ? `<span><strong>For:</strong> ${e(med.durationDays)} day(s)</span>` : ''}
              ${med.instructions ? `<span><strong>Sig:</strong> <b>${e(med.instructions)}</b></span>` : ''}
              ${med.quantity ? `<span><strong>#</strong> ${e(med.quantity)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>


    </div>

    <!-- FOOTER ROW -->
    <div class="footer" style="flex: 0 0 auto;">
    ${(() => {
      // Use followUpDate from visit if available
      let followUpDate = '';
      if (prescription.visit && prescription.visit.followUpDate) {
        followUpDate = formatInTz(prescription.visit.followUpDate, 'MMM d, yyyy', tz);
      }
      return (prescription.notes || followUpDate) ? `
        <div style="margin-top: 10px; line-height: 1.2; text-align: left;">
          <h3 style="margin-bottom: 4px;">Additional Notes:</h3>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            ${prescription.notes ? `<span>${e(prescription.notes)}</span>` : ''}
            ${followUpDate ? `<span style="font-weight: bold;"><strong>Follow-up Date:</strong> ${followUpDate}</span>` : ''}
          </div>
        </div>
        ` : '';
    })()}

      <div class="signature-section">
        <div class="signature-box">
          <div>${provider ? e(provider.name) : 'Provider'}</div>
          <div style="font-size: 12px; margin-top: 5px;">
            ${(() => {
      // The prescribing doctor's own credentials; clinic settings are only a fallback.
      const doctor = provider?.doctorProfile && typeof provider.doctorProfile === 'object' ? provider.doctorProfile : null;
      const licenseValue = doctor?.licenseNumber || provider?.licenseNumber || settingInfo?.licenseNumber;
      const licenseLine = licenseValue
        ? `License No: ${e(licenseValue)}`
        : 'License No: ____________';
      const ptrValue = doctor?.ptrNumber || doctor?.ptr || settingInfo?.ptr || settingInfo?.PTR;
      const ptrLine = ptrValue
        ? `<br>PTR No: ${e(ptrValue)}`
        : '<br>PTR No: ____________';
      return `${licenseLine}${ptrLine}`;
    })()}
          </div>
        </div>
      </div>

      ${protection.seal}

      <p>This prescription was generated digitally by ${e(clinicName)}.</p>
      <p>Please verify all information before dispensing. For questions or concerns, contact:</p>
      <p>
        ${settingInfo?.clinicPhone ? 'Tel: ' + e(settingInfo.clinicPhone) : ''}<br>
        ${settingInfo?.clinicEmail ? 'Email: ' + e(settingInfo.clinicEmail) : ''}
      </p>
      <p style="margin-top: 8px; font-weight: bold; color: #000000;">Powered by: DevCom Digital Marketing Services</p>
    </div>
  </div>
</body>
</html>
  `;
}

function formatAgeWithMonths(dateOfBirth?: string | Date): string {
  if (!dateOfBirth) {
    return 'N/A';
  }

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return 'N/A';
  }

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();

  if (now.getDate() < dob.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) {
    return months === 1 ? '1 month' : `${Math.max(months, 0)} months`;
  }

  if (months === 0) {
    return years === 1 ? '1 year' : `${years} years`;
  }

  const yearLabel = years === 1 ? 'year' : 'years';
  const monthLabel = months === 1 ? 'month' : 'months';

  return `${years} ${yearLabel}, ${months} ${monthLabel}`;
}
