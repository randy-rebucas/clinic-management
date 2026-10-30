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
vi.mock('@/lib/emcr/activation', () => ({ requireActiveEmcr: vi.fn(async () => null) }));
vi.mock('@/app/lib/dal', () => ({ deriveKey: (purpose: string) => Buffer.from(`test-key-${purpose}`) }));
vi.mock('@/lib/document-protection', () => ({ escapeHtml: (v: unknown) => String(v ?? ''), sealedDocumentParts: vi.fn() }));
vi.mock('@/models/Specialization', () => ({ default: {} }));
vi.mock('@/models/Appointment', () => ({ default: {} }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Referral', () => ({ default: { find: vi.fn(), findOne: vi.fn(), countDocuments: vi.fn() } }));

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import Referral from '@/models/Referral';
import { GET as list } from '@/app/api/patients/me/referrals/route';
import { GET as detail } from '@/app/api/patients/me/referrals/[id]/route';
import { POST as pdfLink } from '@/app/api/patients/me/referrals/[id]/pdf-link/route';
import { createReferralLetterLinkToken, readReferralLetterLinkToken } from '@/lib/referral-letter-link';
import { createPrescriptionLinkToken } from '@/lib/prescription-link';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const TENANT_A = '507f1f77bcf86cd799439011';
const REFERRAL_ID = '507f1f77bcf86cd799439044';
const APPOINTMENT_ID = '507f1f77bcf86cd799439055';

const chain = (result: unknown) => {
  const q: any = { lean: vi.fn().mockResolvedValue(result) };
  for (const m of ['select', 'populate', 'sort', 'limit', 'skip']) q[m] = vi.fn().mockReturnValue(q);
  return q;
};

const referralRow = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(REFERRAL_ID),
  tenantId: new Types.ObjectId(TENANT_A),
  referralCode: 'REF-0007',
  type: 'external',
  status: 'accepted',
  urgency: 'urgent',
  reason: 'Persistent chest pain',
  specialty: 'Cardiology',
  referringDoctor: { _id: new Types.ObjectId(), firstName: 'Ana', lastName: 'Reyes', specializationId: { name: 'Family Medicine' } },
  receivingClinic: 'Heart Center',
  referredDate: new Date('2026-10-01T02:00:00Z'),
  acceptedDate: new Date('2026-10-02T02:00:00Z'),
  appointment: { _id: new Types.ObjectId(APPOINTMENT_ID), appointmentCode: 'APT-1', status: 'scheduled', appointmentTime: '09:00' },
  patient: new Types.ObjectId(PATIENT_ID),
  ...over,
});

const call = (handler: typeof detail, id = REFERRAL_ID) =>
  handler(new NextRequest(`http://localhost/api/patients/me/referrals/${id}`, { method: handler === detail ? 'GET' : 'POST' }), {
    params: Promise.resolve({ id }),
  });

describe('patient referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue(chain({ _id: PATIENT_ID, email: 'p@x.y', tenantIds: [TENANT_A] }));
    vi.mocked(Tenant.find).mockReturnValue(chain([{ _id: TENANT_A, name: 'Sunrise Clinic' }]));
  });

  it('lists own referrals at their clinics with a field whitelist (no staff notes), never friend referrals', async () => {
    const q = chain([referralRow({ notes: 'internal', followUpNotes: 'x', feedback: { comments: 'y' }, declinedReason: 'z' })]);
    vi.mocked(Referral.find).mockReturnValue(q);
    vi.mocked(Referral.countDocuments).mockResolvedValue(1 as any);

    const res = await list(new NextRequest('http://localhost/api/patients/me/referrals'));
    expect(res.status).toBe(200);
    expect((vi.mocked(Referral.find).mock.calls as any)[0][0]).toEqual({
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      type: { $ne: 'patient_to_patient' },
    });
    const projection = q.select.mock.calls[0][0] as string;
    for (const hidden of ['notes', 'followUpNotes', 'feedback', 'attachments', 'declinedReason', 'diagnosis', 'relevantHistory']) {
      expect(projection.split(/\s+/)).not.toContain(hidden);
    }
    // The linked appointment only resolves when it is this person's.
    const apptPopulate = q.populate.mock.calls.map((c: any[]) => c[0]).find((p: any) => p.path === 'appointment');
    expect(apptPopulate.match).toEqual({ patient: { $in: [new Types.ObjectId(PATIENT_ID)] } });

    const body = await res.json();
    expect(body.pagination).toMatchObject({ total: 1, page: 1, limit: 20 });
    const item = body.data[0];
    expect(item).toMatchObject({
      _id: REFERRAL_ID,
      referralCode: 'REF-0007',
      direction: 'out',
      status: 'accepted',
      specialty: 'Cardiology',
      reason: 'Persistent chest pain',
      clinic: { tenantId: TENANT_A, name: 'Sunrise Clinic' },
      referredTo: { doctor: null, clinic: 'Heart Center' },
      referredBy: { doctor: { firstName: 'Ana', specialization: 'Family Medicine' }, clinic: 'Sunrise Clinic' },
      appointment: { _id: APPOINTMENT_ID, status: 'scheduled' },
      letterAvailable: true,
    });
    for (const hidden of ['notes', 'followUpNotes', 'feedback', 'declinedReason']) expect(item).not.toHaveProperty(hidden);
  });

  it('detail is gated by eMCR records and scoped like the other /me detail routes', async () => {
    vi.mocked(Referral.findOne).mockReturnValue(chain(referralRow()));
    expect((await call(detail)).status).toBe(200);
    expect(requireActiveEmcr).toHaveBeenCalledWith(expect.anything(), 'records');
    expect(vi.mocked(Referral.findOne).mock.calls[0][0]).toEqual({
      _id: REFERRAL_ID,
      patient: { $in: [new Types.ObjectId(PATIENT_ID)] },
      tenantId: { $in: [TENANT_A] },
      type: { $ne: 'patient_to_patient' },
    });
  });

  it("404 for someone else's referral", async () => {
    vi.mocked(Referral.findOne).mockReturnValue(chain(null));
    expect((await call(detail)).status).toBe(404);
    expect((await call(pdfLink)).status).toBe(404);
  });

  it('pdf-link mints a 10-minute signed link to the letter', async () => {
    vi.mocked(Referral.findOne).mockReturnValue(chain(referralRow()));
    const res = await call(pdfLink);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const token = String(data.url).split('/api/referral-letter/')[1];
    expect(readReferralLetterLinkToken(token)).toBe(REFERRAL_ID);
    expect(new Date(data.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('409 NO_LETTER for a received, cancelled or declined referral', async () => {
    for (const row of [
      referralRow({ referringDoctor: null, receivingClinic: undefined, referringClinic: 'Other Clinic' }),
      referralRow({ status: 'cancelled' }),
      referralRow({ status: 'declined' }),
    ]) {
      vi.mocked(Referral.findOne).mockReturnValue(chain(row));
      const res = await call(pdfLink);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('NO_LETTER');
    }
  });

  it('letter tokens expire, resist tampering and are not interchangeable with prescription links', () => {
    const now = Date.now();
    const { token } = createReferralLetterLinkToken(REFERRAL_ID, now);
    expect(readReferralLetterLinkToken(token, now + 9 * 60 * 1000)).toBe(REFERRAL_ID);
    expect(readReferralLetterLinkToken(token, now + 11 * 60 * 1000)).toBeNull();
    expect(readReferralLetterLinkToken(`${token}x`, now)).toBeNull();
    expect(readReferralLetterLinkToken(createPrescriptionLinkToken(REFERRAL_ID, now).token, now)).toBeNull();
  });
});
