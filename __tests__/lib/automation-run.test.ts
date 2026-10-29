import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Role', () => ({ default: {} }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/appointment-booking', () => ({ nextAppointmentCode: vi.fn() }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn(), findById: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ preloadSettings: vi.fn() }));

import Tenant from '@/models/Tenant';
import { preloadSettings } from '@/lib/settings';
import { forEachTenant, rotate, claimForSend, CLAIM_TTL_MS } from '@/lib/automations/shared';

const tenants = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: new Types.ObjectId(), name: `Clinic ${i}` }));

describe('forEachTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs every clinic and keeps going past a failure', async () => {
    vi.mocked(Tenant.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(tenants(5)) }) } as any);
    let calls = 0;
    const results = await forEachTenant(null, async () => {
      if (calls++ === 1) throw new Error('boom');
      return 'ok';
    });
    expect(results).toHaveLength(5);
    expect(results.filter((r) => r.success)).toHaveLength(4);
  });

  it('reports clinics it had no time to start as skipped', async () => {
    vi.mocked(Tenant.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(tenants(4)) }) } as any);
    const results = await forEachTenant(null, async () => 'ok', { budgetMs: -1 });
    expect(results.every((r) => !r.success && r.error?.startsWith('Skipped'))).toBe(true);
  });

  it('with a setting, skips only clinics that switched it off', async () => {
    const [on, off, missingKey, noRecord] = tenants(4);
    vi.mocked(Tenant.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve([on, off, missingKey, noRecord]) }) } as any);
    vi.mocked(preloadSettings).mockResolvedValue(new Map<string, any>([
      [String(on._id), { automationSettings: { autoX: true } }],
      [String(off._id), { automationSettings: { autoX: false } }],
      [String(missingKey._id), { automationSettings: {} }],
    ]));
    const seen: string[] = [];
    await forEachTenant(null, async (t) => { seen.push(t.tenantId); }, { setting: 'autoX' });
    expect(preloadSettings).toHaveBeenCalledTimes(1);
    expect(seen.sort()).toEqual([on, missingKey, noRecord].map((t) => String(t._id)).sort());
  });

  it('runs a single named clinic whatever its setting', async () => {
    const [one] = tenants(1);
    vi.mocked(Tenant.findById).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(one) }) } as any);
    const results = await forEachTenant(String(one._id), async () => 'ok', { setting: 'autoX' });
    expect(results).toHaveLength(1);
    expect(preloadSettings).not.toHaveBeenCalled();
  });
});

describe('rotate', () => {
  it('starts at the offset and wraps', () => {
    expect(rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotate([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
  });
});

describe('claimForSend', () => {
  it('claims only a record that is unsent and not freshly claimed by another run', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    expect(await claimForSend({ updateOne }, { _id: 'a', reminderSentAt: { $exists: false } }, 'reminderClaimedAt')).toBe(true);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter.$and[0]).toEqual({ _id: 'a', reminderSentAt: { $exists: false } });
    const stale = filter.$and[1].$or[2].reminderClaimedAt.$lt as Date;
    expect(Date.now() - stale.getTime()).toBeGreaterThanOrEqual(CLAIM_TTL_MS - 1000);
    expect(update.$set.reminderClaimedAt).toBeInstanceOf(Date);
  });

  it('reports a record someone else claimed', async () => {
    expect(await claimForSend({ updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }) }, { _id: 'a' }, 'c')).toBe(false);
  });
});
