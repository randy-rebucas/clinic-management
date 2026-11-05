import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn(async () => null) }));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logRecordOpened: vi.fn() }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/Queue', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/models/Prescription', () => ({ default: {} }));
vi.mock('@/models/LabResult', () => ({ default: {} }));
vi.mock('@/models/Imaging', () => ({ default: {} }));
vi.mock('@/models/Procedure', () => ({ default: {} }));
vi.mock('@/lib/queue-consult', () => ({ findConsultBlocker: vi.fn(async () => null) }));
vi.mock('@/lib/automations/queue-auto-call', () => ({ callNextPatient: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }));

import { after } from 'next/server';
import { Types } from 'mongoose';
import { requireTenantSession } from '@/lib/api/tenant-session';
import Visit from '@/models/Visit';
import Queue from '@/models/Queue';
import { callNextPatient } from '@/lib/automations/queue-auto-call';
import { PUT } from '@/app/api/visits/[id]/route';

const TENANT = '507f1f77bcf86cd7994390cc';
const VISIT = '507f1f77bcf86cd7994390dd';
const doctor = new Types.ObjectId();

function visitNow(oldStatus: string) {
  vi.mocked(Visit.findOne).mockReturnValue({ select: () => ({ lean: async () => ({ status: oldStatus }) }) } as never);
  vi.mocked(Visit.findOneAndUpdate).mockResolvedValue({ _id: VISIT, patient: new Types.ObjectId(), status: 'closed', populate: vi.fn() } as never);
}

const put = (status: string) =>
  PUT(new NextRequest(`http://x/api/visits/${VISIT}`, { method: 'PUT', body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: VISIT }) });

describe('PUT /api/visits/[id] calling the next patient', () => {
  beforeEach(() => {
    vi.mocked(requireTenantSession).mockResolvedValue({
      session: { userId: 'u', role: 'admin', tenantId: TENANT } as any,
      tenantId: TENANT,
      tenantObjectId: new Types.ObjectId(TENANT),
    });
    vi.mocked(callNextPatient).mockReset().mockResolvedValue(null);
    vi.mocked(Queue.findOneAndUpdate).mockReset();
    vi.mocked(after).mockClear();
    visitNow('open');
  });

  // Closing always schedules billing; anything more is the line being updated.
  describe('updating the line', () => {
    it('updates it when a closed visit moved someone and nobody was called', async () => {
      vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status: 'in-progress', doctor } as never);

      await put('closed');

      expect(after).toHaveBeenCalledTimes(2);
    });

    it('leaves it to the call-in when someone was called', async () => {
      vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status: 'in-progress', doctor } as never);
      vi.mocked(callNextPatient).mockResolvedValue({ name: 'Ana Cruz', number: 'W-004' });

      await put('closed');

      expect(after).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no queue entry changed', async () => {
      vi.mocked(Queue.findOneAndUpdate).mockResolvedValue(null as never);

      await put('closed');

      expect(after).toHaveBeenCalledTimes(1);
    });

    it('updates it when a cancelled visit takes someone out of the line', async () => {
      vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status: 'waiting', doctor } as never);

      await put('cancelled');

      expect(after).toHaveBeenCalledTimes(1);
    });
  });

  it('calls the next patient for this doctor when the visit ends a consult', async () => {
    vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status: 'in-progress', doctor } as never);
    vi.mocked(callNextPatient).mockResolvedValue({ name: 'Ana Cruz', number: 'W-004' });

    const res = await put('closed');

    expect(vi.mocked(callNextPatient).mock.calls[0][1]).toBe(doctor);
    expect((await res.json()).nextCalled).toEqual({ name: 'Ana Cruz', number: 'W-004' });
  });

  it('calls nobody when the patient had already left the queue, as with Mark seen first', async () => {
    vi.mocked(Queue.findOneAndUpdate).mockResolvedValue(null as never);

    await put('closed');

    expect(callNextPatient).not.toHaveBeenCalled();
  });

  it.each(['away', 'waiting'])('calls nobody when closing the note of a %s patient', async (status) => {
    vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status, doctor } as never);

    await put('closed');

    expect(callNextPatient).not.toHaveBeenCalled();
  });

  it('calls nobody when a visit is cancelled', async () => {
    vi.mocked(Queue.findOneAndUpdate).mockResolvedValue({ status: 'in-progress', doctor } as never);

    await put('cancelled');

    expect(callNextPatient).not.toHaveBeenCalled();
  });
});
