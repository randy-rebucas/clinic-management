import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), recordPatientRefused: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/HealthSummaryShareLink', () => ({
  default: { countDocuments: vi.fn(), create: vi.fn(), find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/lib/patient-family', () => ({ familyAccess: vi.fn() }));
vi.mock('@/lib/emcr/account', () => ({ accountAccess: vi.fn() }));
vi.mock('@/app/api/patients/me/_lib/linked-records', () => ({
  linkedRecords: vi.fn(async (p: { _id: unknown; tenantIds?: unknown[] }) => ({ patientIds: [p._id], tenantIds: p.tenantIds ?? [], records: [] })),
}));
vi.mock('@/lib/health-summary-pdf', () => ({ renderHealthSummaryPdf: vi.fn() }));

import HealthSummaryShareLink from '@/models/HealthSummaryShareLink';
import Patient from '@/models/Patient';
import { createAuditLog } from '@/lib/audit';
import { consumeRateLimit } from '@/lib/middleware/rate-limit';
import { familyAccess } from '@/lib/patient-family';
import { accountAccess } from '@/lib/emcr/account';
import { renderHealthSummaryPdf } from '@/lib/health-summary-pdf';
import {
  cleanShareLabel,
  createShareLink,
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  logShareLinkEvent,
  MAX_ACTIVE_SHARE_LINKS,
  parseShareLinkInput,
  resolveShareLink,
  revokeShareLink,
  shareLinkStatus,
  toShareLinkView,
  type ShareLinkLean,
} from '@/lib/health-summary-share';
import { GET as openShare } from '@/app/api/share/[token]/route';

const PATIENT = new Types.ObjectId();
const PARENT = new Types.ObjectId();
const ACCOUNT = new Types.ObjectId();
const CLINIC_A = new Types.ObjectId();
const CLINIC_B = new Types.ObjectId();
const NOW = new Date('2026-10-30T00:00:00Z');
const DAY = 86_400_000;

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

function link(overrides: Partial<ShareLinkLean> = {}): ShareLinkLean {
  return {
    _id: new Types.ObjectId(),
    patient: PATIENT,
    label: 'Dr. Santos, cardiology',
    expiresAt: new Date(NOW.getTime() + DAY),
    accessCount: 0,
    createdAt: new Date(NOW.getTime() - DAY),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe('share tokens', () => {
  it('are 256-bit, URL-safe and unique', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isWellFormedShareToken(a)).toBe(true);
  });

  it('are stored only as a hash', () => {
    const token = generateShareToken();
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(token)).not.toContain(token);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
  });

  it('rejects malformed tokens without a lookup', async () => {
    for (const bad of ['', 'short', 'x'.repeat(44), 'a.b', 42, null]) expect(isWellFormedShareToken(bad)).toBe(false);
    expect(await resolveShareLink('../../etc', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(HealthSummaryShareLink.findOne).not.toHaveBeenCalled();
  });
});

describe('input', () => {
  it('accepts only the three durations', () => {
    expect(parseShareLinkInput({ duration: '7d' })).toEqual({ ok: true, value: { duration: '7d' } });
    for (const duration of ['1y', '', undefined, 'toString', '__proto__']) {
      expect(parseShareLinkInput({ duration }).ok).toBe(false);
    }
    expect(parseShareLinkInput(null).ok).toBe(false);
  });

  it('cleans the label to one short line', () => {
    expect(cleanShareLabel('  Dr. Santos,\n cardiology ')).toBe('Dr. Santos, cardiology');
    expect(cleanShareLabel('a'.repeat(200))).toHaveLength(80);
    expect(cleanShareLabel('   ')).toBeUndefined();
    expect(parseShareLinkInput({ duration: '24h', label: 5 }).ok).toBe(false);
  });
});

describe('status', () => {
  it('is revoked, expired or active', () => {
    expect(shareLinkStatus(link(), NOW)).toBe('active');
    expect(shareLinkStatus(link({ expiresAt: NOW }), NOW)).toBe('expired');
    expect(shareLinkStatus(link({ revokedAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('revoked');
  });

  it('views never carry the token hash', () => {
    const view = toShareLinkView({ ...link(), tokenHash: 'secret' } as ShareLinkLean, NOW);
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(view).toMatchObject({ status: 'active', label: 'Dr. Santos, cardiology', accessCount: 0, sharedByFamily: false });
  });
});

describe('createShareLink', () => {
  beforeEach(() => {
    vi.mocked(HealthSummaryShareLink.create).mockImplementation((async (doc: any) => ({ toObject: () => ({ _id: new Types.ObjectId(), createdAt: NOW, ...doc }) })) as any);
  });

  it('stores the hash, the session scope and the chosen expiry', async () => {
    vi.mocked(HealthSummaryShareLink.countDocuments).mockResolvedValue(0 as any);
    const result = await createShareLink({ patientId: String(PATIENT), tid: String(CLINIC_A) }, { duration: '30d', label: 'Dr. S' }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = vi.mocked(HealthSummaryShareLink.create).mock.calls[0][0] as any;
    expect(doc.tokenHash).toBe(hashShareToken(result.token));
    expect(JSON.stringify(doc)).not.toContain(result.token);
    expect(String(doc.tid)).toBe(String(CLINIC_A));
    expect(doc.expiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(doc.sharedBy).toBeUndefined();
    expect(doc.account).toBeUndefined();
  });

  it('records the sharer when made for a family member', async () => {
    vi.mocked(HealthSummaryShareLink.countDocuments).mockResolvedValue(0 as any);
    await createShareLink({ patientId: String(PATIENT), guardianId: String(PARENT), acc: String(ACCOUNT) }, { duration: '24h' }, NOW);
    const doc = vi.mocked(HealthSummaryShareLink.create).mock.calls[0][0] as any;
    expect(String(doc.patient)).toBe(String(PATIENT));
    expect(String(doc.sharedBy)).toBe(String(PARENT));
    expect(String(doc.account)).toBe(String(ACCOUNT));
  });

  it('caps live links per patient', async () => {
    vi.mocked(HealthSummaryShareLink.countDocuments).mockResolvedValue(MAX_ACTIVE_SHARE_LINKS as any);
    expect(await createShareLink({ patientId: String(PATIENT) }, { duration: '24h' }, NOW)).toEqual({ ok: false, reason: 'limit' });
    expect(HealthSummaryShareLink.create).not.toHaveBeenCalled();
    expect(HealthSummaryShareLink.countDocuments).toHaveBeenCalledWith({ patient: PATIENT, revokedAt: null, expiresAt: { $gt: NOW } });
  });
});

describe('revokeShareLink', () => {
  const chain = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

  it('revokes only the patient’s own link', async () => {
    const row = link({ revokedAt: NOW });
    vi.mocked(HealthSummaryShareLink.findOneAndUpdate).mockReturnValue(chain(row) as any);
    expect(await revokeShareLink(String(PATIENT), String(row._id), NOW)).toEqual({ link: row, changed: true });
    expect(HealthSummaryShareLink.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: row._id, patient: PATIENT, revokedAt: null },
      { $set: { revokedAt: NOW } },
      { new: true }
    );
  });

  it('is a no-op twice and 404 for someone else’s link', async () => {
    const row = link({ revokedAt: NOW });
    vi.mocked(HealthSummaryShareLink.findOneAndUpdate).mockReturnValue(chain(null) as any);
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(chain(row) as any).mockReturnValueOnce(chain(null) as any);
    expect(await revokeShareLink(String(PATIENT), String(row._id), NOW)).toEqual({ link: row, changed: false });
    expect(await revokeShareLink(String(PATIENT), String(new Types.ObjectId()), NOW)).toBeNull();
    expect(await revokeShareLink(String(PATIENT), 'nope', NOW)).toBeNull();
  });
});

describe('resolveShareLink', () => {
  const token = generateShareToken();

  it('looks up by hash and refuses revoked and expired links', async () => {
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(null) as any);
    expect(await resolveShareLink(token, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(HealthSummaryShareLink.findOne).toHaveBeenCalledWith({ tokenHash: hashShareToken(token) });

    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link({ revokedAt: NOW })) as any);
    expect(await resolveShareLink(token, NOW)).toEqual({ ok: false, reason: 'revoked' });

    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link({ expiresAt: new Date(NOW.getTime() - 1) })) as any);
    expect(await resolveShareLink(token, NOW)).toEqual({ ok: false, reason: 'expired' });
  });

  it('keeps the clinic scope of the session that shared it', async () => {
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link({ tid: CLINIC_A })) as any);
    expect(await resolveShareLink(token, NOW)).toMatchObject({ ok: true, patientId: String(PATIENT), tid: String(CLINIC_A) });
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link()) as any);
    const open = await resolveShareLink(token, NOW);
    expect(open.ok && open.tid).toBeFalsy();
  });

  it('ends a family member’s link once the sharer no longer manages them', async () => {
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValue(lean(link({ sharedBy: PARENT })) as any);
    vi.mocked(familyAccess).mockResolvedValueOnce(null);
    expect(await resolveShareLink(token, NOW)).toEqual({ ok: false, reason: 'ended' });

    vi.mocked(familyAccess).mockResolvedValueOnce({});
    expect(await resolveShareLink(token, NOW)).toMatchObject({ ok: true });
    expect(familyAccess).toHaveBeenCalledWith(String(PARENT), String(PATIENT));
  });

  it('narrows to a staff-made family link’s clinic', async () => {
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link({ account: ACCOUNT })) as any);
    vi.mocked(accountAccess).mockResolvedValueOnce({ tid: String(CLINIC_B) });
    expect(await resolveShareLink(token, NOW)).toMatchObject({ ok: true, tid: String(CLINIC_B) });

    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValueOnce(lean(link({ account: ACCOUNT, tid: CLINIC_A })) as any);
    vi.mocked(accountAccess).mockResolvedValueOnce({ tid: String(CLINIC_B) });
    expect(await resolveShareLink(token, NOW)).toEqual({ ok: false, reason: 'ended' });
  });
});

