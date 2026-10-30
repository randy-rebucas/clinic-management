import { describe, it, expect, beforeEach, vi } from 'vitest';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn(async () => null) }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn(async () => ({ tenantId: null })) }));
vi.mock('@/app/lib/dal', () => ({ deriveKey: (purpose: string) => Buffer.from(`test-key-${purpose}`) }));
vi.mock('@/lib/counters', () => ({ nextSequence: vi.fn(async () => 7), maxCodeSeed: vi.fn(), formatCode: (p: string, n: number) => `${p}-${String(n).padStart(6, '0')}` }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToTenant: vi.fn(), sendPushToPatientDevices: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({
  requirePermission: vi.fn(async () => null),
  isAdmin: (s: { role?: string } | null) => s?.role === 'admin' || s?.role === 'owner',
}));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn(), exists: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Prescription', () => ({ default: { find: vi.fn() } }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));
vi.mock('@/models/DocumentSeal', () => ({ default: { updateMany: vi.fn() } }));
vi.mock('@/models/DocumentRequest', () => ({
  DOCUMENT_REQUEST_KINDS: ['medical_records', 'medical_certificate', 'clinical_abstract'],
  CLINICAL_ABSTRACT_FIELDS: ['consultations', 'chiefComplaint', 'history', 'findings', 'diagnostics', 'diagnosis', 'management', 'condition', 'recommendations'],
  DOCUMENT_REQUEST_PURPOSES: ['personal', 'second_opinion', 'sick_leave', 'school', 'fit_to_work', 'insurance', 'employment', 'travel', 'legal', 'other'],
  default: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), exists: vi.fn(), create: vi.fn(), countDocuments: vi.fn() },
}));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { createAuditLog } from '@/lib/audit';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { nextSequence } from '@/lib/counters';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import Visit from '@/models/Visit';
import DocumentSeal from '@/models/DocumentSeal';
import DocumentRequest from '@/models/DocumentRequest';
import { GET, POST } from '@/app/api/patients/me/document-requests/route';
import { DELETE } from '@/app/api/patients/me/document-requests/[id]/route';
import { POST as pdfLink } from '@/app/api/patients/me/document-requests/[id]/pdf-link/route';
import { PATCH } from '@/app/api/document-requests/[id]/route';
import { GET as getAbstract, PUT as putAbstract } from '@/app/api/document-requests/[id]/abstract/route';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import { readDocumentRequestLinkToken } from '@/lib/document-request-link';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439022';
const REQUEST_ID = '507f1f77bcf86cd799439088';
const STAFF_ID = '507f1f77bcf86cd799439099';
const VISIT_ID = '507f1f77bcf86cd7994390aa';
const DAY = 24 * 60 * 60 * 1000;

const chain = (result: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(result) };
  for (const m of ['select', 'populate', 'sort', 'limit', 'skip']) q[m] = vi.fn().mockReturnValue(q);
  return q;
};

const requestRow = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(REQUEST_ID),
  tenantId: new Types.ObjectId(TENANT_A),
  patient: new Types.ObjectId(PATIENT_ID),
  kind: 'medical_records',
  requestCode: 'MRR-000007',
  purpose: 'insurance',
  status: 'pending',
  decisionNote: 'internal note',
  createdAt: new Date('2026-10-01T02:00:00Z'),
  ...over,
});

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
const idParams = (id = REQUEST_ID) => ({ params: Promise.resolve({ id }) });
const create = (body: unknown) => POST(json('http://localhost/api/patients/me/document-requests', 'POST', body));

function signIn(tenantIds: string[]) {
  vi.mocked(Patient.findById).mockReturnValue(chain({ _id: new Types.ObjectId(PATIENT_ID), tenantIds: tenantIds.map((t) => new Types.ObjectId(t)) }));
}

