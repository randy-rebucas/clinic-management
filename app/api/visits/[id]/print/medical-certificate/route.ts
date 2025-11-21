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
      .populate('provider', 'name email');

    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    // Generate HTML for printable medical certificate
    const html = generateMedicalCertificateHTML(visit);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating medical certificate:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate medical certificate' },
      { status: 500 }
    );
  }
}

function generateMedicalCertificateHTML(visit: any): string {
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
    : 'Medical condition';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Medical Certificate - ${visit.visitCode}</title>
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
    .stamp {
      margin-top: 20px;
      text-align: center;
    }
    .stamp-box {
      display: inline-block;
      border: 2px dashed #333;
      padding: 15px 30px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MEDICAL CERTIFICATE</h1>
  </div>

  <div class="certificate-body">
    <p>This is to certify that I have examined <strong>${patient.firstName} ${patient.lastName}</strong>${patient.patientCode ? ` (Patient ID: ${patient.patientCode})` : ''} on <strong>${visitDate}</strong>.</p>

    <div class="patient-info">
      <div class="info-row">
        <span class="info-label">Patient Name:</span>
        <span>${patient.firstName} ${patient.lastName}</span>
      </div>
      ${patient.dateOfBirth ? `
      <div class="info-row">
        <span class="info-label">Date of Birth:</span>
        <span>${new Date(patient.dateOfBirth).toLocaleDateString()}</span>
      </div>
      ` : ''}
      ${patient.gender ? `
      <div class="info-row">
        <span class="info-label">Gender:</span>
        <span>${patient.gender}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="info-label">Visit Date:</span>
        <span>${visitDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Visit Code:</span>
        <span>${visit.visitCode}</span>
      </div>
    </div>

    ${visit.chiefComplaint ? `
    <p><strong>Chief Complaint:</strong> ${visit.chiefComplaint}</p>
    ` : ''}

    ${primaryDiagnosis ? `
    <p><strong>Diagnosis:</strong> ${diagnosisText}</p>
    ` : ''}

    ${visit.soapNotes?.assessment ? `
    <p><strong>Clinical Assessment:</strong> ${visit.soapNotes.assessment}</p>
    ` : ''}

    ${visit.treatmentPlan?.followUp?.instructions ? `
    <p><strong>Recommendations:</strong> ${visit.treatmentPlan.followUp.instructions}</p>
    ` : ''}

    ${visit.followUpDate ? `
    <p><strong>Follow-up Date:</strong> ${new Date(visit.followUpDate).toLocaleDateString()}</p>
    ` : ''}
  </div>

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

  <div class="stamp">
    <div class="stamp-box">
      OFFICIAL MEDICAL CERTIFICATE
    </div>
  </div>

  <div class="footer">
    <p>This certificate is issued based on medical examination conducted on the date specified above.</p>
    <p>For verification, please contact the clinic with Visit Code: ${visit.visitCode}</p>
  </div>
</body>
</html>
  `;
}

