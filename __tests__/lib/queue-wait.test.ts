import { beforeEach, describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/models/Queue', () => ({ default: { find: vi.fn(), aggregate: vi.fn(), bulkWrite: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({ appointmentSettings: { defaultDuration: 20 } })) }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));

import Queue from '@/models/Queue';
import { estimateWaits, refreshQueueWaits } from '@/lib/queue-wait';

const doctor = (id: string) => ({ _id: id });
const waiting = (d?: { _id: string }) => ({ status: 'waiting', doctor: d });
const seeing = (d?: { _id: string }) => ({ status: 'in-progress', doctor: d });

describe('refreshQueueWaits', () => {
  const tenantId = new Types.ObjectId();
  const dr = new Types.ObjectId();
  const row = (status: string, estimatedWaitTime?: number) => ({ _id: new Types.ObjectId(), status, doctor: dr, estimatedWaitTime });

  function line(entries: unknown[]) {
    const chain: any = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => entries };
    vi.mocked(Queue.find).mockReturnValue(chain);
  }
  const writes = () => vi.mocked(Queue.bulkWrite).mock.calls[0][0] as unknown as { updateOne: { filter: Record<string, unknown>; update: Record<string, any> } }[];

  beforeEach(() => {
    vi.mocked(Queue.aggregate).mockReset().mockResolvedValue([]);
    vi.mocked(Queue.bulkWrite).mockReset();
  });

  it('saves the estimates the staff page shows, for those still waiting', async () => {
    const first = row('waiting');
    const second = row('waiting');
    line([row('in-progress'), first, second]);

    await refreshQueueWaits(tenantId);

    expect(writes().map((w) => [w.updateOne.filter._id, w.updateOne.update.$set.estimatedWaitTime])).toEqual([[first._id, 10], [second._id, 30]]);
    expect(writes()[0].updateOne.filter).toMatchObject({ tenantId, status: 'waiting' });
  });

  it('follows the doctor\'s pace once a visit completes', async () => {
    vi.mocked(Queue.aggregate).mockResolvedValue([{ _id: dr, avg: 40, n: 2 }]);
    line([row('waiting', 0), row('waiting', 20)]);

    await refreshQueueWaits(tenantId);

    expect(writes()).toHaveLength(1);
    expect(writes()[0].updateOne.update.$set.estimatedWaitTime).toBe(40);
  });

  it('writes nothing when no estimate moved', async () => {
    line([row('waiting', 0), row('waiting', 20)]);

    await refreshQueueWaits(tenantId);

    expect(Queue.bulkWrite).not.toHaveBeenCalled();
  });

  it('clears the estimate of a patient out of the line, and only if they have one', async () => {
    const held = row('away', 25);
    line([held, row('away')]);

    await refreshQueueWaits(tenantId);

    expect(writes()).toHaveLength(1);
    expect(writes()[0].updateOne).toMatchObject({ filter: { _id: held._id, status: 'away' }, update: { $unset: { estimatedWaitTime: 1 } } });
  });

  it('never fails the change that triggered it', async () => {
    line([]);
    vi.mocked(Queue.aggregate).mockRejectedValue(new Error('down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(refreshQueueWaits(tenantId)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('estimateWaits', () => {
  it('leaves a patient at the lab out of the line, and they keep their place on return', () => {
    const atLab = { status: 'away', doctor: doctor('a') };
    const next = waiting(doctor('a'));
    const waits = estimateWaits([atLab, next], new Map(), 15);
    expect(waits.has(atLab)).toBe(false);
    expect(waits.get(next)).toMatchObject({ position: 1, estimatedWaitTime: 0 });

    const back = waiting(doctor('a'));
    expect(estimateWaits([back, next], new Map(), 15).get(back)).toMatchObject({ position: 1 });
    expect(estimateWaits([back, next], new Map(), 15).get(next)).toMatchObject({ position: 2 });
  });

  it('counts each doctor’s line on its own', () => {
    const a1 = waiting(doctor('a'));
    const b1 = waiting(doctor('b'));
    const a2 = waiting(doctor('a'));
    const waits = estimateWaits([a1, b1, a2], new Map(), 15);
    expect(waits.get(a1)).toMatchObject({ position: 1, estimatedWaitTime: 0 });
    expect(waits.get(b1)).toMatchObject({ position: 1, estimatedWaitTime: 0 });
    expect(waits.get(a2)).toMatchObject({ position: 2, estimatedWaitTime: 15 });
  });

  it('adds half a consultation when the doctor is busy, rounded to five minutes', () => {
    const next = waiting(doctor('a'));
    const waits = estimateWaits([seeing(doctor('a')), next], new Map(), 15);
    expect(waits.get(next)?.estimatedWaitTime).toBe(10);
  });

  it('uses the doctor’s average today over the clinic default', () => {
    const first = waiting(doctor('a'));
    const second = waiting(doctor('a'));
    const waits = estimateWaits([first, second], new Map([['a', 30]]), 15);
    expect(waits.get(second)).toMatchObject({ estimatedWaitTime: 30, consultMinutes: 30 });
  });

  it('gives no estimate for someone already being seen, and shares a line for unassigned patients', () => {
    const called = seeing();
    const one = waiting();
    const two = waiting();
    const waits = estimateWaits([called, one, two], new Map(), 10);
    expect(waits.has(called)).toBe(false);
    expect(waits.get(two)?.position).toBe(2);
  });
});
