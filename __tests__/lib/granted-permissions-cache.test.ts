import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Permission', () => ({ default: { find: vi.fn() } }));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));

import { Types } from 'mongoose';
import Permission from '@/models/Permission';
import { forgetGrantedPermissions, hasPermission } from '@/app/lib/auth-helpers';

const id = () => String(new Types.ObjectId());
const TENANT_A = id();
const TENANT_B = id();
const USER = id();
const ROLE = id();

function granted(docs: { resource: string; actions: string[] }[]) {
  vi.mocked(Permission.find).mockReturnValue({ select: () => ({ lean: vi.fn().mockResolvedValue(docs) }) } as any);
}

const staff = (overrides: Record<string, string> = {}) => ({ userId: USER, role: 'custom', roleId: ROLE, tenantId: TENANT_A, ...overrides });
const canRead = (session = staff()) => hasPermission(session, 'invoices', 'read');
const invoices = [{ resource: 'invoices', actions: ['read'] }];

describe('granted permissions cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetGrantedPermissions();
    granted(invoices);
  });

  afterEach(() => vi.useRealTimers());

  it('reads once for repeated checks', async () => {
    expect(await canRead()).toBe(true);
    expect(await canRead()).toBe(true);
    expect(Permission.find).toHaveBeenCalledTimes(1);
  });

  it('a revoked permission is gone at once on this instance', async () => {
    expect(await canRead()).toBe(true);
    granted([]);
    forgetGrantedPermissions();
    expect(await canRead()).toBe(false);
  });

  it('expires by itself, so other instances catch up within a minute', async () => {
    vi.useFakeTimers();
    expect(await canRead()).toBe(true);
    granted([]);
    vi.advanceTimersByTime(59_000);
    expect(await canRead()).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(await canRead()).toBe(false);
  });

  it('never shares between clinics, people or roles', async () => {
    await canRead();
    await canRead(staff({ tenantId: TENANT_B }));
    await canRead(staff({ userId: id() }));
    await canRead(staff({ roleId: id() }));
    expect(Permission.find).toHaveBeenCalledTimes(4);
  });

  it('moving someone to another role does not wait for the cache', async () => {
    expect(await canRead()).toBe(true);
    granted([]);
    expect(await canRead(staff({ roleId: id() }))).toBe(false);
  });

  it('does not keep a failed read, and a failed read grants nothing', async () => {
    vi.mocked(Permission.find).mockReturnValueOnce({
      select: () => ({ lean: vi.fn().mockRejectedValue(new Error('throttled')) }),
    } as any);
    expect(await canRead()).toBe(false);
    expect(await canRead()).toBe(true);
    expect(Permission.find).toHaveBeenCalledTimes(2);
  });
});
