import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({ getPlatformFees: vi.fn(), getPlanPricing: vi.fn() }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn() }));
vi.mock('@/models/RepAiUsage', () => ({ default: { updateOne: vi.fn(), findOne: vi.fn() } }));

import RepAiUsage from '@/models/RepAiUsage';
import { manilaMonth, nextMonthStart, reserveAiAction } from '@/lib/rep-ai-usage';
import { composeNotes } from '@/lib/rep-ai';
import type { VisitNoteDraft } from '@/lib/rep-ai-schema';

const USER = new Types.ObjectId();

describe('AI allowance months', () => {
  it('counts months on Manila time', () => {
    // 2026-11-30 17:00 UTC is already December 1 in Manila.
    expect(manilaMonth(new Date('2026-11-30T15:59:00Z'))).toBe('2026-11');
    expect(manilaMonth(new Date('2026-11-30T16:00:00Z'))).toBe('2026-12');
  });

  it('resets on the first of the next month', () => {
    expect(nextMonthStart('2026-11')).toBe('2026-12-01');
    expect(nextMonthStart('2026-12')).toBe('2027-01-01');
  });
});

describe('reserveAiAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes an action while under the limit', async () => {
    vi.mocked(RepAiUsage.updateOne).mockResolvedValue({} as any);
    expect(await reserveAiAction(USER, 20, 'visitNote')).toBe(true);
    const [filter, update, opts] = vi.mocked(RepAiUsage.updateOne).mock.calls[0] as any;
    expect(filter.actions).toEqual({ $lt: 20 });
    expect(update.$inc).toEqual({ actions: 1, 'byFeature.visitNote': 1 });
    expect(opts).toEqual({ upsert: true });
  });

  it('says no when the month is used up (the upsert hits the unique index)', async () => {
    vi.mocked(RepAiUsage.updateOne).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await reserveAiAction(USER, 20, 'visitBrief')).toBe(false);
  });

  it('never calls the database with no allowance', async () => {
    expect(await reserveAiAction(USER, 0, 'visitNote')).toBe(false);
    expect(RepAiUsage.updateOne).not.toHaveBeenCalled();
  });

  it('passes other errors on', async () => {
    vi.mocked(RepAiUsage.updateOne).mockRejectedValue(new Error('down'));
    await expect(reserveAiAction(USER, 20, 'visitNote')).rejects.toThrow('down');
  });
});

describe('composeNotes', () => {
  const draft: VisitNoteDraft = {
    summary: 'Met Dr. Santos. She is open to trying Amoxiclav for adult patients.',
    doctorInterest: 'high',
    products: [
      { catalogNumber: 1, name: 'Amoxiclav 625', reaction: 'asked about price' },
      { catalogNumber: null, name: 'Cefuroxime', reaction: '' },
    ],
    objections: ['Price is higher than the generic'],
    commitments: [
      { by: 'rep', what: 'Bring 10 sample packs' },
      { by: 'clinic', what: 'Try it on a few patients' },
    ],
    followUp: { inDays: 7, action: 'Bring samples' },
    warnings: [],
  };

  it('puts the summary first, then labelled lines', () => {
    expect(composeNotes(draft)).toBe(
      [
        'Met Dr. Santos. She is open to trying Amoxiclav for adult patients.',
        '',
        'Interest: High',
        'Products: Amoxiclav 625 (asked about price); Cefuroxime',
        'Concerns: Price is higher than the generic',
        'I promised: Bring 10 sample packs',
        'Clinic promised: Try it on a few patients',
        'Follow-up: in 7 days, Bring samples',
      ].join('\n')
    );
  });

  it('leaves out what wasn’t said', () => {
    const bare = { ...draft, doctorInterest: 'unclear' as const, products: [], objections: [], commitments: [], followUp: { inDays: null, action: '' } };
    expect(composeNotes(bare)).toBe(draft.summary);
  });

  it('fits the notes limit', () => {
    const long = { ...draft, summary: 'x'.repeat(3000) };
    expect(composeNotes(long, 2000)).toHaveLength(2000);
  });
});
