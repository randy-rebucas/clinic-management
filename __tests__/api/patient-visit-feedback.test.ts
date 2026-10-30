import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
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
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => '9.9.9.9'),
  rateLimiters: { api: vi.fn() },
}));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Survey', () => ({ default: { exists: vi.fn(), create: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { createAuditLog } from '@/lib/audit';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Survey from '@/models/Survey';
import Tenant from '@/models/Tenant';
import { POST } from '@/app/api/patients/me/visits/[id]/feedback/route';
import { GET as pending } from '@/app/api/patients/me/feedback/pending/route';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439055';
const VISIT_2 = '507f1f77bcf86cd799439056';

const patientQuery = (patient: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(patient) }) });
const chain = (rows: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(rows) };
  q.select = vi.fn().mockReturnValue(q);
  q.populate = vi.fn().mockReturnValue(q);
  q.sort = vi.fn().mockReturnValue(q);
  q.limit = vi.fn().mockReturnValue(q);
  return q;
};
const recentVisit = {
  _id: new Types.ObjectId(VISIT_ID),
  tenantId: new Types.ObjectId(TENANT_A),
  patient: new Types.ObjectId(PATIENT_ID),
  date: new Date(Date.now() - 2 * 86_400_000),
};
const submit = (body: unknown, id = VISIT_ID) =>
  POST(
    new NextRequest(`http://localhost/api/patients/me/visits/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) }
  );

describe('patient visit feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient', email: 'p@x.y' } as any);
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A] }) as any);
    vi.mocked(Visit.findOne).mockReturnValue(chain(recentVisit));
    vi.mocked(Survey.exists).mockResolvedValue(null as any);
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await submit({ overallRating: 5 })).status).toBe(401);
    expect(Survey.create).not.toHaveBeenCalled();
  });

  it('only for their own visit, at their clinics, that the clinic asked about', async () => {
    vi.mocked(Visit.findOne).mockReturnValue(chain(null));
    expect((await submit({ overallRating: 5 })).status).toBe(404);
    expect(vi.mocked(Visit.findOne).mock.calls[0][0]).toEqual({
      _id: VISIT_ID,
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      feedbackRequested: true,
    });
    expect(Survey.create).not.toHaveBeenCalled();
  });

  it('404 once the 30-day window has passed', async () => {
    vi.mocked(Visit.findOne).mockReturnValue(chain({ ...recentVisit, date: new Date(Date.now() - 31 * 86_400_000) }));
    expect((await submit({ overallRating: 5 })).status).toBe(404);
  });

  it('400 without an overall rating', async () => {
    const res = await submit({ comments: 'hi' });
    expect(res.status).toBe(400);
    expect(Survey.create).not.toHaveBeenCalled();
  });

  it('saves the response for the visit and audits it', async () => {
    const res = await submit({ overallRating: 4, doctorRating: 5, comments: 'Kind doctor' });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ alreadySubmitted: false });
    expect(Survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: recentVisit._id,
        tenantId: recentVisit.tenantId,
        patientId: recentVisit.patient,
        overallRating: 4,
        doctorRating: 5,
        comments: 'Kind doctor',
        ipAddress: '9.9.9.9',
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PATIENT_ID,
        userRole: 'patient',
        tenantId: TENANT_A,
        action: 'create',
        resource: 'visit',
        resourceId: VISIT_ID,
        dataSubject: recentVisit.patient,
      })
    );
  });

  it('a second submission is a harmless no-op', async () => {
    vi.mocked(Survey.exists).mockResolvedValue({ _id: 's1' } as any);
    const res = await submit({ overallRating: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ alreadySubmitted: true });
    expect(Survey.create).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('a guardian answering for a family member is audited as themselves', async () => {
    const GUARDIAN = '507f1f77bcf86cd799439099';
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, guardianId: GUARDIAN, type: 'patient' } as any);
    expect((await submit({ overallRating: 5 })).status).toBe(201);
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({ userId: GUARDIAN, description: expect.stringContaining('family member') });
  });
});

describe('pending visit feedback', () => {
  const get = () => pending(new NextRequest('http://localhost/api/patients/me/feedback/pending'));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue(patientQuery({ _id: PATIENT_ID, tenantIds: [TENANT_A] }) as any);
    vi.mocked(Tenant.find).mockReturnValue(chain([{ _id: new Types.ObjectId(TENANT_A), name: 'sunrise', displayName: 'Sunrise Clinic' }]));
  });

  it('401 without a token', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('lists recent asked-about visits with no response yet, with only what the prompt needs', async () => {
    vi.mocked(Visit.find).mockReturnValue(
      chain([
        { ...recentVisit, visitType: 'consultation', provider: { name: 'Maria Santos' }, feedbackToken: 'secret' },
        { ...recentVisit, _id: new Types.ObjectId(VISIT_2) },
      ])
    );
    vi.mocked(Survey.find).mockReturnValue(chain([{ visitId: new Types.ObjectId(VISIT_2) }]));

    const res = await get();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual([
      {
        visitId: VISIT_ID,
        visitDate: recentVisit.date.toISOString(),
        visitType: 'consultation',
        providerName: 'Dr. Maria Santos',
        clinicName: 'Sunrise Clinic',
        tenantId: TENANT_A,
      },
    ]);
    const filter = (vi.mocked(Visit.find).mock.calls[0] as unknown[])[0] as any;
    expect(filter).toMatchObject({
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      feedbackRequested: true,
    });
    expect(filter.date.$gte).toBeInstanceOf(Date);
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('empty when nothing is pending', async () => {
    vi.mocked(Visit.find).mockReturnValue(chain([]));
    expect((await (await get()).json()).data).toEqual([]);
    expect(Survey.find).not.toHaveBeenCalled();
  });
});
