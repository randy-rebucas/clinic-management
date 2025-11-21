import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
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
    const labResult = await LabResult.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth sex')
      .populate('visit', 'visitCode date visitType diagnoses chiefComplaint soapNotes')
      .populate('orderedBy', 'name email');

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    // Generate HTML for printable lab request form
    const html = generateLabRequestFormHTML(labResult);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating lab request form:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate lab request form' },
      { status: 500 }
    );
  }
}

function generateLabRequestFormHTML(labResult: any): string {
  const patient = labResult.patient;
  const provider = labResult.orderedBy;
  const visit = labResult.visit;
  const request = labResult.request;
  const orderDate = new Date(labResult.orderDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const urgencyColors: Record<string, string> = {
    routine: 'bg-blue-100 text-blue-800',
    urgent: 'bg-yellow-100 text-yellow-800',
    stat: 'bg-red-100 text-red-800',
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lab Request Form - ${labResult.requestCode}</title>
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
      .no-print {
        display: none;
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
      background-color: #f9fafb;
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
    .test-section {
      margin: 30px 0;
      padding: 20px;
      border: 2px solid #2563eb;
      border-radius: 5px;
    }
    .test-item {
      padding: 15px;
      margin: 10px 0;
      background-color: #f0f9ff;
      border-left: 4px solid #2563eb;
      border-radius: 4px;
    }
    .urgency-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 11px;
      margin-left: 10px;
      text-transform: uppercase;
    }
    .clinical-info {
      margin: 20px 0;
      padding: 15px;
      background-color: #fff7ed;
      border-left: 4px solid #f59e0b;
    }
    .instructions {
      margin: 20px 0;
      padding: 15px;
      background-color: #fef3c7;
      border-left: 4px solid #fbbf24;
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
    .print-button {
      margin-bottom: 20px;
      text-align: center;
    }
    .print-button button {
      padding: 12px 24px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="no-print print-button">
    <button onclick="window.print()">Print Request Form</button>
  </div>

  <div class="header">
    <h1>LABORATORY REQUEST FORM</h1>
    <div style="text-align: right; margin-top: -30px;">
      <strong>Request Code:</strong> ${labResult.requestCode}
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
    ${patient.sex ? `
    <div class="info-row">
      <div class="info-label">Gender:</div>
      <div>${patient.sex}</div>
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
    ${visit ? `
    <div class="info-row">
      <div class="info-label">Visit Date:</div>
      <div>${new Date(visit.date).toLocaleDateString()}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Visit Code:</div>
      <div>${visit.visitCode}</div>
    </div>
    ` : ''}
    ${provider ? `
    <div class="info-row">
      <div class="info-label">Requested By:</div>
      <div>${provider.name}</div>
    </div>
    ` : ''}
  </div>

  ${visit && (visit.diagnoses?.length > 0 || visit.chiefComplaint) ? `
  <div class="clinical-info">
    <h3 style="margin-top: 0;">Clinical Information</h3>
    ${visit.diagnoses?.length > 0 ? `
      <p><strong>Diagnosis:</strong> ${visit.diagnoses.map((d: any) => 
        `${d.code ? `(${d.code}) ` : ''}${d.description || ''}`
      ).join(', ')}</p>
    ` : ''}
    ${visit.chiefComplaint ? `
      <p><strong>Chief Complaint:</strong> ${visit.chiefComplaint}</p>
    ` : ''}
    ${visit.soapNotes?.assessment ? `
      <p><strong>Clinical Assessment:</strong> ${visit.soapNotes.assessment}</p>
    ` : ''}
  </div>
  ` : ''}

  <div class="test-section">
    <h2 style="margin-top: 0; color: #2563eb;">Requested Laboratory Test</h2>
    <div class="test-item">
      <strong>${request.testType}</strong>
      <span class="urgency-badge" style="background-color: ${request.urgency === 'stat' ? '#fee2e2' : request.urgency === 'urgent' ? '#fef3c7' : '#dbeafe'}; color: ${request.urgency === 'stat' ? '#991b1b' : request.urgency === 'urgent' ? '#92400e' : '#1e40af'};">
        ${request.urgency?.toUpperCase() || 'ROUTINE'}
      </span>
      ${request.testCode ? `<br><small style="color: #6b7280;">Test Code: ${request.testCode}</small>` : ''}
      ${request.description ? `<p style="margin: 8px 0 0 0;">${request.description}</p>` : ''}
    </div>
  </div>

  ${request.fastingRequired || request.preparationNotes || request.specialInstructions ? `
  <div class="instructions">
    <h3 style="margin-top: 0;">Special Instructions</h3>
    ${request.fastingRequired ? `
      <p><strong>⚠️ Fasting Required:</strong> Patient must fast for 8-12 hours before the test.</p>
    ` : ''}
    ${request.preparationNotes ? `
      <p><strong>Preparation:</strong> ${request.preparationNotes}</p>
    ` : ''}
    ${request.specialInstructions ? `
      <p><strong>Additional Instructions:</strong> ${request.specialInstructions}</p>
    ` : ''}
  </div>
  ` : ''}

  ${labResult.thirdPartyLab ? `
  <div style="margin: 20px 0; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 5px;">
    <h3 style="margin-top: 0;">Third-Party Laboratory</h3>
    <p><strong>Laboratory:</strong> ${labResult.thirdPartyLab.labName}</p>
    ${labResult.thirdPartyLab.labCode ? `<p><strong>Lab Code:</strong> ${labResult.thirdPartyLab.labCode}</p>` : ''}
    ${labResult.thirdPartyLab.externalRequestId ? `<p><strong>External Request ID:</strong> ${labResult.thirdPartyLab.externalRequestId}</p>` : ''}
    ${labResult.thirdPartyLab.status ? `<p><strong>Status:</strong> ${labResult.thirdPartyLab.status.toUpperCase()}</p>` : ''}
  </div>
  ` : ''}

  <div class="signature-section">
    <div class="signature-box">
      <div>${provider ? provider.name : 'Licensed Physician'}</div>
      <div style="font-size: 12px; margin-top: 5px;">Medical License Number</div>
      <div style="font-size: 11px; margin-top: 10px;">Date: ${today}</div>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated lab request form. Please verify all information before processing.</p>
    <p>For questions, please contact the requesting physician.</p>
    <p>Request Code: ${labResult.requestCode}</p>
  </div>
</body>
</html>
  `;
}

