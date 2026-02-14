import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const copyType = searchParams.get('copy') || 'patient'; // 'patient' or 'clinic'

    // Get tenant context and settings
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const settings = await getSettings(tenantId);

    // Digital signature toggle: use tenant setting if present, else fallback to query param
    let showSignature = true;
    if (typeof settings.prescriptionDigitalSignatureEnabled === 'boolean') {
      showSignature = settings.prescriptionDigitalSignatureEnabled;
    } else {
      showSignature = searchParams.get('showSignature') !== '0';
    }
    
    const prescription = await Prescription.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth')
      .populate('prescribedBy', 'name email')
      .populate('visit', 'visitCode date followUpDate');

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
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
      console.log(`Updated patient copy tracking for prescription ${prescription._id}:`, prescription.visit);
      await prescription.save();
    } else if (copyType === 'clinic') {
      prescription.copies = prescription.copies || {};
      prescription.copies.clinicCopy = {
        ...prescription.copies.clinicCopy,
        archivedAt: new Date(),
        archivedBy: session.userId as any,
        location: 'Digital Archive',
      };
      await prescription.save();
    }

    // Generate HTML for printable prescription
    const html = generatePrescriptionHTML(prescription, copyType, showSignature);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating prescription print:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate prescription' },
      { status: 500 }
    );
  }
}

function generatePrescriptionHTML(prescription: any, copyType: string = 'patient', showSignature: boolean = true): string {
  const patient = prescription.patient;
  const provider = prescription.prescribedBy;
  const date = new Date(prescription.issuedAt).toLocaleDateString();
  const isPatientCopy = copyType === 'patient';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Prescription ${prescription.prescriptionCode}</title>
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
      color: #2563eb;
    }
    .info-section {
      margin-bottom: 20px;
    }
    .info-row {
      display: flex;
      margin-bottom: 8px;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
    }
    .medications {
      margin-top: 30px;
    }
    .medication-item {
      border: 1px solid #ddd;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 5px;
    }
    .medication-name {
      font-size: 18px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 8px;
    }
    .medication-details {
      margin-left: 20px;
      color: #4b5563;
    }
    .signature-section {
      margin-top: 40px;
      text-align: right;
    }
    .signature-box {
      display: inline-block;
      border-top: 1px solid #333;
      padding-top: 5px;
      margin-top: 60px;
      min-width: 200px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PRESCRIPTION ${isPatientCopy ? '(PATIENT COPY)' : '(CLINIC COPY)'}</h1>
    <div style="text-align: right; margin-top: -30px;">
      <strong>Code:</strong> ${prescription.prescriptionCode}
      ${!isPatientCopy ? `<br><small style="color: #6b7280;">Archived: ${new Date().toLocaleString()}</small>` : ''}
    </div>
  </div>

  <div class="info-section">
    <div class="info-row">
      <div class="info-label">Patient:</div>
      <div>${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (ID: ${patient.patientCode})` : ''}</div>
    </div>
    ${patient.dateOfBirth ? `
    <div class="info-row">
      <div class="info-label">Date of Birth:</div>
      <div>${new Date(patient.dateOfBirth).toLocaleDateString()}</div>
    </div>
    ` : ''}
    ${patient.phone ? `
    <div class="info-row">
      <div class="info-label">Phone:</div>
      <div>${patient.phone}</div>
    </div>
    ` : ''}
    <div class="info-row">
      <div class="info-label">Date Issued:</div>
      <div>${date}</div>
    </div>
    ${provider ? `
    <div class="info-row">
      <div class="info-label">Prescribed By:</div>
      <div>${provider.name}</div>
    </div>
    ` : ''}
  </div>

  <div class="medications">
    <h2 style="border-bottom: 1px solid #ddd; padding-bottom: 5px;">Medications</h2>
    ${prescription.medications.map((med: any, index: number) => `
      <div class="medication-item">
        <div class="medication-name">${index + 1}. ${med.name}${med.genericName ? ` (${med.genericName})` : ''}</div>
        <div class="medication-details">
          ${med.strength ? `<div><strong>Strength:</strong> ${med.strength}</div>` : ''}
          ${med.dose ? `<div><strong>Dose:</strong> ${med.dose}</div>` : ''}
          ${med.frequency ? `<div><strong>Frequency:</strong> ${med.frequency}</div>` : ''}
          ${med.durationDays ? `<div><strong>Duration:</strong> ${med.durationDays} day(s)</div>` : ''}
          ${med.quantity ? `<div><strong>Quantity:</strong> ${med.quantity}</div>` : ''}
          ${med.form ? `<div><strong>Form:</strong> ${med.form}</div>` : ''}
          ${med.route ? `<div><strong>Route:</strong> ${med.route}</div>` : ''}
          ${med.instructions ? `<div style="margin-top: 8px;"><strong>Instructions:</strong> ${med.instructions}</div>` : ''}
        </div>
      </div>
    `).join('')}
  </div>

  ${(() => {
    // Use followUpDate from visit if available
    let followUpDate = '';
    if (prescription.visit && prescription.visit.followUpDate) {
      followUpDate = new Date(prescription.visit.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return (prescription.notes || followUpDate) ? `
      <div style="margin-top: 30px;">
        <h3>Additional Notes:</h3>
        ${prescription.notes ? `<p>${prescription.notes}</p>` : ''}
        ${followUpDate ? `<p><strong>Follow-up Date:</strong> ${followUpDate}</p>` : ''}
      </div>
    ` : '';
  })()}

  <div class="signature-section">
    ${showSignature && prescription.digitalSignature ? `
      <div style="margin-bottom: 20px;">
        <img src="${prescription.digitalSignature.signatureData}" alt="Signature" style="max-height: 80px;" />
      </div>
    ` : ''}
    <div class="signature-box">
      <div>${provider ? provider.name : 'Provider'}</div>
      <div style="font-size: 12px; margin-top: 5px;">Licensed Physician</div>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated prescription. Please verify all information before dispensing.</p>
    <p>For questions, please contact the prescribing physician.</p>
  </div>
</body>
</html>
  `;
}