function acceptCreate() {
  vi.mocked(DocumentRequest.exists).mockResolvedValue(null as any);
  vi.mocked(DocumentRequest.create).mockImplementation(
    async (doc: any) => ({ ...doc, _id: new Types.ObjectId(REQUEST_ID), status: 'pending', toObject() { return { ...doc, _id: REQUEST_ID, status: 'pending' }; } }) as any
  );
}

describe('patient document requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Tenant.find).mockReturnValue(chain([{ _id: TENANT_A, name: 'Sunrise Clinic' }]));
    signIn([TENANT_A]);
  });

  it('lists requests gated by eMCR records, hiding staff-only fields, with the purposes per kind', async () => {
    const q = chain([requestRow({ status: 'released', availableUntil: new Date(Date.now() + DAY) })]);
    vi.mocked(DocumentRequest.find).mockReturnValue(q);
    const res = await GET(new NextRequest('http://localhost/api/patients/me/document-requests'));
    expect(res.status).toBe(200);
    expect(requireActiveEmcr).toHaveBeenCalledWith(expect.anything(), 'records');
    expect(q.select.mock.calls[0][0]).toContain('-decidedBy');
    const body = await res.json();
    expect(body.data.requests[0]).toMatchObject({
      kind: 'medical_records',
      kindLabel: 'Medical records',
      requestCode: 'MRR-000007',
      clinic: { tenantId: TENANT_A, name: 'Sunrise Clinic' },
      purposeLabel: 'Insurance or HMO claim',
      status: 'released',
      downloadable: true,
      // A note on a release is for staff; only declines and withdrawals show one.
      decisionNote: null,
    });
    expect(body.data.purposes.medical_certificate.map((p: any) => p.value)).toContain('sick_leave');
  });

  describe('medical records', () => {
    it('creates a request at the only clinic with a clinic-numbered code', async () => {
      acceptCreate();
      const res = await create({ kind: 'medical_records', purpose: 'second_opinion', periodFrom: '2026-01-01' });
      expect(res.status).toBe(201);
      const created = vi.mocked(DocumentRequest.create).mock.calls[0][0] as any;
      expect(String(created.tenantId)).toBe(TENANT_A);
      expect(String(created.patient)).toBe(PATIENT_ID);
      expect(created.requestCode).toBe('MRR-000007');
      expect(vi.mocked(nextSequence).mock.calls[0][1]).toBe('document_request:medical_records');
      expect((await res.json()).data.request).toMatchObject({ status: 'pending', periodFrom: '2026-01-01', periodTo: null, visit: null });
      expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A, action: 'create', dataSubject: PATIENT_ID }));
    });

    it('asks which clinic when the person has several, and refuses clinics that are not theirs', async () => {
      signIn([TENANT_A, TENANT_B]);
      const ambiguous = await create({ kind: 'medical_records', purpose: 'personal' });
      expect(ambiguous.status).toBe(400);
      expect((await ambiguous.json()).code).toBe('CHOOSE_CLINIC');

      const foreign = await create({ kind: 'medical_records', purpose: 'personal', tenantId: '507f1f77bcf86cd7994390ff' });
      expect(foreign.status).toBe(404);
      expect(DocumentRequest.create).not.toHaveBeenCalled();
    });

    it('validates purposes, notes and the period', async () => {
      for (const body of [
        { kind: 'medical_records', purpose: 'other' },
        { kind: 'medical_records', purpose: 'sick_leave' },
        { kind: 'medical_records', purpose: 'personal', periodFrom: '2026-05-01', periodTo: '2026-01-01' },
        { kind: 'medical_records', purpose: 'personal', visitId: VISIT_ID },
      ]) {
        expect((await create(body)).status).toBe(400);
      }
      expect(DocumentRequest.create).not.toHaveBeenCalled();
    });

    it('allows one pending request of a kind per clinic, including when two arrive at once', async () => {
      vi.mocked(DocumentRequest.exists).mockResolvedValue({ _id: REQUEST_ID } as any);
      const res = await create({ kind: 'medical_records', purpose: 'personal' });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ALREADY_PENDING');
      expect((vi.mocked(DocumentRequest.exists).mock.calls as any)[0][0]).toMatchObject({ kind: 'medical_records', status: 'pending' });

      vi.mocked(DocumentRequest.exists).mockResolvedValue(null as any);
      vi.mocked(DocumentRequest.create).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
      expect((await create({ kind: 'medical_records', purpose: 'personal' })).status).toBe(409);
    });
  });

  describe('medical certificates', () => {
    const visitRow = { _id: new Types.ObjectId(VISIT_ID), tenantId: new Types.ObjectId(TENANT_B), patient: new Types.ObjectId(PATIENT_ID), visitCode: 'V-000201', date: new Date('2026-10-28T02:00:00Z') };

    it('certifies one of the person’s own written-up visits, at that visit’s clinic', async () => {
      signIn([TENANT_A, TENANT_B]);
      acceptCreate();
      vi.mocked(Visit.findOne).mockReturnValue(chain(visitRow));

      const res = await create({ kind: 'medical_certificate', purpose: 'sick_leave', visitId: VISIT_ID });
      expect(res.status).toBe(201);
      const filter = (vi.mocked(Visit.findOne).mock.calls as any)[0][0];
      expect(filter.patient).toEqual({ $in: [new Types.ObjectId(PATIENT_ID)] });
      expect(filter.tenantId.$in.map(String)).toEqual([TENANT_A, TENANT_B]);
      expect(filter.status).toEqual({ $in: ['open', 'closed'] });

      const created = vi.mocked(DocumentRequest.create).mock.calls[0][0] as any;
      expect(String(created.tenantId)).toBe(TENANT_B);
      expect(String(created.visit)).toBe(VISIT_ID);
      expect(created.requestCode).toBe('MCR-000007');
      expect(created).not.toHaveProperty('periodFrom');
      expect((await res.json()).data.request).toMatchObject({ kind: 'medical_certificate', visit: { _id: VISIT_ID, visitCode: 'V-000201' } });
    });

    it('needs a visit, only certificate purposes, and no clinic or period', async () => {
      for (const body of [
        { kind: 'medical_certificate', purpose: 'sick_leave' },
        { kind: 'medical_certificate', purpose: 'second_opinion', visitId: VISIT_ID },
        { kind: 'medical_certificate', purpose: 'sick_leave', visitId: VISIT_ID, periodFrom: '2026-01-01' },
        { kind: 'medical_certificate', purpose: 'sick_leave', visitId: VISIT_ID, tenantId: TENANT_A },
      ]) {
        expect((await create(body)).status).toBe(400);
      }
    });

    it('404s for a visit that isn’t theirs, or is a draft or cancelled', async () => {
      vi.mocked(Visit.findOne).mockReturnValue(chain(null));
      expect((await create({ kind: 'medical_certificate', purpose: 'school', visitId: VISIT_ID })).status).toBe(404);
      expect(DocumentRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('clinical abstracts', () => {
    it('asks a clinic like a records request, without a period or a visit', async () => {
      acceptCreate();
      const res = await create({ kind: 'clinical_abstract', purpose: 'employment' });
      expect(res.status).toBe(201);
      const created = vi.mocked(DocumentRequest.create).mock.calls[0][0] as any;
      expect(created.requestCode).toBe('CAR-000007');
      expect(String(created.tenantId)).toBe(TENANT_A);
      expect(created).not.toHaveProperty('periodFrom');

      for (const body of [
        { kind: 'clinical_abstract', purpose: 'employment', periodFrom: '2026-01-01' },
        { kind: 'clinical_abstract', purpose: 'employment', visitId: VISIT_ID },
        { kind: 'clinical_abstract', purpose: 'sick_leave' },
      ]) {
        expect((await create(body)).status).toBe(400);
      }
    });
  });

  it('cancels only a pending request', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow({ status: 'released' })));
    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(null));
    const res = await DELETE(json(`http://localhost/api/patients/me/document-requests/${REQUEST_ID}`, 'DELETE'), idParams());
    expect(res.status).toBe(409);
    expect((vi.mocked(DocumentRequest.findOneAndUpdate).mock.calls as any)[0][0]).toMatchObject({ status: 'pending' });
  });

  it('never finds another person’s request', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(null));
    const res = await pdfLink(json('http://localhost/x', 'POST'), idParams());
    expect(res.status).toBe(404);
    const filter = (vi.mocked(DocumentRequest.findOne).mock.calls as any)[0][0];
    expect(filter.patient).toEqual({ $in: [new Types.ObjectId(PATIENT_ID)] });
    expect(filter.tenantId).toEqual({ $in: [new Types.ObjectId(TENANT_A)] });
  });

  it('links to a released document only while it is downloadable', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow()));
    const pending = await pdfLink(json('http://localhost/x', 'POST'), idParams());
    expect(pending.status).toBe(409);
    expect((await pending.json()).code).toBe('NOT_RELEASED');

    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow({ status: 'released', availableUntil: new Date(Date.now() - 1000) })));
    expect((await pdfLink(json('http://localhost/x', 'POST'), idParams())).status).toBe(410);

    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow({ status: 'released', availableUntil: new Date(Date.now() + DAY) })));
    const ok = await pdfLink(json('http://localhost/x', 'POST'), idParams());
    expect(ok.status).toBe(200);
    const { url } = (await ok.json()).data;
    expect(readDocumentRequestLinkToken(url.split('/api/requested-documents/')[1])).toBe(REQUEST_ID);
  });
});

