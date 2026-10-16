import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/models/Counter', () => ({
  default: { findOneAndUpdate: vi.fn(), create: vi.fn() },
}));

import Counter from '@/models/Counter';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) }) as any;
const TENANT = '507f1f77bcf86cd799439011';

describe('nextSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments an existing counter atomically without seeding', async () => {
    vi.mocked(Counter.findOneAndUpdate).mockReturnValueOnce(lean({ seq: 42 }));
    const seed = vi.fn();
    expect(await nextSequence(TENANT, 'appointment', seed)).toBe(42);
    expect(seed).not.toHaveBeenCalled();
    const [filter, update] = vi.mocked(Counter.findOneAndUpdate).mock.calls[0] as any[];
    expect(String(filter.tenantId)).toBe(TENANT);
    expect(filter.key).toBe('appointment');
    expect(update).toEqual({ $inc: { seq: 1 } });
    expect(Counter.create).not.toHaveBeenCalled();
  });

  it('seeds from existing data on first use', async () => {
    vi.mocked(Counter.findOneAndUpdate).mockReturnValueOnce(lean(null));
    vi.mocked(Counter.create).mockImplementationOnce((async (doc: any) => doc) as any);
    expect(await nextSequence(TENANT, 'appointment', async () => 17)).toBe(18);
    const created = vi.mocked(Counter.create).mock.calls[0][0] as any;
    expect(created.seq).toBe(18);
    expect(created.tenantId).toBeInstanceOf(Types.ObjectId);
  });

  it('starts at 1 without a seed and clamps negative seeds', async () => {
    vi.mocked(Counter.findOneAndUpdate).mockReturnValue(lean(null));
    vi.mocked(Counter.create).mockImplementation((async (doc: any) => doc) as any);
    expect(await nextSequence(null, 'global')).toBe(1);
    expect(await nextSequence(TENANT, 'x', async () => -5)).toBe(1);
    expect((vi.mocked(Counter.create).mock.calls[0][0] as any).tenantId).toBeNull();
  });

  it('falls back to increment when another request created the counter first (E11000)', async () => {
    vi.mocked(Counter.findOneAndUpdate).mockReturnValueOnce(lean(null)).mockReturnValueOnce(lean({ seq: 19 }));
    vi.mocked(Counter.create).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await nextSequence(TENANT, 'appointment', async () => 17)).toBe(19);
    expect(Counter.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('rethrows other create errors', async () => {
    vi.mocked(Counter.findOneAndUpdate).mockReturnValueOnce(lean(null));
    vi.mocked(Counter.create).mockRejectedValueOnce(new Error('connection lost'));
    await expect(nextSequence(TENANT, 'appointment')).rejects.toThrow('connection lost');
  });
});

describe('formatCode / maxCodeSeed', () => {
  it('pads codes and grows past the width', () => {
    expect(formatCode('APT', 7)).toBe('APT-000007');
    expect(formatCode('APT', 1234567)).toBe('APT-1234567');
  });

  it('finds the numeric maximum, not the string maximum', async () => {
    const model = {
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { appointmentCode: 'APT-999999' },
            { appointmentCode: 'APT-1000000' },
            { appointmentCode: 'garbage' },
            {},
          ]),
        }),
      }),
    };
    expect(await maxCodeSeed(model as any, 'appointmentCode', { tenantId: TENANT })()).toBe(1000000);
  });
});
