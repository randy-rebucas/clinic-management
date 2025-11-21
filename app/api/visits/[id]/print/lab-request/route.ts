import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

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
    const visit = await Visit.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth gender')
      .populate('provider', 'name email')
      .populate('labsOrdered');

    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    // Generate HTML for printable lab request
    const html = generateLabRequestHTML(visit);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating lab request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate lab request' },
      { status: 500 }
    );
  }
}

function generateLabRequestHTML(visit: any): string {
  const patient = visit.patient;
  const provider = visit.provider;
  const visitDate = new Date(visit.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Get primary diagnosis or first diagnosis
  const primaryDiagnosis = visit.diagnoses?.find((d: any) => d.primary) || visit.diagnoses?.[0];
  const diagnosisText = primaryDiagnosis
    ? `${primaryDiagnosis.code ? `(${primaryDiagnosis.code}) ` : ''}${primaryDiagnosis.description || ''}`
    : '';

  // Get lab tests from labsOrdered or from treatment plan
  const labTests = visit.labsOrdered && visit.labsOrdered.length > 0
    ? visit.labsOrdered.map((lab: any) => lab.testType || 'Lab Test').join(', ')
    : 'As per clinical indication';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lab Request - ${visit.visitCode}</title>
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
      border-bottom: 3px solid #2563eb;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #2563eb;
      font-size: 24px;
    }
    .info-section {
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f9f9f9;
      border-left: 4px solid #2563eb;
    }
    .info-row {
      display: flex;
      margin-bottom: 8px;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
    }
    .lab-tests {
      margin: 30px 0;
      padding: 20px;
      border: 2px solid #2563eb;
      border-radius: 5px;
    }
    .lab-tests h2 {
      margin-top: 0;
      color: #2563eb;
    }
    .test-item {
      padding: 10px;
      margin: 5px 0;
      background-color: #f0f9ff;
      border-left: 3px solid #2563eb;
    }
    .clinical-info {
      margin: 20px 0;
      padding: 15px;
      background-color: #fff7ed;
      border-left: 4px solid #f59e0b;
    }
    .signature-section {
      margin-top: 40px;
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
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    .urgency-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 12px;
      margin-left: 10px;
    }
    .urgency-routine {
      background-color: #dbeafe;
      color: #1e40af;
    }
    .urgency-urgent {
      background-color: #fee2e2;
      color: #991b1b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>LABORATORY REQUEST FORM</h1>
    <div style="text-align: right; margin-top: -30px;">
      <strong>Request Code:</strong> ${visit.visitCode}
    </div>
  </div>

  <div class="info-section">
    <div class="info-row">
      <div class="info-label">Patient Name:</div>
      <div>${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (ID: ${patient.patientCode})` : ''}</div>
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
    ${patient.phone ? `
    <div class="info-row">
      <div class="info-label">Phone:</div>
      <div>${patient.phone}</div>
    </div>
    ` : ''}
    <div class="info-row">
      <div class="info-label">Request Date:</div>
      <div>${today}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Visit Date:</div>
      <div>${visitDate}</div>
    </div>
    ${provider ? `
    <div class="info-row">
      <div class="info-label">Requested By:</div>
      <div>${provider.name}</div>
    </div>
    ` : ''}
  </div>

  ${diagnosisText ? `
  <div class="clinical-info">
    <h3 style="margin-top: 0;">Clinical Information</h3>
    <p><strong>Diagnosis:</strong> ${diagnosisText}</p>
    ${visit.chiefComplaint ? `
    <p><strong>Chief Complaint:</strong> ${visit.chiefComplaint}</p>
    ` : ''}
    ${visit.soapNotes?.assessment ? `
    <p><strong>Clinical Assessment:</strong> ${visit.soapNotes.assessment}</p>
    ` : ''}
  </div>
  ` : ''}

  <div class="lab-tests">
    <h2>Requested Laboratory Tests</h2>
    ${visit.labsOrdered && visit.labsOrdered.length > 0 ? `
      ${visit.labsOrdered.map((lab: any, index: number) => `
        <div class="test-item">
          <strong>${index + 1}. ${lab.testType || 'Lab Test'}</strong>
          ${lab.status ? `<span class="urgency-badge ${lab.status === 'ordered' ? 'urgency-routine' : 'urgency-urgent'}">${lab.status.toUpperCase()}</span>` : ''}
          ${lab.interpretation ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">${lab.interpretation}</p>` : ''}
        </div>
      `).join('')}
    ` : `
      <div class="test-item">
        <strong>${labTests}</strong>
        <span class="urgency-badge urgency-routine">ROUTINE</span>
      </div>
    `}
  </div>

  ${visit.notes ? `
  <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border-left: 4px solid #6b7280;">
    <h3 style="margin-top: 0;">Special Instructions:</h3>
    <p>${visit.notes}</p>
  </div>
  ` : ''}

  <div class="signature-section">
    ${visit.digitalSignature ? `
      <div style="margin-bottom: 20px;">
        <img src="${visit.digitalSignature.signatureData}" alt="Signature" style="max-height: 80px;" />
      </div>
    ` : ''}
    <div class="signature-box">
      <div>${provider ? provider.name : 'Licensed Physician'}</div>
      <div style="font-size: 12px; margin-top: 5px;">Medical License Number</div>
      <div style="font-size: 11px; margin-top: 10px;">Date: ${today}</div>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated lab request form. Please verify all information before processing.</p>
    <p>For questions, please contact the requesting physician.</p>
    <p>Visit Code: ${visit.visitCode}</p>
  </div>
</body>
</html>
  `;
}

