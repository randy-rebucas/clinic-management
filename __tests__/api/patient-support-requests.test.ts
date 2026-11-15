import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null), rateLimiters: {} }));
vi.mock('@/lib/support', () => ({ notifyPlatformTeam: vi.fn() }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/SupportRequest', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));

import Patient from '@/models/Patient';
import SupportRequest from '@/models/SupportRequest';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { notifyPlatformTeam } from '@/lib/support';
import { createAuditLog } from '@/lib/audit';
import { GET as getDeletion, POST as postDeletion } from '@/app/api/patients/me/deletion-request/route';
import { POST as postSupport } from '@/app/api/patients/me/support/route';
import { GET as getAppConfig } from '@/app/api/patients/app-config/route';

const SELF = '507f1f77bcf86cd799439033';
const REQ = '507f1f77bcf86cd7994390ab';
const CREATED = new Date('2026-11-15T08:00:00Z');

const json = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const patient = (p: Record<string, unknown> | null) =>
  vi.mocked(Patient.findById).mockReturnValue({ select: () => ({ lean: async () => p }) } as any);
const openRequest = (r: Record<string, unknown> | null) =>
  vi.mocked(SupportRequest.findOne).mockReturnValue({ select: () => ({ sort: () => ({ lean: async () => r }) }) } as any);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: SELF } as any);
  patient({ firstName: 'Ana', lastName: 'Cruz', phone: '+639171234567' });
  openRequest(null);
  vi.mocked(SupportRequest.create).mockResolvedValue({ _id: REQ, createdAt: CREATED } as any);
});

describe('eMCR account deletion request', () => {
  it('signed out: 401', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await getDeletion(new NextRequest('http://localhost/api/patients/me/deletion-request'))).status).toBe(401);
  });

  it('refuses a family profile (always about the account holder)', async () => {
    await getDeletion(new NextRequest('http://localhost/api/patients/me/deletion-request'));
    expect(vi.mocked(verifyPatientAuth).mock.calls[0][1]).toEqual({ profile: 'refuse' });
  });

  it('GET answers null when nothing is open', async () => {
    const res = await getDeletion(new NextRequest('http://localhost/api/patients/me/deletion-request'));
    expect(await res.json()).toEqual({ success: true, data: null });
  });

  it('POST files a patient request in the support queue, phone-only account, and audits it', async () => {
    const res = await postDeletion(json('/api/patients/me/deletion-request', { reason: 'Moving abroad' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ reference: 'SR-4390AB', status: 'open', requestedAt: CREATED.toISOString() });

    const doc = vi.mocked(SupportRequest.create).mock.calls[0][0] as any;
    expect(doc).toMatchObject({ source: 'patient', kind: 'account-deletion', category: 'account', phone: '+639171234567', status: 'open' });
    expect(doc.email).toBeUndefined();
    expect(String(doc.patientId)).toBe(SELF);
    expect(doc.message).toContain('Reason: Moving abroad');
    expect(doc.message).toContain(`record ${SELF}`);
    expect(notifyPlatformTeam).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ dataSubject: SELF, isSensitive: true }));
  });

  it('POST while one is open returns it instead of filing another', async () => {
    openRequest({ _id: REQ, status: 'in-progress', createdAt: CREATED });
    const res = await postDeletion(json('/api/patients/me/deletion-request', {}));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('in-progress');
    expect(SupportRequest.create).not.toHaveBeenCalled();
  });

  it('rejects an over-long reason', async () => {
    const res = await postDeletion(json('/api/patients/me/deletion-request', { reason: 'x'.repeat(1001) }));
    expect(res.status).toBe(400);
  });
});

describe('eMCR contact support', () => {
  it('files the message with the app context and reply email', async () => {
    const res = await postSupport(
      json('/api/patients/me/support', {
        message: 'My results page will not open.',
        email: 'ana@example.com',
        context: { appVersion: '1.1.6', buildNumber: '42', platform: 'android', osVersion: '15' },
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ reference: 'SR-4390AB' });
    const doc = vi.mocked(SupportRequest.create).mock.calls[0][0] as any;
    expect(doc).toMatchObject({ source: 'patient', category: 'general', email: 'ana@example.com', subject: 'eMCR app: My results page will not open.' });
    expect(doc.kind).toBeUndefined();
    expect(doc.message).toContain('App version: 1.1.6');
    expect(doc.message).toContain('Platform: android');
  });

  it('rejects a too-short message and a bad email', async () => {
    expect((await postSupport(json('/api/patients/me/support', { message: 'help' }))).status).toBe(400);
    expect((await postSupport(json('/api/patients/me/support', { message: 'Long enough message', email: 'nope' }))).status).toBe(400);
  });
});

describe('eMCR app config (version gate)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('sends the configured versions', async () => {
    process.env.EMCR_MIN_VERSION = '1.1.5';
    process.env.EMCR_LATEST_VERSION = '1.1.6';
    const { data } = await (await getAppConfig()).json();
    expect(data).toMatchObject({ minVersion: '1.1.5', latestVersion: '1.1.6' });
    expect(data.androidStoreUrl).toContain('solutions.myclinicsoft.emcr');
  });

  it('a malformed or missing version means no requirement', async () => {
    process.env.EMCR_MIN_VERSION = '1.1.x';
    delete process.env.EMCR_LATEST_VERSION;
    const { data } = await (await getAppConfig()).json();
    expect(data.minVersion).toBeNull();
    expect(data.latestVersion).toBeNull();
  });
});
