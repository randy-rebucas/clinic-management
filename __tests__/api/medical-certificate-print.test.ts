import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logPrinted: vi.fn() }));
vi.mock('@/app/lib/auth-helpers', () => ({
  requirePermission: vi.fn(async () => null),
  isAdmin: (s: { role?: string } | null) => s?.role === 'admin' || s?.role === 'owner',
}));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/lib/document-seal', () => ({ issueSeal: vi.fn(), tenantScopedQuery: vi.fn(() => null) }));

import { requireTenantSession } from '@/lib/api/tenant-session';
import User from '@/models/User';
import { tenantScopedQuery } from '@/lib/document-seal';
import { GET } from '@/app/api/visits/[id]/print/medical-certificate/route';

const TENANT = '507f1f77bcf86cd799439011';
const VISIT = '507f1f77bcf86cd7994390aa';

const asRole = (role: string) =>
  vi.mocked(requireTenantSession).mockResolvedValue({
    session: { userId: '507f1f77bcf86cd799439099', role, tenantId: TENANT },
    tenantId: TENANT,
    tenantObjectId: TENANT,
  } as any);

const print = () =>
  GET(new NextRequest(`http://localhost/api/visits/${VISIT}/print/medical-certificate?purpose=sick%20leave`), { params: Promise.resolve({ id: VISIT }) });

describe('printing a medical certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const q: any = { lean: vi.fn().mockResolvedValue(null) };
    q.select = vi.fn().mockReturnValue(q);
    vi.mocked(User.findOne).mockReturnValue(q);
  });

  it('is refused to staff who aren’t doctors or admins, before any record is read', async () => {
    asRole('nurse');
    const res = await print();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/only doctors and clinic admins/i);
    expect(tenantScopedQuery).not.toHaveBeenCalled();
  });

  it('lets doctors and admins through to the visit', async () => {
    for (const role of ['doctor', 'admin']) {
      asRole(role);
      // The visit lookup runs (and finds nothing here).
      expect((await print()).status).toBe(404);
    }
    expect(tenantScopedQuery).toHaveBeenCalledWith(VISIT, TENANT);
  });
});
