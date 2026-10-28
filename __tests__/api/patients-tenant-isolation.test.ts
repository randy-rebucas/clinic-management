import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn().mockResolvedValue({ tenantId: null }) }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn() } }));

import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import Patient from '@/models/Patient';
import { GET } from '@/app/api/patients/[id]/route';

const TENANT_A = '507f1f77bcf86cd799439011';
const TENANT_B = '507f1f77bcf86cd799439022';
const PATIENT_ID = '507f1f77bcf86cd799439033';

const call = (id: string, url = `http://localhost/api/patients/${id}`) =>
  GET(new NextRequest(url), { params: Promise.resolve({ id }) });

describe('GET /api/patients/[id] tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue({
      userId: '507f1f77bcf86cd799439099',
      email: 'a@b.c',
      role: 'admin',
      tenantId: TENANT_A,
    } as any);
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: null } as any);
  });

  it("scopes the lookup to the session tenant's tenantIds", async () => {
    const attachments = [
      { filename: 'ours.pdf', tenantId: TENANT_A },
      { filename: 'theirs.pdf', tenantId: '507f1f77bcf86cd799439099' },
    ];
    vi.mocked(Patient.findOne).mockResolvedValue({
      toObject: () => ({ _id: PATIENT_ID, firstName: 'Ana', attachments }),
    } as any);
    const res = await call(PATIENT_ID);
    expect(res.status).toBe(200);
    // Another clinic's files on the shared record are not sent.
    const body = await res.json();
    expect(body.data.attachments.map((a: any) => a.filename)).toEqual(['ours.pdf']);
    const filter = vi.mocked(Patient.findOne).mock.calls[0][0] as any;
    expect(String(filter._id)).toBe(PATIENT_ID);
    expect(String(filter.tenantIds)).toBe(TENANT_A);
    expect(filter.tenantId).toBeUndefined();
  });

  it('ignores a tenantId supplied in the query string', async () => {
    vi.mocked(Patient.findOne).mockResolvedValue(null);
    const res = await call(PATIENT_ID, `http://localhost/api/patients/${PATIENT_ID}?tenantId=${TENANT_B}`);
    expect(res.status).toBe(404);
    expect(String((vi.mocked(Patient.findOne).mock.calls[0][0] as any).tenantIds)).toBe(TENANT_A);
  });

  it("returns 404 for another tenant's patient", async () => {
    vi.mocked(Patient.findOne).mockResolvedValue(null);
    expect((await call(PATIENT_ID)).status).toBe(404);
  });

  it('returns 404 for a malformed id without querying', async () => {
    expect((await call('not-an-id')).status).toBe(404);
    expect(Patient.findOne).not.toHaveBeenCalled();
  });

  it('returns 403 when the subdomain belongs to another tenant', async () => {
    vi.mocked(getTenantContext).mockResolvedValue({ tenantId: TENANT_B } as any);
    expect((await call(PATIENT_ID)).status).toBe(403);
    expect(Patient.findOne).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null as any);
    expect((await call(PATIENT_ID)).status).toBe(401);
  });
});
