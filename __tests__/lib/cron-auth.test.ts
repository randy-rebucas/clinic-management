import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireCron, isAuthorizedCronRequest, safeEqual } from '@/lib/cron-auth';

const SECRET = 'test-cron-secret-0123456789abcdef';

const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/cron/daily-reports', { headers });

describe('requireCron', () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('rejects a request without an Authorization header', () => {
    expect(requireCron(req())?.status).toBe(401);
  });

  it('rejects a wrong bearer token', () => {
    expect(requireCron(req({ authorization: 'Bearer wrong' }))?.status).toBe(401);
    expect(requireCron(req({ authorization: `Bearer ${SECRET}x` }))?.status).toBe(401);
    expect(requireCron(req({ authorization: SECRET }))?.status).toBe(401);
  });

  it('does not trust the x-vercel-cron header on its own', () => {
    expect(requireCron(req({ 'x-vercel-cron': '1' }))?.status).toBe(401);
  });

  it('accepts the correct bearer token', () => {
    expect(requireCron(req({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it('rejects everything when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(req({ authorization: 'Bearer ' }))).toBe(false);
    expect(isAuthorizedCronRequest(req({ authorization: 'Bearer undefined' }))).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares strings of equal and unequal length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
