import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/models/Survey', () => ({ default: { exists: vi.fn(), create: vi.fn() } }));

import Survey from '@/models/Survey';
import {
  FEEDBACK_WINDOW_MS,
  feedbackExpired,
  feedbackProviderName,
  parseFeedbackInput,
  submitVisitFeedback,
} from '@/lib/visit-feedback';

describe('visit feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Survey.exists).mockResolvedValue(null as any);
  });

  it('requires an overall rating of 1–5 and drops other out-of-range ratings', () => {
    expect(parseFeedbackInput({})).toEqual({ ok: false, error: 'Overall rating (1–5) is required' });
    expect(parseFeedbackInput({ overallRating: 6 }).ok).toBe(false);
    expect(parseFeedbackInput({ overallRating: 4.5 }).ok).toBe(false);
    expect(parseFeedbackInput(null).ok).toBe(false);
    const parsed = parseFeedbackInput({ overallRating: 4, doctorRating: 0, staffRating: 5, comments: '  great  ', wouldRecommend: 1 });
    expect(parsed).toEqual({
      ok: true,
      input: { overallRating: 4, doctorRating: undefined, staffRating: 5, facilityRating: undefined, waitTimeRating: undefined, comments: 'great', wouldRecommend: true },
    });
  });

  it("caps comments at the model's limit and treats blank comments as none", () => {
    const long = parseFeedbackInput({ overallRating: 3, comments: 'x'.repeat(5000) });
    expect(long.ok && long.input.comments?.length).toBe(2000);
    const blank = parseFeedbackInput({ overallRating: 3, comments: '   ' });
    expect(blank.ok && blank.input.comments).toBeUndefined();
  });

  it('takes feedback for 30 days after the visit', () => {
    const now = Date.now();
    expect(feedbackExpired(new Date(now - FEEDBACK_WINDOW_MS + 1000), now)).toBe(false);
    expect(feedbackExpired(new Date(now - FEEDBACK_WINDOW_MS - 1000), now)).toBe(true);
    expect(feedbackExpired(undefined, now)).toBe(true);
  });

  it('names the provider from User.name, without doubling the title', () => {
    expect(feedbackProviderName({ name: 'Maria Santos' })).toBe('Dr. Maria Santos');
    expect(feedbackProviderName({ name: 'Dr. Jose Rizal' })).toBe('Dr. Jose Rizal');
    expect(feedbackProviderName({ firstName: 'Ana', lastName: 'Cruz' })).toBe('Dr. Ana Cruz');
    expect(feedbackProviderName(null)).toBeNull();
    expect(feedbackProviderName({ name: ' ' })).toBeNull();
  });

  it('saves one response per visit', async () => {
    const visit = { _id: 'v1', tenantId: 't1', patient: 'p1' };
    expect(await submitVisitFeedback(visit, { overallRating: 5 }, { ipAddress: '1.2.3.4' })).toBe('created');
    expect(Survey.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', visitId: 'v1', patientId: 'p1', overallRating: 5, ipAddress: '1.2.3.4' })
    );

    vi.mocked(Survey.exists).mockResolvedValue({ _id: 's1' } as any);
    expect(await submitVisitFeedback(visit, { overallRating: 5 })).toBe('duplicate');
    expect(Survey.create).toHaveBeenCalledTimes(1);
  });

  it('a racing duplicate caught by the unique index is a duplicate, other errors throw', async () => {
    vi.mocked(Survey.create).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await submitVisitFeedback({ _id: 'v1' }, { overallRating: 2 })).toBe('duplicate');
    vi.mocked(Survey.create).mockRejectedValueOnce(new Error('down'));
    await expect(submitVisitFeedback({ _id: 'v1' }, { overallRating: 2 })).rejects.toThrow('down');
  });
});
