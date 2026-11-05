import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/models/Queue', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/queue-consult', () => ({ findConsultBlocker: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }));

import { after } from 'next/server';
import Queue from '@/models/Queue';
import { getSettings } from '@/lib/settings';
import { findConsultBlocker } from '@/lib/queue-consult';
import { QUEUE_SORT } from '@/lib/queue-order';
import { callNextPatient } from '@/lib/automations/queue-auto-call';

const tenantId = new Types.ObjectId();
const doctor = new Types.ObjectId();
const own = { _id: new Types.ObjectId() };
const unassigned = { _id: new Types.ObjectId() };
const called = { _id: own._id, patientName: 'Ana Cruz', queueNumber: 'W20261105-004' };

/** What each line holds; a line not listed is empty. */
function lines(map: { own?: unknown; unassigned?: unknown }) {
  const sort = vi.fn();
  vi.mocked(Queue.findOne).mockImplementation(((filter: { doctor: unknown }) => {
    const row = filter.doctor === null ? map.unassigned : map.own;
    const chain = { sort: (s: unknown) => (sort(s), chain), select: () => chain, lean: async () => row ?? null };
    return chain;
  }) as never);
  return sort;
}

const claims = (reply: unknown) => vi.mocked(Queue.findOneAndUpdate).mockReturnValue({ lean: async () => reply } as never);
const firstClaim = () => vi.mocked(Queue.findOneAndUpdate).mock.calls[0] as unknown as [Record<string, unknown>, { $set: Record<string, unknown> }];

describe('callNextPatient', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockReset().mockResolvedValue({ automationSettings: { autoCallNextPatient: true } } as never);
    vi.mocked(findConsultBlocker).mockReset().mockResolvedValue(null);
    vi.mocked(Queue.findOne).mockReset();
    vi.mocked(Queue.findOneAndUpdate).mockReset();
    vi.mocked(after).mockClear();
    claims(called);
  });

  it.each([[{}], [{ autoCallNextPatient: false }]])('does nothing unless the clinic turned it on: %j', async (automationSettings) => {
    vi.mocked(getSettings).mockResolvedValue({ automationSettings } as never);
    lines({ own });

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(Queue.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('calls the first in this doctor\'s line, starts the clocks and tells them', async () => {
    const sort = lines({ own, unassigned });

    const result = await callNextPatient(tenantId, doctor);

    expect(result).toEqual({ name: 'Ana Cruz', number: 'W-004' });
    expect(sort).toHaveBeenCalledWith(QUEUE_SORT);
    const [filter, update] = firstClaim();
    expect(filter).toMatchObject({ _id: own._id, status: 'waiting' });
    expect(update.$set).toMatchObject({ status: 'in-progress', doctor });
    expect(update.$set.startedAt).toBeInstanceOf(Date);
    expect(update.$set.calledAt).toBeInstanceOf(Date);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('only looks at patients who have checked in', async () => {
    lines({ own });

    await callNextPatient(tenantId, doctor);

    expect(vi.mocked(Queue.findOne).mock.calls[0][0]).toMatchObject({ tenantId, status: 'waiting', checkedIn: true, doctor });
  });

  it('gives a doctor with an empty line the next unassigned patient', async () => {
    lines({ unassigned });

    await callNextPatient(tenantId, doctor);

    const [filter, update] = firstClaim();
    expect(filter._id).toBe(unassigned._id);
    expect(update.$set.doctor).toBe(doctor);
    expect(vi.mocked(findConsultBlocker).mock.calls[0][1]).toEqual({ _id: unassigned._id, doctor });
  });

  it('keeps the unassigned line to itself', async () => {
    lines({ unassigned });

    await callNextPatient(tenantId, null);

    expect(Queue.findOne).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Queue.findOne).mock.calls[0][0]).toMatchObject({ doctor: null });
    expect(firstClaim()[1].$set).not.toHaveProperty('doctor');
  });

  it('calls nobody when both lines are empty', async () => {
    lines({});

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(Queue.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('respects the one-in-consult rule', async () => {
    lines({ own });
    vi.mocked(findConsultBlocker).mockResolvedValue('busy');

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(Queue.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('steps aside when a desk called the patient first', async () => {
    lines({ own });
    claims(null);

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(after).not.toHaveBeenCalled();
  });

  it('steps aside when the unique index says the doctor is already taken', async () => {
    lines({ own });
    vi.mocked(Queue.findOneAndUpdate).mockReturnValue({ lean: async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); } } as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('never fails the consult that just ended', async () => {
    vi.mocked(getSettings).mockRejectedValue(new Error('down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(callNextPatient(tenantId, doctor)).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
