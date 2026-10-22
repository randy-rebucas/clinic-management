import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Counter', () => ({ default: { findOne: vi.fn(() => ({ select: () => ({ lean: async () => null }) })) } }));
vi.mock('@/lib/encryption', () => ({
  encryptData: (v: string) => `enc:${v}`,
  decryptData: (v: string) => v.replace(/^enc:/, ''),
}));

const rows = new Map<string, any>();
vi.mock('@/models/PlatformSetting', () => ({
  default: {
    findOne: vi.fn(({ key }: { key: string }) => ({ select: () => ({ lean: async () => rows.get(key) ?? null }) })),
    updateOne: vi.fn(async ({ key }: { key: string }, update: any) => {
      const row = rows.get(key) ?? { data: {}, secrets: {} };
      row.data = update.$set.data;
      for (const [path, value] of Object.entries(update.$set)) if (path.startsWith('secrets.')) row.secrets[path.slice(8)] = value;
      for (const path of Object.keys(update.$unset ?? {})) delete row.secrets[path.slice(8)];
      row.updatedAt = new Date();
      rows.set(key, row);
    }),
  },
}));

import {
  forgetPlatformConfig,
  getBillingIssuer,
  getPaymongoStatus,
  getPlanPricing,
  getPlatformFees,
  getPlatformPaymongoKeys,
  savePlatformSection,
} from '@/lib/platform-config';
import { DEFAULT_PRICING } from '@/lib/subscription-period';

const ENV = { ...process.env };

describe('platform configuration', () => {
  beforeEach(() => {
    rows.clear();
    forgetPlatformConfig();
    delete process.env.PAYMONGO_SECRET_KEY;
    delete process.env.PAYMONGO_WEBHOOK_SECRET;
    delete process.env.MEDREP_ACTIVATION_FEE_PHP;
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('falls back to env values and defaults until a section is saved', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_fromenv1234';
    process.env.MEDREP_ACTIVATION_FEE_PHP = '150';
    expect(await getPlanPricing()).toBe(DEFAULT_PRICING);
    expect(await getPlatformFees()).toMatchObject({ medrepActivationFee: 150, voucherFaceValue: 80, voucherWholesalePrice: 60 });
    expect(await getBillingIssuer()).toBeNull();
    expect(await getPaymongoStatus()).toMatchObject({ configured: true, source: 'env', mode: 'test', secretLast4: '1234' });
  });

  it('uses saved sections over env, and keeps secrets encrypted and out of the status', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_fromenv1234';
    await savePlatformSection('paymongo', {}, 'admin@devcom.ph', { set: { secretKey: 'sk_live_console9999', webhookSecret: 'whsk_abc' } });
    await savePlatformSection('pricing', { monthly: { basic: 999, professional: 2999, enterprise: 7999 }, yearlyMonths: 11 }, 'admin@devcom.ph');

    expect(rows.get('paymongo').secrets.secretKey).toBe('enc:sk_live_console9999');
    expect(await getPlatformPaymongoKeys()).toEqual({ secretKey: 'sk_live_console9999', webhookSecret: 'whsk_abc' });
    const status = await getPaymongoStatus();
    expect(status).toEqual({ configured: true, source: 'console', mode: 'live', secretLast4: '9999', webhookConfigured: true });
    expect(JSON.stringify(status)).not.toContain('sk_live');
    expect((await getPlanPricing()).monthly.basic).toBe(999);
  });

  it('removing the saved keys returns to the env key', async () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_test_fromenv1234';
    await savePlatformSection('paymongo', {}, 'a@b.c', { set: { secretKey: 'sk_live_console9999' } });
    await savePlatformSection('paymongo', {}, 'a@b.c', { unset: ['secretKey', 'webhookSecret'] });
    expect((await getPlatformPaymongoKeys())?.secretKey).toBe('sk_test_fromenv1234');
  });

  it('an invalid saved section is ignored rather than used', async () => {
    await savePlatformSection('pricing', { monthly: { basic: -5 }, yearlyMonths: 99 }, 'a@b.c');
    expect(await getPlanPricing()).toBe(DEFAULT_PRICING);
  });
});
