import 'server-only';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { issueSeal, type IssuedSeal } from '@/lib/document-seal';
import { loadSigner } from '@/lib/doctor-signature';
import { pdfFilename } from '@/lib/pdf';
import { PURPOSE_LABELS } from '@/lib/document-requests';
import { loadMedicalRecords } from '@/lib/medical-records';
import { medicalRecordsHtml } from '@/lib/medical-records-document';
import { generateMedicalCertificateHTML, populateVisitForCertificate } from '@/lib/medical-certificate';
import { clinicalAbstractHtml, missingAbstractFields } from '@/lib/clinical-abstract';
import type { DocumentRequestPurpose } from '@/models/DocumentRequest';

/**
 * The document a request asks for, as HTML: for the staff preview (`sealed: false`) and the
 * patient download (`sealed: true`, a patient copy; repeat downloads of unchanged content carry
 * the same seal). `r` is a DocumentRequest with `decidedBy` populated with `name`.
 *
 * Null when it can't be issued (any more): the patient's record at the clinic is gone, the
 * certificate's visit was cancelled or turned back into a draft, or the abstract isn't written.
 */
export async function renderRequestedDocument(
  request: NextRequest,
  r: any,
  { sealed }: { sealed: boolean }
): Promise<{ html: string; filename: string; seal: IssuedSeal | null } | null> {
  const tenantId = String(r.tenantId);
  const [settings, tz] = await Promise.all([getSettings(tenantId), getTenantTimezone(tenantId)]);

  if (r.kind === 'medical_certificate') {
    const visit = await populateVisitForCertificate(
      Visit.findOne({ _id: r.visit, tenantId: new Types.ObjectId(tenantId), patient: r.patient }),
      new Types.ObjectId(tenantId)
    );
    if (!visit || !visit.patient || visit.status === 'cancelled' || visit.status === 'draft') return null;
    const [signer, seal] = await Promise.all([
      loadSigner({ tenantId, userId: visit.provider?._id }),
      sealed
        ? issueSeal({ request, documentType: 'medical_certificate', document: visit, tenantId, copyType: 'patient', reuse: true })
        : Promise.resolve(null),
    ]);
    const html = generateMedicalCertificateHTML(visit, settings, seal, tz, signer, { purpose: purposePhrase(r) });
    return { html, filename: pdfFilename('Medical-Certificate', visit.visitCode), seal };
  }

  if (r.kind === 'clinical_abstract') {
    if (missingAbstractFields(r.abstract).length) return null;
    const patient = await Patient.findOne({ _id: r.patient, tenantIds: new Types.ObjectId(tenantId) })
      .select('firstName middleName lastName suffix dateOfBirth sex patientCode')
      .lean();
    if (!patient) return null;
    const [signer, seal] = await Promise.all([
      loadSigner({ tenantId, userId: r.abstractAuthor }),
      sealed
        ? issueSeal({ request, documentType: 'clinical_abstract', document: r, tenantId, copyType: 'patient', reuse: true })
        : Promise.resolve(null),
    ]);
    const html = clinicalAbstractHtml({
      request: { requestCode: r.requestCode, purpose: purposePhrase(r), abstract: r.abstract, savedAt: r.abstractSavedAt },
      patient,
      settings,
      tz,
      seal,
      signer,
    });
    return { html, filename: pdfFilename('Clinical-Abstract', r.requestCode), seal };
  }

  const records = await loadMedicalRecords(r, tz);
  if (!records) return null;
  const seal = sealed
    ? await issueSeal({ request, documentType: 'medical_records', document: r, tenantId, copyType: 'patient', reuse: true })
    : null;
  const html = medicalRecordsHtml({
    request: {
      requestCode: r.requestCode,
      purpose: r.purpose,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      cutoff: r.cutoff ?? null,
      releasedByName: r.decidedBy?.name ?? null,
    },
    records,
    settings,
    tz,
    seal,
  });
  return { html, filename: pdfFilename('Medical-Records', r.requestCode), seal };
}

/** "sick leave", "insurance or HMO claim"; for "other", what the patient wrote. */
export function purposePhrase(r: { purpose: string; purposeNote?: string | null }): string | null {
  if (r.purpose === 'other') return r.purposeNote?.trim() || null;
  const label = PURPOSE_LABELS[r.purpose as DocumentRequestPurpose];
  return label ? label[0].toLowerCase() + label.slice(1) : null;
}
