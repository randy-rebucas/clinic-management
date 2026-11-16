import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn().mockResolvedValue({ tenantId: null }) }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/LabResult', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/lib/lab-integration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lab-integration')>()),
  sendLabRequestToThirdParty: vi.fn(),
}));

import { verifySession } from '@/app/lib/dal';
import LabResult from '@/models/LabResult';
import { sendLabRequestToThirdParty } from '@/lib/lab-integration';
import { POST } from '@/app/api/lab-results/third-party/send/route';
import { GET } from '@/app/api/lab-results/third-party/labs/route';

const TENANT = '507f1f77bcf86cd799439011';
const A = '507f1f77bcf86cd7994390a1';
const B = '507f1f77bcf86cd7994390b2';
const C = '507f1f77bcf86cd7994390c3';
const LAB = { labCode: 'SLIMMLAB', labName: 'SLIMM Laboratory Inc', apiEndpoint: 'https://lab.example/v1/orders', apiKey: 'lpk_x', webhookSecret: 'whsec_x', tenantIds: [TENANT] };

const patient = { firstName: 'Ana', lastName: 'Cruz', dateOfBirth: new Date('1990-04-02T00:00:00Z'), sex: 'female', patientCode: 'P-1' };
function test(id: string, fields: Record<string, unknown> = {}) {
  const doc: any = { _id: id, requestCode: `LAB-${id.slice(-2)}`, orderCode: 'ORD-1', status: 'ordered', patient, request: { testType: `Test ${id.slice(-2)}`, urgency: 'routine' }, ...fields };
  doc.save = vi.fn().mockResolvedValue(doc);
  return doc;
}

function db(first: any, all: any[]) {
  vi.mocked(LabResult.findOne).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(first) }) } as any);
  (vi.mocked(LabResult.find) as any).mockImplementation((filter: any) => {
    const ids: string[] = filter?._id?.$in?.map(String);
    const docs = ids ? all.filter((d) => ids.includes(String(d._id))) : all;
    return {
      select: () => ({ lean: () => Promise.resolve(docs.map((d) => ({ _id: d._id }))) }),
      populate: () => ({ populate: () => Promise.resolve(docs) }),
    } as any;
  });
}

const send = (body: unknown) => POST(new NextRequest('http://localhost/api/lab-results/third-party/send', { method: 'POST', body: JSON.stringify(body) }));
const labConfig = { labCode: 'SLIMMLAB', labName: 'SLIMM Laboratory Inc' };

describe('partner lab send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LAB_INTEGRATIONS', JSON.stringify([LAB]));
    vi.mocked(verifySession).mockResolvedValue({ userId: '507f1f77bcf86cd799439099', email: 'a@b.c', role: 'doctor', tenantId: TENANT } as any);
    vi.mocked(sendLabRequestToThirdParty).mockResolvedValue({ success: true, externalRequestId: 'REQ-1' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('lists the labs open to this clinic, without keys', async () => {
    const json = await (await GET()).json();
    expect(json.data).toEqual([{ labCode: 'SLIMMLAB', labName: 'SLIMM Laboratory Inc' }]);
  });

  it('refuses a lab not set up for this clinic', async () => {
    vi.stubEnv('LAB_INTEGRATIONS', JSON.stringify([{ ...LAB, tenantIds: ['507f1f77bcf86cd799439000'] }]));
    const res = await send({ labResultId: A, labConfig });
    expect(res.status).toBe(400);
    expect(sendLabRequestToThirdParty).not.toHaveBeenCalled();
  });

  it('sends one test and records it as sent, without keys', async () => {
    const a = test(A);
    db({ _id: A, orderCode: 'ORD-1' }, [a]);
    const json = await (await send({ labResultId: A, labConfig })).json();
    expect(json.success).toBe(true);
    expect(sendLabRequestToThirdParty).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendLabRequestToThirdParty).mock.calls[0][1]).toMatchObject({ requestCode: 'LAB-a1', patient: { dateOfBirth: '1990-04-02' } });
    expect(a.thirdPartyLab).toMatchObject({ labCode: 'SLIMMLAB', status: 'sent', externalRequestId: 'REQ-1' });
    expect(JSON.stringify(a.thirdPartyLab)).not.toMatch(/lpk_|whsec_|https:/);
  });

  it('sends the whole order, skipping tests already sent or finished', async () => {
    const a = test(A);
    const b = test(B, { thirdPartyLab: { labName: 'SLIMM Laboratory Inc', labCode: 'SLIMMLAB', integrationType: 'api', status: 'sent' } });
    const c = test(C, { status: 'completed' });
    db({ _id: A, orderCode: 'ORD-1' }, [a, b, c]);
    const json = await (await send({ labResultId: A, labConfig, wholeOrder: true })).json();
    expect(sendLabRequestToThirdParty).toHaveBeenCalledTimes(1);
    expect(json.data.tests).toEqual([
      expect.objectContaining({ labResultId: A, success: true }),
      expect.objectContaining({ labResultId: B, success: true, skipped: 'already sent' }),
    ]);
    expect(c.save).not.toHaveBeenCalled();
  });

  it("keeps the lab's refusal on the test so it can be sent again", async () => {
    vi.mocked(sendLabRequestToThirdParty).mockResolvedValue({ success: false, error: 'The lab said: Test not offered.' });
    const a = test(A);
    db({ _id: A, orderCode: 'ORD-1' }, [a]);
    const json = await (await send({ labResultId: A, labConfig })).json();
    expect(json.success).toBe(false);
    expect(json.data.tests[0].error).toBe('The lab said: Test not offered.');
    expect(a.thirdPartyLab).toMatchObject({ status: 'error', errorMessage: 'The lab said: Test not offered.' });
  });
});
