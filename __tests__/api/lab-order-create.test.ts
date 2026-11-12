import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: async (fn: () => unknown) => { await fn(); },
}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn().mockResolvedValue({ tenantId: null }) }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { insertMany: vi.fn(), find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('@/lib/counters', () => ({
  nextSequence: vi.fn().mockResolvedValue(42),
  formatCode: (p: string, n: number) => `${p}-${String(n).padStart(6, '0')}`,
}));
vi.mock('@/lib/automations/lab-notifications', () => ({ notifyLabStaffOfRequest: vi.fn() }));

import { Types } from 'mongoose';
import { verifySession } from '@/app/lib/dal';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import { notifyLabStaffOfRequest } from '@/lib/automations/lab-notifications';
import { POST } from '@/app/api/lab-results/route';
import { orderRequestCodes } from '@/lib/lab-result-schema';

const TENANT = '507f1f77bcf86cd799439011';
const PATIENT = '507f1f77bcf86cd799439022';
const VISIT = '507f1f77bcf86cd799439044';

/** insertMany echoes the docs with ids; the follow-up find returns them populated. */
function stubWrites() {
  let inserted: any[] = [];
  vi.mocked(LabResult.insertMany).mockImplementation((async (docs: any[]) => {
    inserted = docs.map((d) => ({ ...d, _id: new Types.ObjectId(), status: d.status ?? 'ordered' }));
    return inserted;
  }) as any);
  const chain: any = { populate: () => chain, select: () => chain, lean: () => Promise.resolve([...inserted].reverse()) };
  vi.mocked(LabResult.find).mockReturnValue(chain);
  return () => inserted;
}

const post = async (body: unknown) => {
  const res = await POST(new NextRequest('http://localhost/api/lab-results', { method: 'POST', body: JSON.stringify(body) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { status: res.status, json: await res.json() };
};

describe('POST /api/lab-results: lab orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue({ userId: '507f1f77bcf86cd799439099', email: 'a@b.c', role: 'doctor', tenantId: TENANT } as any);
    vi.mocked(Patient.exists).mockResolvedValue({ _id: PATIENT } as any);
    vi.mocked(Visit.exists).mockResolvedValue({ _id: VISIT } as any);
  });

  it('saves the tests of one order together under one order code', async () => {
    const inserted = stubWrites();
    const { status, json } = await post({
      patient: PATIENT,
      visit: VISIT,
      status: 'ordered',
      request: { urgency: 'stat', fastingRequired: true },
      tests: [{ testType: 'CBC' }, { testType: 'Urinalysis' }, { testType: 'FBS', testCode: '1558-6' }],
    });

    expect(status).toBe(201);
    expect(json.orderCode).toBe('LAB-000042');
    expect(LabResult.insertMany).toHaveBeenCalledTimes(1);
    const docs = inserted();
    expect(docs.map((d) => d.requestCode)).toEqual(['LAB-000042-1', 'LAB-000042-2', 'LAB-000042-3']);
    expect(docs.every((d) => d.orderCode === 'LAB-000042')).toBe(true);
    expect(docs[2].request).toMatchObject({ testType: 'FBS', testCode: '1558-6', urgency: 'stat', fastingRequired: true });
    // Returned in the order the tests were entered.
    expect(json.data.map((d: any) => d.request.testType)).toEqual(['CBC', 'Urinalysis', 'FBS']);
    // Linked to the visit, and one alert to the lab for the whole order.
    expect(Visit.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: VISIT }),
      { $addToSet: { labsOrdered: { $each: docs.map((d) => d._id) } } }
    );
    expect(notifyLabStaffOfRequest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyLabStaffOfRequest).mock.calls[0][0]).toMatchObject({ orderCode: 'LAB-000042', urgency: 'stat' });
    expect(vi.mocked(notifyLabStaffOfRequest).mock.calls[0][0].tests).toHaveLength(3);
  });

  it('gives a single test its order code as its request code', async () => {
    const inserted = stubWrites();
    const { status, json } = await post({ patient: PATIENT, request: { testType: 'CBC' } });
    expect(status).toBe(201);
    expect(inserted()[0]).toMatchObject({ requestCode: 'LAB-000042', orderCode: 'LAB-000042' });
    expect(json.data.requestCode).toBe('LAB-000042');
  });

  it('refuses the same test twice on one order', async () => {
    stubWrites();
    const { status } = await post({ patient: PATIENT, tests: [{ testType: 'CBC' }, { testType: 'cbc' }] });
    expect(status).toBe(400);
    expect(LabResult.insertMany).not.toHaveBeenCalled();
  });

  it('places nothing for a patient of another clinic', async () => {
    stubWrites();
    vi.mocked(Patient.exists).mockResolvedValue(null);
    const { status } = await post({ patient: PATIENT, tests: [{ testType: 'CBC' }, { testType: 'FBS' }] });
    expect(status).toBe(400);
    expect(LabResult.insertMany).not.toHaveBeenCalled();
  });

  it('removes the tests already written when the order fails part-way', async () => {
    vi.mocked(LabResult.insertMany).mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
    vi.mocked(LabResult.deleteMany).mockResolvedValue({} as any);
    const { status } = await post({ patient: PATIENT, tests: [{ testType: 'CBC' }, { testType: 'FBS' }] });
    expect(status).toBe(500);
    expect(LabResult.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ orderCode: 'LAB-000042' }));
  });
});

describe('orderRequestCodes', () => {
  it('uses the order code alone for one test and suffixes several', () => {
    expect(orderRequestCodes('LAB-000007', 1)).toEqual(['LAB-000007']);
    expect(orderRequestCodes('LAB-000007', 2)).toEqual(['LAB-000007-1', 'LAB-000007-2']);
  });
});
