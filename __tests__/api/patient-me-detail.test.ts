import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn(), createAuditLog: vi.fn() }));
vi.mock('@/app/lib/patient-auth', () => ({ verifyPatientAuth: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Document', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/lib/document-file', () => ({ loadDocumentFile: vi.fn() }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { recordPatientRefused, createAuditLog } from '@/lib/audit';
import Patient from '@/models/Patient';
import LabResult from '@/models/LabResult';
import Document from '@/models/Document';
import { loadDocumentFile } from '@/lib/document-file';
import { GET as getLabResult } from '@/app/api/patients/me/lab-results/[id]/route';
import { GET as getDocument } from '@/app/api/patients/me/documents/[id]/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const RECORD_ID = '507f1f77bcf86cd799439044';
/** Ownership filter for an unlinked patient: their one record. */
const OWN_RECORD = { $in: [new Types.ObjectId(PATIENT_ID)] };

const patientQuery = (patient: unknown) => ({
  select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(patient) }),
});
/** LabResult.findOne(...).select(...).lean() */
const labQuery = (row: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(row) };
  q.select = vi.fn().mockReturnValue(q);
  return q;
};
const call = (handler: typeof getLabResult, id: string, url = `http://localhost/api/x/${id}`) =>
  handler(new NextRequest(url), { params: Promise.resolve({ id }) });

describe('patient /me detail routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue(
      patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A] }) as any
    );
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await call(getLabResult, RECORD_ID)).status).toBe(401);
  });

  it('403 for an inactive patient, and the refusal is audited', async () => {
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, active: false }) as any);
    expect((await call(getLabResult, RECORD_ID)).status).toBe(403);
    expect(recordPatientRefused).toHaveBeenCalled();
    expect(LabResult.findOne).not.toHaveBeenCalled();
  });

  it('404 for a malformed id without querying', async () => {
    expect((await call(getLabResult, 'nope')).status).toBe(404);
    expect(LabResult.findOne).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the patient's own record at their clinics", async () => {
    const q = labQuery({ _id: RECORD_ID });
    vi.mocked(LabResult.findOne).mockReturnValue(q);
    const res = await call(getLabResult, RECORD_ID);
    // Integration internals and inline file contents are never sent to the patient.
    expect(q.select).toHaveBeenCalledWith('-thirdPartyLab -attachments.url');
    expect(res.status).toBe(200);
    expect(vi.mocked(LabResult.findOne).mock.calls[0][0]).toEqual({
      _id: RECORD_ID,
      patient: OWN_RECORD,
      tenantId: { $in: [TENANT_A] },
    });
  });

  it("narrows to the session's clinic when the token carries one", async () => {
    const TENANT_B = '507f1f77bcf86cd799439022';
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', tid: TENANT_B } as any);
    vi.mocked(Patient.findById).mockReturnValue(
      patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A, TENANT_B] }) as any
    );
    vi.mocked(LabResult.findOne).mockReturnValue(labQuery({ _id: RECORD_ID }));
    expect((await call(getLabResult, RECORD_ID)).status).toBe(200);
    expect(vi.mocked(LabResult.findOne).mock.calls[0][0]).toEqual({
      _id: RECORD_ID,
      patient: OWN_RECORD,
      tenantId: { $in: [TENANT_B] },
    });
  });

  it("reads across the person's linked records at their other clinics", async () => {
    const TENANT_B = '507f1f77bcf86cd799439022';
    const LINKED_ID = new Types.ObjectId('507f1f77bcf86cd799439055');
    const ACCOUNT_ID = new Types.ObjectId(PATIENT_ID);
    vi.mocked(Patient.findById).mockReturnValue(
      patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A], accountId: ACCOUNT_ID }) as any
    );
    const linkedQuery: any = { lean: vi.fn().mockResolvedValue([{ _id: LINKED_ID, tenantIds: [TENANT_B] }]) };
    linkedQuery.select = vi.fn().mockReturnValue(linkedQuery);
    linkedQuery.limit = vi.fn().mockReturnValue(linkedQuery);
    vi.mocked(Patient.find).mockReturnValue(linkedQuery);
    vi.mocked(LabResult.findOne).mockReturnValue(labQuery({ _id: RECORD_ID }));

    expect((await call(getLabResult, RECORD_ID)).status).toBe(200);
    // Only active records of the same account are linked.
    expect((vi.mocked(Patient.find).mock.calls as any)[0][0]).toMatchObject({ accountId: ACCOUNT_ID, active: { $ne: false } });
    expect(vi.mocked(LabResult.findOne).mock.calls[0][0]).toEqual({
      _id: RECORD_ID,
      patient: { $in: [new Types.ObjectId(PATIENT_ID), LINKED_ID] },
      tenantId: { $in: [TENANT_A, TENANT_B] },
    });
  });

  it("404 when the record isn't the patient's", async () => {
    vi.mocked(LabResult.findOne).mockReturnValue(labQuery(null));
    expect((await call(getLabResult, RECORD_ID)).status).toBe(404);
  });

  it('serves only active, non-confidential documents, and audits the download', async () => {
    vi.mocked(Document.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: RECORD_ID, patient: PATIENT_ID, filename: 'cbc.pdf', tenantId: TENANT_A }),
    } as any);
    vi.mocked(loadDocumentFile).mockResolvedValue({ buffer: Buffer.from('%PDF'), contentType: 'application/pdf' });

    const res = await call(getDocument, RECORD_ID, `http://localhost/api/patients/me/documents/${RECORD_ID}?download=true`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(vi.mocked(Document.findOne).mock.calls[0][0]).toMatchObject({
      patient: OWN_RECORD,
      status: 'active',
      isConfidential: { $ne: true },
    });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'download', userRole: 'patient' }));
  });
});
