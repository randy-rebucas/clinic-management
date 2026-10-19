import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { createAuditLog } from '@/lib/audit';
import { buildHealthSummary } from '@/lib/patient-health-summary';
import { generateHealthSummaryHTML } from '@/lib/health-summary-document';
import { readHealthSummaryLinkToken } from '@/lib/health-summary-link';
import { htmlToPdf, pdfFilename, pdfHeaders } from '@/lib/pdf';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { linkedRecords } from '@/app/api/patients/me/_lib/linked-records';
import { scopedTenantIds } from '@/app/api/patients/me/_lib/patient-scope';
import logger from '@/lib/logger';

export const maxDuration = 30;

const LIMIT = { name: 'health-summary-pdf', windowMs: 10 * 60 * 1000, maxRequests: 20 };

/**
 * GET /api/health-summary/:token — the patient's cross-clinic health summary as a PDF.
 * The token comes from POST /api/patients/me/health-summary/pdf-link and lasts 10 minutes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await consumeRateLimit(LIMIT, getClientIp(request.headers));
  if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many downloads. Try again later.' }, { status: 429 });

  const { token } = await params;
  const link = readHealthSummaryLinkToken(token);
  if (!link) {
    return NextResponse.json({ success: false, error: 'This link has expired. Open your health summary in the app again.' }, { status: 410 });
  }

  try {
    await connectDB();
    const patient = await Patient.findById(link.patientId).select('active tenantIds accountId').lean<{
      _id: unknown;
      active?: boolean;
      tenantIds?: unknown[];
      accountId?: unknown;
    } | null>();
    if (!patient || patient.active === false) {
      return NextResponse.json({ success: false, error: 'Health summary not available.' }, { status: 404 });
    }

    const linked = await linkedRecords(patient);
    const scope = scopedTenantIds(linked.tenantIds, link.tid ? { tid: link.tid } : null);
    const summary = await buildHealthSummary({ patientId: link.patientId, patientIds: linked.patientIds, scope });
    if (!summary) return NextResponse.json({ success: false, error: 'Health summary not available.' }, { status: 404 });

    const pdf = await htmlToPdf(generateHealthSummaryHTML(summary));

    // One entry per clinic whose records went into the document.
    await Promise.all(
      summary.clinics.map((clinic) =>
        createAuditLog({
          tenantId: clinic.tenantId,
          action: 'download',
          resource: 'patient',
          resourceId: link.patientId,
          dataSubject: link.patientId,
          description: 'Patient downloaded their cross-clinic health summary (PDF)',
          ipAddress: getClientIp(request.headers),
        })
      )
    );

    return new NextResponse(Buffer.from(pdf), {
      headers: pdfHeaders(pdfFilename('Health-summary', summary.patient.lastName, summary.generatedAt.slice(0, 10))),
    });
  } catch (error) {
    logger.error('Error rendering patient health summary PDF', error as Error);
    return NextResponse.json({ success: false, error: 'The PDF could not be created right now. Try again.' }, { status: 503 });
  }
}
