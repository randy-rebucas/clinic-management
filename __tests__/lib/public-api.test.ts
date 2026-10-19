import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1, limit: 120, retryAfter: 60, resetTime: 0 }),
}));
vi.mock('@/models/ApiKey', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn().mockReturnValue({ catch: vi.fn() }) } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));
vi.mock('dns/promises', () => ({ lookup: vi.fn() }));

import { NextRequest } from 'next/server';
import { lookup } from 'dns/promises';
import ApiKey from '@/models/ApiKey';
import Tenant from '@/models/Tenant';
import { consumeRateLimit } from '@/lib/middleware/rate-limit';
import { generateApiKey, parseApiKey, requireApiKey, isApiError } from '@/lib/api-keys';
import { signPayload, checkWebhookUrl } from '@/lib/webhooks';
import { serializeAppointment, serializePatient } from '@/lib/public-api';

const TENANT = '507f1f77bcf86cd799439011';
const lean = (v: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(v) }) });

function req(key?: string) {
  return new NextRequest('https://api.example.test/api/v1/patients', { headers: key ? { authorization: `Bearer ${key}` } : {} });
}

function setup(opts: { scopes?: string[]; revoked?: boolean; plan?: string; expires?: number } = {}) {
  const { key, keyId, secretHash } = generateApiKey();
  vi.mocked(ApiKey.findOne).mockReturnValue(
    lean({ _id: 'k1', keyId, secretHash, tenantId: TENANT, scopes: opts.scopes ?? ['patients:read'], revokedAt: opts.revoked ? new Date() : undefined }) as any
  );
  vi.mocked(Tenant.findById).mockReturnValue(
    lean({ status: 'active', subscription: { plan: opts.plan ?? 'professional', status: 'active', expiresAt: new Date(Date.now() + (opts.expires ?? 86_400_000)) } }) as any
  );
  return key;
}

async function errorCode(res: unknown) {
  return ((await (res as Response).json()) as { error: { code: string } }).error.code;
}

describe('API keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates keys that parse back, with a stable preview', () => {
    const { key, keyId, preview } = generateApiKey();
    expect(key).toMatch(/^mcs_[a-f0-9]{12}_[A-Za-z0-9]{40}$/);
    expect(parseApiKey(key)?.keyId).toBe(keyId);
    expect(preview.startsWith(`mcs_${keyId}_`)).toBe(true);
    expect(parseApiKey('mcs_nothex_abc')).toBeNull();
    expect(generateApiKey().key).not.toBe(key);
  });

  it('accepts a valid key with the scope on a plan with API access', async () => {
    const ctx = await requireApiKey(req(setup()), 'patients:read');
    expect(isApiError(ctx)).toBe(false);
    expect(ctx).toMatchObject({ tenantId: TENANT, scopes: ['patients:read'] });
  });

  it('refuses a missing, wrong, or revoked key with 401', async () => {
    expect((await requireApiKey(req(), 'patients:read') as Response).status).toBe(401);

    const key = setup();
    const tampered = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
    expect((await requireApiKey(req(tampered), 'patients:read') as Response).status).toBe(401);

    expect((await requireApiKey(req(setup({ revoked: true })), 'patients:read') as Response).status).toBe(401);
  });

  it('refuses a missing scope, a plan without API access and a lapsed plan with 403', async () => {
    const noScope = await requireApiKey(req(setup()), 'patients:write');
    expect(await errorCode(noScope)).toBe('insufficient_scope');

    const basic = await requireApiKey(req(setup({ plan: 'basic' })), 'patients:read');
    expect(await errorCode(basic)).toBe('plan_required');

    const lapsed = await requireApiKey(req(setup({ expires: -1000 })), 'patients:read');
    expect(await errorCode(lapsed)).toBe('plan_required');
  });

  it('answers 429 with Retry-After when the key is over its rate limit', async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, count: 121, limit: 120, retryAfter: 30, resetTime: 0 } as any);
    const res = (await requireApiKey(req(setup()), 'patients:read')) as Response;
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
  });
});

describe('webhook signing and URLs', () => {
  it('signs "<t>.<body>" with HMAC-SHA256', () => {
    const sig = signPayload('whsec_test', '{"a":1}', 1700000000);
    const expected = createHmac('sha256', 'whsec_test').update('1700000000.{"a":1}').digest('hex');
    expect(sig).toBe(`t=1700000000,v1=${expected}`);
  });

  it('accepts public https URLs and refuses http, credentials and private addresses', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
    expect(await checkWebhookUrl('https://hooks.example.com/x')).toBeNull();
    expect(await checkWebhookUrl('http://hooks.example.com/x')).toMatch(/https/);
    expect(await checkWebhookUrl('https://u:p@hooks.example.com/x')).toMatch(/username/);
    expect(await checkWebhookUrl('https://169.254.169.254/latest')).toMatch(/public/);
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as any);
    expect(await checkWebhookUrl('https://internal.example.com/x')).toMatch(/public/);
  });
});

describe('public serializers', () => {
  it('leaves clinical and credential fields out of patients', () => {
    const out = serializePatient({
      _id: 'p1',
      firstName: 'Ana',
      lastName: 'Cruz',
      dateOfBirth: new Date('1990-04-02T00:00:00Z'),
      address: { zipCode: '1000' },
      password: 'hash',
      otp: '123456',
      medicalHistory: 'secret',
      allergies: ['penicillin'],
      identifiers: { philHealth: '12' },
    });
    expect(out).toMatchObject({ id: 'p1', first_name: 'Ana', date_of_birth: '1990-04-02', address: { zip_code: '1000' } });
    const json = JSON.stringify(out);
    for (const leaked of ['hash', '123456', 'secret', 'penicillin', 'philHealth']) expect(json).not.toContain(leaked);
  });

  it('keeps notes and video links out of appointments and reads scheduledAt in the clinic timezone', () => {
    const out = serializeAppointment(
      { _id: 'a1', patient: { _id: 'p1', firstName: 'Ana' }, doctor: 'd1', scheduledAt: new Date('2026-10-20T20:00:00Z'), status: 'scheduled', notes: 'private', teleconsult: { roomName: 'r' } },
      'Asia/Manila'
    );
    expect(out).toMatchObject({ patient_id: 'p1', doctor_id: 'd1', date: '2026-10-21' });
    expect(JSON.stringify(out)).not.toMatch(/private|roomName/);
    expect(serializeAppointment({ _id: 'a2', appointmentDate: new Date('2026-10-20T00:00:00Z'), status: 'scheduled' }, 'America/New_York').date).toBe('2026-10-20');
  });
});
