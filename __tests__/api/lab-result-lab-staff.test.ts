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
vi.mock('@/lib/audit', () => ({ logRecordOpened: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/lib/automations/lab-notifications', () => ({
  sendLabResultNotification: vi.fn().mockResolvedValue({ success: true, sent: true }),
  notifyDoctorToReview: vi.fn(),
}));

import { verifySession } from '@/app/lib/dal';
import LabResult from '@/models/LabResult';
import { sendLabResultNotification, notifyDoctorToReview } from '@/lib/automations/lab-notifications';
import { PUT } from '@/app/api/lab-results/[id]/route';

const TENANT = '507f1f77bcf86cd799439011';
const LAB_ID = '507f1f77bcf86cd799439033';

const as = (role: string) =>
  vi.mocked(verifySession).mockResolvedValue({ userId: '507f1f77bcf86cd799439099', email: 'a@b.c', role, tenantId: TENANT } as any);
const existing = (status: string) =>
  vi.mocked(LabResult.findOne).mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ status }) }) } as any);
const call = async (body: unknown) => {
  const res = await PUT(new NextRequest(`http://localhost/api/lab-results/${LAB_ID}`, { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: LAB_ID }),
  });
  // Let the work handed to after() finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return res;
};

function saved(fields: Record<string, unknown> = {}) {
  const doc: any = { _id: LAB_ID, orderedBy: '507f1f77bcf86cd799439055', request: { testType: 'CBC' }, ...fields };
  doc.populate = vi.fn().mockResolvedValue(doc);
  vi.mocked(LabResult.findOneAndUpdate).mockReturnValue({ select: () => Promise.resolve(doc) } as any);
  return doc;
}

describe('PUT /api/lab-results/[id]: lab staff and review', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses lab staff cancelling a request', async () => {
    as('medical-technologist');
    existing('ordered');
    expect((await call({ status: 'cancelled' })).status).toBe(403);
    expect(LabResult.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses lab staff reopening a completed result', async () => {
    as('medical-technologist');
    existing('completed');
    expect((await call({ status: 'ordered' })).status).toBe(403);
  });

  it('refuses lab staff changing a reviewed result', async () => {
    as('medical-technologist');
    existing('reviewed');
    expect((await call({ results: { k: '5.9' } })).status).toBe(403);
  });

  it('holds a lab-completed result for review and asks the doctor', async () => {
    as('medical-technologist');
    existing('in-progress');
    saved({ status: 'completed', awaitingReview: true });
    expect((await call({ status: 'completed', results: { k: '3.2' } })).status).toBe(200);
    const update = vi.mocked(LabResult.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$set.awaitingReview).toBe(true);
    expect(notifyDoctorToReview).toHaveBeenCalled();
    expect(sendLabResultNotification).not.toHaveBeenCalled();
  });

  it('tells the patient when the doctor reviews it', async () => {
    as('doctor');
    existing('completed');
    saved({ status: 'reviewed' });
    expect((await call({ status: 'reviewed' })).status).toBe(200);
    const update = vi.mocked(LabResult.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$unset).toEqual({ awaitingReview: '' });
    expect(sendLabResultNotification).toHaveBeenCalled();
  });

  it('undoes the review when a reviewed result is changed', async () => {
    as('doctor');
    existing('reviewed');
    saved({ status: 'completed' });
    expect((await call({ results: { k: '5.9' } })).status).toBe(200);
    const update = vi.mocked(LabResult.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$set.status).toBe('completed');
    expect(update.$unset).toEqual({ reviewedBy: '', reviewedAt: '' });
  });

  it('still tells the patient straight away when a clinician completes it', async () => {
    as('doctor');
    existing('in-progress');
    saved({ status: 'completed' });
    await call({ status: 'completed', results: { k: '3.2' } });
    expect(sendLabResultNotification).toHaveBeenCalled();
    expect(notifyDoctorToReview).not.toHaveBeenCalled();
  });
});
