import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: { updateMany: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }) } }));
vi.mock('@/models/Appointment', () => ({
  default: { find: vi.fn(() => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })) },
}));
vi.mock('@/models/Visit', () => ({ default: {} }));
vi.mock('@/lib/automations/shared', () => ({
  errorMessage: (e: unknown) => String(e),
  forEachTenant: async (_id: unknown, fn: (t: unknown) => Promise<unknown>) => {
    const tenant = { tenantId: 't', tenantObjectId: new Types.ObjectId(), timezone: 'Asia/Manila' };
    return [{ tenantId: 't', success: true, result: await fn(tenant) }];
  },
}));

import Queue from '@/models/Queue';
import { runEndOfDayCleanup } from '@/lib/automations/end-of-day-cleanup';

describe('runEndOfDayCleanup', () => {
  const updates = () => vi.mocked(Queue.updateMany).mock.calls as unknown as [Record<string, any>, Record<string, any>][];

  it('closes a patient still at the lab as completed, not as unseen', async () => {
    await runEndOfDayCleanup();

    const seen = updates().find(([filter]) => filter.status?.$in?.includes('away'));
    expect(seen?.[0].status.$in).toContain('in-progress');
    expect(seen?.[0].awayReason).toEqual({ $ne: 'missed' });
    expect(seen?.[1].$set.status).toBe('completed');
  });

  it('closes a patient who never came back as a no-show', async () => {
    await runEndOfDayCleanup();

    const missed = updates().find(([filter]) => filter.awayReason === 'missed');
    expect(missed?.[0].status).toBe('away');
    expect(missed?.[1].$set.status).toBe('no-show');
  });
});