describe('audit', () => {
  it('logs creation once per clinic in scope, with the IP', async () => {
    vi.mocked(Patient.findById).mockReturnValue(selectLean({ _id: PATIENT, tenantIds: [CLINIC_A, CLINIC_B] }) as any);
    await logShareLinkEvent({
      event: 'created',
      link: link({ tid: CLINIC_A }),
      session: { patientId: String(PATIENT), email: 'p@x.y' },
      request: new NextRequest('http://localhost/api/patients/me/share-links', { method: 'POST' }),
    });
    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({
      tenantId: CLINIC_A,
      action: 'data_export',
      dataSubject: String(PATIENT),
      ipAddress: '203.0.113.7',
      isSensitive: true,
    });
  });
});

describe('GET /api/share/:token', () => {
  const open = (token: string) => openShare(new NextRequest(`http://localhost/api/share/${token}`), { params: Promise.resolve({ token }) });

  it('serves the PDF privately, counts the open and audits it per clinic', async () => {
    const row = link({ tid: CLINIC_A });
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValue(lean(row) as any);
    vi.mocked(renderHealthSummaryPdf).mockResolvedValue({
      pdf: new Uint8Array([37, 80, 68, 70]),
      filename: 'Health-summary.pdf',
      summary: { clinics: [{ tenantId: String(CLINIC_A), name: 'A', patientCode: null }] } as any,
    });

    const res = await open(generateShareToken());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(renderHealthSummaryPdf).toHaveBeenCalledWith(String(PATIENT), String(CLINIC_A));
    expect(HealthSummaryShareLink.updateOne).toHaveBeenCalledWith({ _id: row._id }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: expect.any(Date) } });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ tenantId: String(CLINIC_A), action: 'download', ipAddress: '203.0.113.7' }));
  });

  it('410 for a revoked link, without rendering or counting', async () => {
    vi.mocked(HealthSummaryShareLink.findOne).mockReturnValue(lean(link({ revokedAt: new Date(Date.now() - 1000) })) as any);
    const res = await open(generateShareToken());
    expect(res.status).toBe(410);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(renderHealthSummaryPdf).not.toHaveBeenCalled();
    expect(HealthSummaryShareLink.updateOne).not.toHaveBeenCalled();
  });

  it('404 for an unknown link and 429 when rate limited', async () => {
    expect((await open('not-a-token')).status).toBe(404);
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false } as any);
    expect((await open(generateShareToken())).status).toBe(429);
  });
});
