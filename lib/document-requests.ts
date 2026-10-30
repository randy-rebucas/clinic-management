import type {
  DocumentRequestKind,
  DocumentRequestPurpose,
  DocumentRequestStatus,
} from '@/models/DocumentRequest';

/**
 * Document requests (models/DocumentRequest.ts): the rules shared by the patient routes
 * (/api/patients/me/document-requests), the staff routes (/api/document-requests) and the
 * download (/api/requested-documents/:token). Pure: no DB access.
 */

/** How long a released document stays downloadable. */
export const DOCUMENT_AVAILABLE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const KIND_LABELS: Record<DocumentRequestKind, string> = {
  medical_records: 'Medical records',
  medical_certificate: 'Medical certificate',
  clinical_abstract: 'Clinical abstract',
};

/** Request codes, numbered per clinic and kind. */
export const KIND_CODE_PREFIX: Record<DocumentRequestKind, string> = {
  medical_records: 'MRR',
  medical_certificate: 'MCR',
  clinical_abstract: 'CAR',
};

export const PURPOSE_LABELS: Record<DocumentRequestPurpose, string> = {
  personal: 'Personal copy',
  second_opinion: 'Second opinion or another doctor',
  sick_leave: 'Sick leave',
  school: 'School',
  fit_to_work: 'Fitness to work',
  insurance: 'Insurance or HMO claim',
  employment: 'Employment or school',
  travel: 'Travel or visa',
  legal: 'Legal matter',
  other: 'Other',
};

/** The purposes the app offers for each kind. */
export const KIND_PURPOSES: Record<DocumentRequestKind, readonly DocumentRequestPurpose[]> = {
  medical_records: ['personal', 'second_opinion', 'insurance', 'employment', 'travel', 'legal', 'other'],
  medical_certificate: ['sick_leave', 'school', 'fit_to_work', 'travel', 'insurance', 'legal', 'other'],
  clinical_abstract: ['insurance', 'employment', 'travel', 'second_opinion', 'legal', 'other'],
};

/** What the patient sees: a released document past its download window reads as expired. */
export type PatientRequestStatus = DocumentRequestStatus | 'expired';

type RequestLike = { status?: DocumentRequestStatus | string; availableUntil?: Date | null };

export function patientRequestStatus(r: RequestLike, now = new Date()): PatientRequestStatus {
  if (r.status === 'released' && r.availableUntil && new Date(r.availableUntil).getTime() <= now.getTime()) return 'expired';
  return r.status as DocumentRequestStatus;
}

export function isDownloadable(r: RequestLike, now = new Date()): boolean {
  return patientRequestStatus(r, now) === 'released';
}

export function availableUntilFrom(releasedAt: Date): Date {
  return new Date(releasedAt.getTime() + DOCUMENT_AVAILABLE_DAYS * DAY_MS);
}

/** A request as the patient app sees it. `r.visit` may be populated with visitCode and date. */
export function toPatientDocumentRequest(r: any, names: Map<string, string | null>, now = new Date()) {
  const status = patientRequestStatus(r, now);
  const visit = r.visit && typeof r.visit === 'object' && 'visitCode' in r.visit ? r.visit : null;
  return {
    _id: String(r._id),
    kind: r.kind,
    kindLabel: KIND_LABELS[r.kind as DocumentRequestKind] ?? r.kind,
    requestCode: r.requestCode,
    clinic: { tenantId: String(r.tenantId), name: names.get(String(r.tenantId)) ?? null },
    purpose: r.purpose,
    purposeLabel: PURPOSE_LABELS[r.purpose as DocumentRequestPurpose] ?? r.purpose,
    purposeNote: r.purposeNote ?? null,
    visit: r.visit ? { _id: String(visit?._id ?? r.visit), visitCode: visit?.visitCode ?? null, date: visit?.date ?? null } : null,
    periodFrom: r.periodFrom ?? null,
    periodTo: r.periodTo ?? null,
    status,
    requestedAt: r.createdAt,
    decidedAt: r.decidedAt ?? null,
    // Why it was declined or withdrawn; nothing staff wrote on a release.
    decisionNote: r.status === 'declined' || r.status === 'revoked' ? r.decisionNote ?? null : null,
    availableUntil: r.status === 'released' ? r.availableUntil ?? null : null,
    downloadable: status === 'released',
  };
}
