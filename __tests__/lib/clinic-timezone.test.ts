import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));

import Tenant from '@/models/Tenant';
import { clearTimezoneCache, getTenantTimezone } from '@/lib/clinic-timezone';

const stored = (timezone: string) =>
  vi.mocked(Tenant.findById).mockReturnValue({ select: () => ({ lean: async () => ({ settings: { timezone } }) }) } as never);

let n = 0;
const nextTenant = () => `507f1f77bcf86cd7994390${String(++n).padStart(2, '0')}`;

describe('getTenantTimezone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.mocked(Tenant.findById).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('reads a clinic once, then again after a minute', async () => {
    const tenantId = nextTenant();
    stored('Asia/Tokyo');

    await expect(getTenantTimezone(tenantId)).resolves.toBe('Asia/Tokyo');
    await getTenantTimezone(tenantId);
    expect(Tenant.findById).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await getTenantTimezone(tenantId);
    expect(Tenant.findById).toHaveBeenCalledTimes(2);
  });

  it('keeps clinics apart', async () => {
    stored('Asia/Tokyo');
    await expect(getTenantTimezone(nextTenant())).resolves.toBe('Asia/Tokyo');
    stored('Asia/Manila');
    await expect(getTenantTimezone(nextTenant())).resolves.toBe('Asia/Manila');
  });

  it('sees a changed timezone at once on this server', async () => {
    const tenantId = nextTenant();
    stored('Asia/Tokyo');
    await getTenantTimezone(tenantId);

    stored('Asia/Manila');
    clearTimezoneCache(tenantId);

    await expect(getTenantTimezone(tenantId)).resolves.toBe('Asia/Manila');
  });

  it('does not remember a failed read', async () => {
    const tenantId = nextTenant();
    vi.mocked(Tenant.findById).mockImplementation(() => {
      throw new Error('down');
    });
    await getTenantTimezone(tenantId);

    stored('Asia/Tokyo');
    await expect(getTenantTimezone(tenantId)).resolves.toBe('Asia/Tokyo');
  });
});