describe('staff decisions on document requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: STAFF_ID, email: 'doc@clinic.ph', role: 'doctor', tenantId: TENANT_A },
      tenantId: TENANT_A,
      tenantObjectId: new Types.ObjectId(TENANT_A),
    } as any);
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow()));
    vi.mocked(Patient.exists).mockResolvedValue({ _id: PATIENT_ID } as any);
    vi.mocked(Visit.exists).mockResolvedValue({ _id: VISIT_ID } as any);
  });

  const patch = (body: unknown) => PATCH(json(`http://localhost/api/document-requests/${REQUEST_ID}`, 'PATCH', body), idParams());
  const certificate = (over: Record<string, unknown> = {}) =>
    requestRow({ kind: 'medical_certificate', requestCode: 'MCR-000001', visit: new Types.ObjectId(VISIT_ID), ...over });

  it('needs visits write', async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce(NextResponse.json({ success: false }, { status: 403 }) as any);
    expect((await patch({ action: 'release' })).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'visits', 'write');
  });

  it('releasing records sets the cutoff and a 30-day window, from pending only, and tells the patient', async () => {
    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(requestRow({ status: 'released' })));
    const before = Date.now();
    expect((await patch({ action: 'release' })).status).toBe(200);
    const [filter, update] = (vi.mocked(DocumentRequest.findOneAndUpdate).mock.calls as any)[0];
    expect(filter).toMatchObject({ status: 'pending', tenantId: new Types.ObjectId(TENANT_A) });
    expect(update.$set.status).toBe('released');
    expect(update.$set.cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(update.$set.availableUntil.getTime() - update.$set.cutoff.getTime()).toBe(30 * DAY);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'data_export', dataSubject: PATIENT_ID }));
    // Sent from after(), behind the audit write.
    await vi.waitFor(() =>
      expect(sendPushToPatientDevices).toHaveBeenCalledWith(PATIENT_ID, expect.objectContaining({ tag: `document-request-${REQUEST_ID}` }), expect.anything())
    );
  });

  it('releasing a certificate needs its visit still written up, and sets no cutoff', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(certificate()));
    vi.mocked(Visit.exists).mockResolvedValueOnce(null as any);
    expect((await patch({ action: 'release' })).status).toBe(409);
    expect(DocumentRequest.findOneAndUpdate).not.toHaveBeenCalled();

    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(certificate({ status: 'released' })));
    expect((await patch({ action: 'release' })).status).toBe(200);
    expect((vi.mocked(Visit.exists).mock.calls as any)[1][0]).toMatchObject({ tenantId: new Types.ObjectId(TENANT_A), status: { $in: ['open', 'closed'] } });
    const update = (vi.mocked(DocumentRequest.findOneAndUpdate).mock.calls as any)[0][1];
    expect(update.$set).not.toHaveProperty('cutoff');
    expect(update.$set.availableUntil).toBeInstanceOf(Date);
  });

  it('only doctors and admins release a certificate', async () => {
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: STAFF_ID, email: 'nurse@clinic.ph', role: 'nurse' },
      tenantId: TENANT_A,
      tenantObjectId: new Types.ObjectId(TENANT_A),
    } as any);
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(certificate()));
    const res = await patch({ action: 'release' });
    expect(res.status).toBe(403);
    expect(DocumentRequest.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses to release for a record that is no longer active', async () => {
    vi.mocked(Patient.exists).mockResolvedValue(null as any);
    expect((await patch({ action: 'release' })).status).toBe(409);
    expect(DocumentRequest.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('decline needs a reason; revoke works on released documents only', async () => {
    expect((await patch({ action: 'decline' })).status).toBe(400);

    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(null));
    expect((await patch({ action: 'revoke' })).status).toBe(409);
    expect((vi.mocked(DocumentRequest.findOneAndUpdate).mock.calls as any)[0][0]).toMatchObject({ status: 'released' });
    expect(sendPushToPatientDevices).not.toHaveBeenCalled();
  });

  it('withdrawing a certificate voids the patient copies issued since its release', async () => {
    const releasedAt = new Date('2026-10-29T02:00:00Z');
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(certificate({ status: 'released', decidedAt: releasedAt })));
    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(certificate({ status: 'revoked' })));
    expect((await patch({ action: 'revoke', note: 'Issued in error' })).status).toBe(200);
    const [filter, update] = (vi.mocked(DocumentSeal.updateMany).mock.calls as any)[0];
    expect(filter).toMatchObject({
      tenantId: new Types.ObjectId(TENANT_A),
      documentType: 'medical_certificate',
      documentId: new Types.ObjectId(VISIT_ID),
      copyType: 'patient',
      issuedAt: { $gte: releasedAt },
    });
    expect(update.$set.revokedReason).toBe('Issued in error');
  });

  it('withdrawing a records copy leaves seals alone (its seal reads the request’s status)', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(requestRow({ status: 'released' })));
    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(requestRow({ status: 'revoked' })));
    expect((await patch({ action: 'revoke' })).status).toBe(200);
    expect(DocumentSeal.updateMany).not.toHaveBeenCalled();
  });
});

