import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn(async () => null) }));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/models/Queue', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Room', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/Appointment', () => ({ default: {} }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/lib/queue-consult', () => ({ findConsultBlocker: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }));

import { Types } from 'mongoose';
import { requireTenantSession } from '@/lib/api/tenant-session';
import Queue from '@/models/Queue';
import Doctor from '@/models/Doctor';
import Visit from '@/models/Visit';
import { findConsultBlocker } from '@/lib/queue-consult';
import { PUT } from '@/app/api/queue/[id]/route';

const TENANT = '507f1f77bcf86cd7994390cc';
const ENTRY = '507f1f77bcf86cd7994390dd';
const DR_A = new Types.ObjectId('507f1f77bcf86cd7994390ee');
const DR_B = '507f1f77bcf86cd7994390ff';

function entry(fields: Record<string, unknown>) {
  const doc: any = { _id: new Types.ObjectId(ENTRY), doctor: DR_A, save: vi.fn().mockResolvedValue(undefined), ...fields };
  const reply: any = { populate: vi.fn(() => reply), lean: vi.fn().mockResolvedValue({ _id: ENTRY }) };
  vi.mocked(Queue.findOne).mockReset();
  vi.mocked(Queue.findOne).mockResolvedValueOnce(doc as any).mockReturnValue(reply);
  return doc;
}

function openVisit(visit: { _id: Types.ObjectId } | null) {
  const chain: any = { sort: vi.fn(() => chain), select: vi.fn(() => chain), lean: vi.fn().mockResolvedValue(visit) };
  vi.mocked(Visit.findOne).mockReturnValue(chain);
}

const put = (body: unknown) =>
  PUT(new NextRequest(`http://x/api/queue/${ENTRY}`, { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id: ENTRY }) });

describe('PUT /api/queue/[id] call-in', () => {
  beforeEach(() => {
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: 'u', role: 'admin', tenantId: TENANT } as any,
      tenantId: TENANT,
      tenantObjectId: new Types.ObjectId(TENANT),
    });
    vi.mocked(findConsultBlocker).mockReset().mockResolvedValue(null);
    vi.mocked(Doctor.exists).mockResolvedValue({ _id: DR_B } as any);
    vi.mocked(Visit.findOne).mockReset();
    openVisit(null);
  });

  it('refuses the call-in and saves nothing while the doctor is in consult', async () => {
    const doc = entry({ status: 'waiting' });
    vi.mocked(findConsultBlocker).mockResolvedValue('Ana Cruz (W-003) is still in consult with this doctor.');

    const res = await put({ status: 'in-progress' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Ana Cruz');
    expect(doc.save).not.toHaveBeenCalled();
    expect(doc.status).toBe('waiting');
  });

  it('calls the patient in when the doctor is free', async () => {
    const doc = entry({ status: 'waiting' });

    const res = await put({ status: 'in-progress' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('in-progress');
    expect(doc.save).toHaveBeenCalled();
  });

  it('checks the new doctor when moving a patient already in consult', async () => {
    entry({ status: 'in-progress' });
    vi.mocked(findConsultBlocker).mockResolvedValue('busy');

    const res = await put({ doctor: DR_B });

    expect(res.status).toBe(409);
    expect(vi.mocked(findConsultBlocker).mock.calls[0][1].doctor).toBe(DR_B);
  });

  it('leaves edits to a patient already in consult alone', async () => {
    entry({ status: 'in-progress' });

    const res = await put({ status: 'in-progress', notes: 'x' });

    expect(res.status).toBe(200);
    expect(findConsultBlocker).not.toHaveBeenCalled();
  });

  it('does not check when a consult ends', async () => {
    entry({ status: 'in-progress' });

    await put({ status: 'completed' });

    expect(findConsultBlocker).not.toHaveBeenCalled();
  });

  it('puts a patient in consult back on the waiting list and clears the consult clocks', async () => {
    const doc = entry({ status: 'in-progress', startedAt: new Date(), calledAt: new Date() });

    const res = await put({ status: 'waiting' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('waiting');
    expect(doc.startedAt).toBeUndefined();
    expect(doc.calledAt).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled', 'no-show'])('does not reopen a %s entry', async (status) => {
    const doc = entry({ status });

    const res = await put({ status: 'waiting' });

    expect(res.status).toBe(409);
    expect(doc.status).toBe(status);
    expect(doc.save).not.toHaveBeenCalled();
  });

  describe('the lab round trip', () => {
    it('sends a patient in consult to the lab, keeping their place and their open visit', async () => {
      const visit = { _id: new Types.ObjectId() };
      openVisit(visit);
      const queuedAt = new Date('2026-11-05T01:00:00Z');
      const doc = entry({ status: 'in-progress', startedAt: new Date(), calledAt: new Date(), queuedAt, priority: 1 });

      const res = await put({ status: 'away' });

      expect(res.status).toBe(200);
      expect(doc.status).toBe('away');
      expect(doc.startedAt).toBeUndefined();
      expect(doc.calledAt).toBeUndefined();
      expect(doc.visit).toBe(visit._id);
      expect(doc.queuedAt).toBe(queuedAt);
      expect(doc.priority).toBe(1);
    });

    it.each(['waiting', 'away', 'completed', 'cancelled', 'no-show'])('refuses to send a %s entry to the lab', async (status) => {
      const doc = entry({ status });

      const res = await put({ status: 'away' });

      expect(res.status).toBe(409);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('returns them to the line, and picks up a visit saved while they were out', async () => {
      const visit = { _id: new Types.ObjectId() };
      openVisit(visit);
      const doc = entry({ status: 'away' });

      const res = await put({ status: 'waiting' });

      expect(res.status).toBe(200);
      expect(doc.status).toBe('waiting');
      expect(doc.visit).toBe(visit._id);
    });

    it('cannot be called straight in from the lab', async () => {
      const doc = entry({ status: 'away' });

      const res = await put({ status: 'in-progress' });

      expect(res.status).toBe(409);
      expect(doc.save).not.toHaveBeenCalled();
      expect(findConsultBlocker).not.toHaveBeenCalled();
    });

    it('only looks for visits from this stay in the queue', async () => {
      const queuedAt = new Date('2026-11-05T01:00:00Z');
      entry({ status: 'in-progress', queuedAt });

      await put({ status: 'away' });

      expect(vi.mocked(Visit.findOne).mock.calls[0][0]).toMatchObject({ status: 'open', date: { $gte: queuedAt } });
    });
  });

  it('reports a lost race on the unique index as a conflict', async () => {
    const doc = entry({ status: 'waiting' });
    doc.save.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    const res = await put({ status: 'in-progress' });

    expect(res.status).toBe(409);
  });
});
