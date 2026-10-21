import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/EmcrAccount', () => ({ default: {} }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn() }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToPatientDevices: vi.fn() }));
vi.mock('@/lib/emcr/account', () => ({ accountSessionSubject: vi.fn() }));

import { dueRenewalStep } from '@/lib/automations/emcr-renewal';

const NOW = new Date('2026-10-21T00:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);

describe('dueRenewalStep', () => {
  it('stays quiet more than 30 days out', () => {
    expect(dueRenewalStep(inDays(45), [], NOW)).toBeNull();
  });

  it('reminds 30 days out, once', () => {
    expect(dueRenewalStep(inDays(30), [], NOW)).toBe(30);
    expect(dueRenewalStep(inDays(25), ['30'], NOW)).toBeNull();
  });

  it('moves to the 7-day reminder, even if the 30-day one was missed', () => {
    expect(dueRenewalStep(inDays(7), ['30'], NOW)).toBe(7);
    expect(dueRenewalStep(inDays(5), [], NOW)).toBe(7);
  });

  it('sends the expiry notice on the day and for a week after, then stops', () => {
    expect(dueRenewalStep(inDays(0), ['30', '7'], NOW)).toBe(0);
    expect(dueRenewalStep(inDays(-3), ['30', '7'], NOW)).toBe(0);
    expect(dueRenewalStep(inDays(-3), ['30', '7', '0'], NOW)).toBeNull();
    expect(dueRenewalStep(inDays(-8), [], NOW)).toBeNull();
  });
});
