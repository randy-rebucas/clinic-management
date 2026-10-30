import 'server-only';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { buildHealthSummary, type HealthSummary } from '@/lib/patient-health-summary';
import { generateHealthSummaryHTML } from '@/lib/health-summary-document';
import { htmlToPdf, pdfFilename } from '@/lib/pdf';
import { linkedRecords } from '@/app/api/patients/me/_lib/linked-records';
import { scopedTenantIds } from '@/app/api/patients/me/_lib/patient-scope';

/**
 * The patient's cross-clinic health summary as a PDF, for the public link routes
 * (GET /api/health-summary/:token, GET /api/share/:token). Covers every record linked to the
 * patient, narrowed to `tid` when the link carries one: the same clinics the app showed.
 *
 * Null when the patient is gone or inactive. Throws when the PDF can't be rendered.
 */
export async function renderHealthSummaryPdf(
  patientId: string,
  tid: string | undefined
): Promise<{ pdf: Uint8Array; summary: HealthSummary; filename: string } | null> {
  await connectDB();
  const patient = await Patient.findById(patientId).select('active tenantIds accountId').lean<{
    _id: unknown;
    active?: boolean;
    tenantIds?: unknown[];
    accountId?: unknown;
  } | null>();
  if (!patient || patient.active === false) return null;

  const linked = await linkedRecords(patient);
  const scope = scopedTenantIds(linked.tenantIds, tid ? { tid } : null);
  const summary = await buildHealthSummary({ patientId, patientIds: linked.patientIds, scope });
  if (!summary) return null;

  const pdf = await htmlToPdf(generateHealthSummaryHTML(summary));
  return { pdf, summary, filename: pdfFilename('Health-summary', summary.patient.lastName, summary.generatedAt.slice(0, 10)) };
}
