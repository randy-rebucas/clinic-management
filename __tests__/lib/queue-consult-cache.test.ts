import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: { find: vi.fn(), aggregate: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({}));
vi.mock('@/models/Room', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/clinic-checkin', () => ({ checkInQr: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));

import { Types } from 'mongoose';
import Queue from '@/models/Queue';
import { rememberedConsultMinutes } from '@/lib/queue-display';

const today = new Date('2026-11-06T00:00:00Z');
const waiting = { _id: 'w', status: 'waiting' };
const inConsult = (id: string) => ({ _id: id, status: 'in-progress' });

describe('rememberedConsultMinutes', () => {
  let tenantId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Queue.aggregate).mockResolvedValue([] as never);
    tenantId = String(new Types.ObjectId());
  });

  it('reads once for polls that see the same consults', async () => {
    await rememberedConsultMinutes(tenantId, today, [waiting, inConsult('a'), inConsult('b')]);
    await rememberedConsultMinutes(tenantId, today, [inConsult('b'), inConsult('a')]);
    expect(Queue.aggregate).toHaveBeenCalledTimes(1);
  });

  it('reads again once a consult starts or finishes', async () => {
    await rememberedConsultMinutes(tenantId, today, [inConsult('a')]);
    await rememberedConsultMinutes(tenantId, today, []);
    expect(Queue.aggregate).toHaveBeenCalledTimes(2);
  });

  it('never shares between clinics', async () => {
    await rememberedConsultMinutes(tenantId, today, []);
    await rememberedConsultMinutes(String(new Types.ObjectId()), today, []);
    expect(Queue.aggregate).toHaveBeenCalledTimes(2);
  });

  it('starts fresh each day', async () => {
    await rememberedConsultMinutes(tenantId, today, []);
    await rememberedConsultMinutes(tenantId, new Date('2026-11-07T00:00:00Z'), []);
    expect(Queue.aggregate).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read', async () => {
    vi.mocked(Queue.aggregate).mockRejectedValueOnce(new Error('throttled') as never);
    await expect(rememberedConsultMinutes(tenantId, today, [])).rejects.toThrow('throttled');
    await rememberedConsultMinutes(tenantId, today, []);
    expect(Queue.aggregate).toHaveBeenCalledTimes(2);
  });
});
