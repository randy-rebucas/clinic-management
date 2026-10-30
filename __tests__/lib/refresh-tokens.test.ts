import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/RefreshToken', () => ({
  default: {
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

import RefreshToken from '@/models/RefreshToken';
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  readRefreshTokenFromBody,
  REFRESH_REUSE_GRACE_MS,
} from '@/app/lib/refresh-tokens';

const SUBJECT = '507f1f77bcf86cd799439033';
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

describe('refresh tokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores only a hash of the issued token, in the given family', async () => {
    const token = await issueRefreshToken('patient', SUBJECT, 3, 'fam-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = vi.mocked(RefreshToken.create).mock.calls[0][0] as any;
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(token);
    expect(row).toMatchObject({ family: 'fam-1', subjectType: 'patient', sessionVersion: 3 });
    expect(String(row.subjectId)).toBe(SUBJECT);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('starts a new family when none is given', async () => {
    await issueRefreshToken('user', SUBJECT, 0);
    await issueRefreshToken('user', SUBJECT, 0);
    const [a, b] = vi.mocked(RefreshToken.create).mock.calls.map((c) => (c[0] as any).family);
    expect(a).not.toBe(b);
  });

  it('rejects malformed tokens without touching the database', async () => {
    expect(await consumeRefreshToken('short', 'patient')).toEqual({ ok: false, code: 'REFRESH_INVALID' });
    expect(await consumeRefreshToken(undefined, 'patient')).toEqual({ ok: false, code: 'REFRESH_INVALID' });
    expect(RefreshToken.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('spends an unused, unexpired token exactly once', async () => {
    const token = 'a'.repeat(43);
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(
      lean({ subjectId: SUBJECT, sessionVersion: 2, family: 'fam-1' }) as any
    );
    const result = await consumeRefreshToken(token, 'patient');
    expect(result).toEqual({ ok: true, value: { subjectId: SUBJECT, sessionVersion: 2, family: 'fam-1' } });
    const [filter, update] = vi.mocked(RefreshToken.findOneAndUpdate).mock.calls[0] as any[];
    expect(filter).toMatchObject({ subjectType: 'patient', usedAt: null, revokedAt: null });
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
    expect(update.$set.usedAt).toBeInstanceOf(Date);
  });

  it('revokes the whole family when a spent token is presented again', async () => {
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(lean(null) as any);
    vi.mocked(RefreshToken.findOne).mockReturnValue(selectLean({ family: 'fam-9' }) as any);
    const result = await consumeRefreshToken('b'.repeat(43), 'user');
    expect(result).toEqual({ ok: false, code: 'REFRESH_REUSED' });
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { family: 'fam-9', revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  it('lets a spent token rotate again within the grace period, cancelling the unused successor', async () => {
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(lean(null) as any);
    vi.mocked(RefreshToken.findOne).mockReturnValue(
      selectLean({
        family: 'fam-7',
        subjectId: SUBJECT,
        sessionVersion: 4,
        usedAt: new Date(Date.now() - 5_000),
        expiresAt: new Date(Date.now() + 86_400_000),
      }) as any
    );
    const result = await consumeRefreshToken('d'.repeat(43), 'patient');
    expect(result).toEqual({ ok: true, value: { subjectId: SUBJECT, sessionVersion: 4, family: 'fam-7' } });
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { family: 'fam-7', usedAt: null, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  it('treats a replay after the grace period, or of a revoked token, as reuse', async () => {
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(lean(null) as any);
    const base = { family: 'fam-8', subjectId: SUBJECT, expiresAt: new Date(Date.now() + 86_400_000) };
    for (const spent of [
      { ...base, usedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000) },
      { ...base, usedAt: new Date(Date.now() - 1_000), revokedAt: new Date() },
    ]) {
      vi.mocked(RefreshToken.updateMany).mockClear();
      vi.mocked(RefreshToken.findOne).mockReturnValue(selectLean(spent) as any);
      expect(await consumeRefreshToken('e'.repeat(43), 'patient')).toEqual({ ok: false, code: 'REFRESH_REUSED' });
      expect(RefreshToken.updateMany).toHaveBeenCalledWith(
        { family: 'fam-8', revokedAt: null },
        { $set: { revokedAt: expect.any(Date) } }
      );
    }
  });

  it('reports unknown or expired tokens as invalid without revoking anything', async () => {
    vi.mocked(RefreshToken.findOneAndUpdate).mockReturnValue(lean(null) as any);
    vi.mocked(RefreshToken.findOne).mockReturnValue(selectLean(null) as any);
    expect(await consumeRefreshToken('c'.repeat(43), 'patient')).toEqual({ ok: false, code: 'REFRESH_INVALID' });
    expect(RefreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('sign-out revokes the token family', async () => {
    vi.mocked(RefreshToken.findOne).mockReturnValue(selectLean({ family: 'fam-2' }) as any);
    await revokeRefreshToken('d'.repeat(43), 'patient');
    expect((vi.mocked(RefreshToken.findOne).mock.calls[0][0] as any).subjectType).toBe('patient');
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { family: 'fam-2', revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  it('reads an optional refreshToken from a request body', async () => {
    const withBody = new Request('http://x', { method: 'DELETE', body: JSON.stringify({ refreshToken: 'r' }) });
    expect(await readRefreshTokenFromBody(withBody)).toBe('r');
    expect(await readRefreshTokenFromBody(new Request('http://x', { method: 'DELETE' }))).toBeUndefined();
    const junk = new Request('http://x', { method: 'DELETE', body: 'not json' });
    expect(await readRefreshTokenFromBody(junk)).toBeUndefined();
  });
});
