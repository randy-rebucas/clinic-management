import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  rateLimiters: { public: {}, auth: {}, authAccount: {}, emcrClaimDaily: {} },
}));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/MobileDevice', () => ({ default: {} }));
vi.mock('@/app/lib/refresh-tokens', () => ({}));
vi.mock('@/lib/emcr/invite', () => ({
  issueInvite: vi.fn().mockResolvedValue({ code: 'ABCD2345', expiresAt: new Date('2026-11-12') }),
  formatInviteCode: (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`,
  inviteLink: (c: string) => `https://example.test/i/${c}`,
}));
vi.mock('@/app/api/patients/auth/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/patients/auth/shared')>();
  return {
    ...actual,
    issuePatientLoginQr: vi.fn().mockResolvedValue({ qrData: '{"type":"patient_login","token":"t"}', expiresAt: new Date() }),
    revokePatientLoginQr: vi.fn(),
  };
});
vi.mock('@/app/api/patients/auth/self-qr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/patients/auth/self-qr')>();
  return { ...actual, eligibleRecord: vi.fn(), recentVisitEvents: vi.fn() };
});

import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { issueInvite } from '@/lib/emcr/invite';
import { issuePatientLoginQr, revokePatientLoginQr } from '@/app/api/patients/auth/shared';
import { createSelfQrTicket, eligibleRecord, recentVisitEvents } from '@/app/api/patients/auth/self-qr';
import { POST as issue } from '@/app/api/patients/self-qr/issue/route';
import { POST as revoke } from '@/app/api/patients/self-qr/revoke/route';

const PHONE = '+639171234567';
const DOCTOR = new Types.ObjectId().toString();
const TENANT = new Types.ObjectId();
const record = {
  _id: new Types.ObjectId(),
  firstName: 'Ana',
  lastName: 'Santos',
  phone: '09171234567',
  dateOfBirth: new Date('1990-05-06T00:00:00Z'),
  patientCode: 'C-0007',
  tenantIds: [TENANT],
};
const answers = {
  firstName: 'Ana',
  lastName: 'Santos',
  dateOfBirth: '1990-05-06',
  patientCode: 'C-0007',
  lastVisitDate: '2026-10-20',
  doctorId: DOCTOR,
};

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/patients/self-qr/issue', () => {
  const ticket = () => createSelfQrTicket(PHONE).token;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eligibleRecord).mockResolvedValue(record as any);
    vi.mocked(recentVisitEvents).mockResolvedValue([{ date: new Date('2026-10-20T02:00:00Z'), providerId: DOCTOR }]);
  });

  it('issues a 90-second sign-in QR with no clinic scope when every answer matches', async () => {
    const res = await issue(req('/api/patients/self-qr/issue', { ticket: ticket(), patientId: String(record._id), kind: 'login', answers }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.qrData).toContain('patient_login');
    expect(issuePatientLoginQr).toHaveBeenCalledWith(record._id, { ttlSeconds: 90 });
    expect(applyAuthRateLimits).toHaveBeenCalledWith(expect.anything(), `selfqr-answers:${record._id}`);
  });

  it('gives one generic error for any wrong answer', async () => {
    const res = await issue(
      req('/api/patients/self-qr/issue', { ticket: ticket(), patientId: String(record._id), kind: 'login', answers: { ...answers, doctorId: new Types.ObjectId().toString() } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('NO_MATCH');
    expect(issuePatientLoginQr).not.toHaveBeenCalled();
  });

  it('refuses a person the ticket does not reach', async () => {
    vi.mocked(eligibleRecord).mockResolvedValue(null);
    const res = await issue(req('/api/patients/self-qr/issue', { ticket: ticket(), patientId: String(record._id), kind: 'login', answers }));
    expect(res.status).toBe(403);
  });

  it('refuses a bad ticket', async () => {
    const res = await issue(req('/api/patients/self-qr/issue', { ticket: 'x.y', patientId: String(record._id), kind: 'login', answers }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('TICKET_EXPIRED');
  });

  it('issues an invite on the proven phone at the record’s clinic', async () => {
    const res = await issue(req('/api/patients/self-qr/issue', { ticket: ticket(), patientId: String(record._id), kind: 'invite', answers }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.code).toBe('ABCD-2345');
    expect(issueInvite).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, mode: 'self', channel: 'print', patientId: record._id, tenantId: TENANT })
    );
  });
});

describe('POST /api/patients/self-qr/revoke', () => {
  it('clears the QR of an eligible person', async () => {
    vi.mocked(eligibleRecord).mockResolvedValue(record as any);
    const res = await revoke(req('/api/patients/self-qr/revoke', { ticket: createSelfQrTicket(PHONE).token, patientId: String(record._id) }));
    expect(res.status).toBe(200);
    expect(revokePatientLoginQr).toHaveBeenCalledWith(record._id);
  });
});
