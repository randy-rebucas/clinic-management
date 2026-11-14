import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  rateLimiters: { auth: {}, repSignupEmail: {} },
}));
vi.mock('@/lib/turnstile', () => ({ turnstileRejection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/models/User', () => ({ default: { exists: vi.fn().mockResolvedValue(null) } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { exists: vi.fn().mockResolvedValue(null) } }));
vi.mock('@/models/RepAppSignup', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/medrep-app-signup', () => ({
  APP_SIGNUP_TTL_MS: 60_000,
  EMAIL_CODE_TTL_MINUTES: 10,
  appSignupUnavailable: () => null,
  newEmailCode: vi.fn(async () => ({ code: '123456', hash: 'h', expiresAt: new Date() })),
  newSignupId: () => ({ id: 'a'.repeat(43), hash: 'x' }),
  sendAlreadyRegisteredEmail: vi.fn(),
  sendSignupEmailCode: vi.fn(async () => true),
}));

import { turnstileRejection } from '@/lib/turnstile';
import { sendSignupEmailCode } from '@/lib/medrep-app-signup';
import RepAppSignup from '@/models/RepAppSignup';
import { POST } from '@/app/api/medical-representatives/onboard/app/start/route';

const valid = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', phone: '09171234567', company: 'Acme' };
const start = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/medical-representatives/onboard/app/start', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /onboard/app/start: Turnstile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(turnstileRejection).mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('checks a token the app sends, and refuses a bad one before storing or emailing anything', async () => {
    vi.mocked(turnstileRejection).mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }));
    expect((await start({ ...valid, turnstileToken: 'bad' })).status).toBe(403);
    expect(vi.mocked(turnstileRejection).mock.calls[0][1]).toBe('bad');
    expect(RepAppSignup.updateOne).not.toHaveBeenCalled();
    expect(sendSignupEmailCode).not.toHaveBeenCalled();
  });

  it('lets an older app build without a token through until REP_APP_TURNSTILE_REQUIRED is set', async () => {
    expect((await start(valid)).status).toBe(200);
    expect(turnstileRejection).not.toHaveBeenCalled();

    vi.stubEnv('REP_APP_TURNSTILE_REQUIRED', 'true');
    vi.mocked(turnstileRejection).mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }));
    expect((await start(valid)).status).toBe(403);
    expect(vi.mocked(turnstileRejection).mock.calls[0][1]).toBeUndefined();
  });

  it('does not spend the token on a form with a bad field', async () => {
    expect((await start({ ...valid, phone: 'x', turnstileToken: 'tok' })).status).toBe(400);
    expect(turnstileRejection).not.toHaveBeenCalled();
  });
});