describe('clinical abstract writing and release', () => {
  const abstractRow = (over: Record<string, unknown> = {}) => requestRow({ kind: 'clinical_abstract', requestCode: 'CAR-000001', ...over });
  const url = `http://localhost/api/document-requests/${REQUEST_ID}`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: STAFF_ID, email: 'doc@clinic.ph', role: 'doctor', tenantId: TENANT_A },
      tenantId: TENANT_A,
      tenantObjectId: new Types.ObjectId(TENANT_A),
    } as any);
    vi.mocked(Patient.exists).mockResolvedValue({ _id: PATIENT_ID } as any);
  });

  it('starts from a draft built from the chart, merging diagnoses across visits', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(abstractRow()));
    vi.mocked(Visit.find).mockReturnValue(
      chain([
        { date: new Date('2026-05-08T02:00:00Z'), visitType: 'follow-up', chiefComplaint: 'Follow-up', diagnoses: [{ code: 'J18.9', description: 'Pneumonia' }], treatmentPlan: { followUp: { instructions: 'Return if fever recurs' } } },
        { date: new Date('2026-05-01T02:00:00Z'), visitType: 'consultation', chiefComplaint: 'Cough', diagnoses: [{ code: 'J18.9', description: 'Pneumonia' }, { code: 'I10', description: 'Hypertension' }] },
      ])
    );
    vi.mocked(LabResult.find).mockReturnValue(chain([{ orderDate: new Date('2026-05-01T02:00:00Z'), request: { testType: 'CBC' }, results: { wbc: 14.2 }, abnormalFlags: { wbc: 'high' } }]));
    vi.mocked(Prescription.find).mockReturnValue(chain([]));

    const res = await getAbstract(json(`${url}/abstract`, 'GET'), idParams());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.fromChart).toBe(true);
    expect(data.abstract.diagnosis).toBe('J18.9 Pneumonia\nI10 Hypertension');
    expect(data.abstract.chiefComplaint).toBe('Follow-up');
    expect(data.abstract.consultations).toBe('May 1, 2026 (consultation); May 8, 2026 (follow-up)');
    expect(data.abstract.diagnostics).toContain('wbc 14.2 (high)');
    expect(data.abstract.recommendations).toBe('Return if fever recurs');
    // The doctor writes the present condition; nothing in the chart says it.
    expect(data.missing).toEqual(['condition']);
    expect((vi.mocked(DocumentRequest.findOne).mock.calls as any)[0][0]).toMatchObject({ kind: 'clinical_abstract', tenantId: new Types.ObjectId(TENANT_A) });
  });

  it('saving needs visits write, works only while pending, and makes the saver the author', async () => {
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(abstractRow()));
    vi.mocked(DocumentRequest.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    const res = await putAbstract(json(`${url}/abstract`, 'PUT', { diagnosis: 'J18.9 Pneumonia', condition: 'Recovered', history: '' }), idParams());
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'visits', 'write');
    const [filter, update] = (vi.mocked(DocumentRequest.updateOne).mock.calls as any)[0];
    expect(filter).toMatchObject({ status: 'pending' });
    expect(update.$set.abstract).toEqual({ diagnosis: 'J18.9 Pneumonia', condition: 'Recovered' });
    expect(String(update.$set.abstractAuthor)).toBe(STAFF_ID);
    expect((await res.json()).data.missing).toEqual([]);

    vi.mocked(DocumentRequest.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    expect((await putAbstract(json(`${url}/abstract`, 'PUT', { diagnosis: 'x' }), idParams())).status).toBe(409);
    expect((await putAbstract(json(`${url}/abstract`, 'PUT', { signature: 'x' }), idParams())).status).toBe(400);
  });

  it('can’t be released until the required sections are saved', async () => {
    // Text that was never saved doesn't count: only what a doctor saved and signs.
    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(abstractRow({ abstract: { diagnosis: 'x', condition: 'y' } })));
    const unsaved = await PATCH(json(url, 'PATCH', { action: 'release' }), idParams());
    expect(unsaved.status).toBe(409);
    expect((await unsaved.json()).code).toBe('ABSTRACT_INCOMPLETE');

    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(abstractRow({ abstract: { diagnosis: 'x' }, abstractSavedAt: new Date() })));
    const partial = await PATCH(json(url, 'PATCH', { action: 'release' }), idParams());
    expect((await partial.json()).error).toContain('present condition');
    expect(DocumentRequest.findOneAndUpdate).not.toHaveBeenCalled();

    vi.mocked(DocumentRequest.findOne).mockReturnValue(chain(abstractRow({ abstract: { diagnosis: 'x', condition: 'y' }, abstractSavedAt: new Date() })));
    vi.mocked(DocumentRequest.findOneAndUpdate).mockReturnValue(chain(abstractRow({ status: 'released' })));
    expect((await PATCH(json(url, 'PATCH', { action: 'release' }), idParams())).status).toBe(200);
    expect((vi.mocked(DocumentRequest.findOneAndUpdate).mock.calls as any)[0][1].$set).not.toHaveProperty('cutoff');
  });
});
