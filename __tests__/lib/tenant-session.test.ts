import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn() }));

import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
} from '@/lib/api/tenant-session';

const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439022';

const session = (tenantId?: string) =>
  ({ userId: '507f1f77bcf86cd799439099', email: 'a@b.c', role: 'admin', tenantId }) as any;

describe('requireTenantSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: null } as any);
  });

  it('returns 401 without a session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null as any);
    const res = await requireTenantSession();
    expect(isTenantSessionError(res)).toBe(true);
    expect((res as Response).status).toBe(401);
  });

  it('returns 403 when the session has no tenant', async () => {
    vi.mocked(verifySession).mockResolvedValue(session(undefined));
    const res = await requireTenantSession();
    expect((res as Response).status).toBe(403);
  });

  it('returns 403 when the session tenant id is malformed', async () => {
    vi.mocked(verifySession).mockResolvedValue(session('not-an-id'));
    const res = await requireTenantSession();
    expect((res as Response).status).toBe(403);
  });

  it('returns 403 when the subdomain tenant differs from the session tenant', async () => {
    vi.mocked(verifySession).mockResolvedValue(session(TENANT_A));
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: TENANT_B } as any);
    const res = await requireTenantSession();
    expect((res as Response).status).toBe(403);
  });

  it('succeeds on the matching subdomain', async () => {
    vi.mocked(verifySession).mockResolvedValue(session(TENANT_A));
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: TENANT_A } as any);
    const res = await requireTenantSession();
    expect(isTenantSessionError(res)).toBe(false);
    if (isTenantSessionError(res)) return;
    expect(res.tenantId).toBe(TENANT_A);
    expect(res.tenantObjectId).toBeInstanceOf(Types.ObjectId);
    expect(String(res.tenantObjectId)).toBe(TENANT_A);
  });

  it('succeeds on the root domain (no subdomain tenant)', async () => {
    vi.mocked(verifySession).mockResolvedValue(session(TENANT_A));
    const res = await requireTenantSession();
    expect(isTenantSessionError(res)).toBe(false);
  });
});

describe('tenant filter helpers', () => {
  it('builds tenantId and tenantIds filters that override caller-supplied values', () => {
    const f = tenantFilter(TENANT_A, { _id: 'x', tenantId: TENANT_B });
    expect(String(f.tenantId)).toBe(TENANT_A);
    const p = patientTenantFilter(TENANT_A, { tenantIds: TENANT_B });
    expect(String(p.tenantIds)).toBe(TENANT_A);
  });

  it('validates ids', () => {
    expect(isValidId(TENANT_A)).toBe(true);
    expect(isValidId('nope')).toBe(false);
    expect(isValidId({ $ne: null })).toBe(false);
  });
});
