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
    const settingInfo = await getSettings(tenantId);

    const prescription = await Prescription.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth address gender')
      .populate({
        path: 'prescribedBy',
        select: 'name email doctorProfile licenseNumber',
        populate: {
          path: 'doctorProfile',
          select: 'licenseNumber'
        }
      })
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
    const html = generatePrescriptionHTML(prescription, copyType, showSignature, settingInfo);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {

    return NextResponse.json(
      { success: false, error: 'Failed to generate prescription' },
      { status: 500 }
    );
  }
}

function generatePrescriptionHTML(prescription: any, copyType: string = 'patient', showSignature: boolean = true, settingInfo: any): string {

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
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 200);
    };
  </script>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 10mm;
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
      margin-bottom: 2px;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
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
      color: #1f2937;
    }
    .medication-details {
      margin-left: 20px;
      color: #4b5563;
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
      color: #6b7280;
      text-align: center;
    }
    .footer p {
      margin: unset;
      line-height: 14px;
    }
  </style>
</head>
<body>
  <div style="display: flex; flex-direction: column; min-height: calc(100vh - 50px);">
    <!-- HEADER ROW -->
    <div class="header" style="flex: 0 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin-bottom: 4px;">${settingInfo && settingInfo.clinicName ? settingInfo.clinicName : 'Clinic Name'}</h1>
          <div style="font-size: 14px; color: #374151;">${settingInfo && settingInfo.clinicAddress ? settingInfo.clinicAddress : ''}</div>
          <div style="font-size: 14px; color: #374151;">${settingInfo && settingInfo.clinicPhone ? 'Tel: ' + settingInfo.clinicPhone : ''}</div>
          <div style="font-size: 14px; color: #374151;">${settingInfo && settingInfo.clinicEmail ? 'Email: ' + settingInfo.clinicEmail : ''}</div>
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; color: #2563eb;">PRESCRIPTION ${isPatientCopy ? '(PATIENT COPY)' : '(CLINIC COPY)'}</h2>
          <strong>Code:</strong> ${prescription.prescriptionCode}<br>
          ${!isPatientCopy ? `<small style="color: #6b7280;">Archived: ${new Date().toLocaleString()}</small>` : ''}
        </div>
      </div>
    </div>

    <!-- CONTENT ROW -->
    <div style="flex: 1 1 auto;">
      <div class="info-section" style="display: flex; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div class="info-row">
            <div class="info-label">Patient:</div>
            <div>${patient.firstName} ${patient.lastName}</div>
          </div>
          ${patient.dateOfBirth ? `
          <div class="info-row">
            <div class="info-label">Date of Birth:</div>
            <div>${new Date(patient.dateOfBirth).toLocaleDateString()}</div>
          </div>
          ` : ''}
          ${patient.gender ? `
          <div class="info-row">
            <div class="info-label">Gender:</div>
            <div>${patient.gender}</div>
          </div>
          ` : ''}
          ${patient.dateOfBirth ? `
          <div class="info-row">
            <div class="info-label">Age:</div>
            <div>${(() => {
        const dob = new Date(patient.dateOfBirth);
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const m = now.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
          age--;
        }
        return age;
      })()}</div>
          </div>
          ` : ''}
        </div>
        <div style="flex: 1; min-width: 280px;">
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
        </div>
        ${patient.address ? `
        <div class="info-row">
          <div class="info-label">Address:</div>
          <div>${(() => {
        if (typeof patient.address === 'object' && patient.address !== null) {
          const { street, city, state, zipCode } = patient.address;
          return [street, city, state, zipCode].filter(Boolean).join(', ');
        }
        return patient.address;
      })()}</div>
        </div>
        ` : ''}
      </div>

      <div class="medications">
        ${prescription.medications.map((med: any, index: number) => `
          <div class="medication-item">
            <div class="medication-name" style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center;">
              <span>${index + 1}. ${med.name}</span>
              ${med.genericName ? `<span>(${med.genericName})</span>` : ''}
              ${med.quantity ? `<span>` : ''}
            </div>
            <div class="medication-details" style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between;">
              ${med.instructions ? `<span><strong>Sig:</strong> <b>${med.instructions}</b></span>` : ''} 
              ${med.quantity ? `<span><strong>#</strong> ${med.quantity}</span>` : ''}
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
        followUpDate = new Date(prescription.visit.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return (prescription.notes || followUpDate) ? `
        <div style="margin-top: 10px; line-height: 1.2; text-align: left;">
          <h3 style="margin-bottom: 4px;">Additional Notes:</h3>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            ${prescription.notes ? `<span>${prescription.notes}</span>` : ''}
            ${followUpDate ? `<span style="font-weight: bold;"><strong>Follow-up Date:</strong> ${followUpDate}</span>` : ''}
          </div>
        </div>
        ` : '';
    })()}

      <div class="signature-section">
        <div class="signature-box">
          <div>${provider ? provider.name : 'Provider'}</div>
          <div style="font-size: 12px; margin-top: 5px;">
            ${(() => {
      return settingInfo.licenseNumber ? `License No: ${settingInfo.licenseNumber}` : 'License No: ____________';
    })()}
          </div>
        </div>
      </div>

      <p>This prescription was generated digitally by ${settingInfo && settingInfo.clinicName ? settingInfo.clinicName : 'the clinic'}.</p>
      <p>Please verify all information before dispensing. For questions or concerns, contact:</p>
      <p>
        ${settingInfo && settingInfo.clinicPhone ? 'Tel: ' + settingInfo.clinicPhone : ''}<br>
        ${settingInfo && settingInfo.clinicEmail ? 'Email: ' + settingInfo.clinicEmail : ''}
      </p>
      <p style="margin-top: 8px; font-weight: bold; color: #2563eb;">Powered by: DevCom Digital Marketing Services</p>
    </div>
  </div>
</body>
</html>
  `;
}

