import Survey from '@/models/Survey';

/**
 * Post-visit feedback ("How was your visit?"), shared by the public token link sent by SMS/email
 * (app/api/feedback/[token]) and the patient app (app/api/patients/me/visits/[id]/feedback).
 * One response per visit: the Survey collection's unique `visitId` index enforces it.
 */

/** Feedback is taken for this long after the visit. */
export const FEEDBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** True when a visit is too old (or undated) to take feedback for. */
export function feedbackExpired(visitDate: Date | string | undefined | null, now = Date.now()): boolean {
  return !visitDate || now - new Date(visitDate).getTime() > FEEDBACK_WINDOW_MS;
}

/** "Dr. Maria Santos" from a populated provider (User stores `name`; older rows first/last). */
export function feedbackProviderName(provider: unknown): string | null {
  if (!provider || typeof provider !== 'object') return null;
  const p = provider as { name?: unknown; firstName?: unknown; lastName?: unknown };
  const name =
    typeof p.name === 'string' && p.name.trim()
      ? p.name.trim()
      : [p.firstName, p.lastName].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim();
  if (!name) return null;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

export type FeedbackInput = {
  overallRating: number;
  doctorRating?: number;
  staffRating?: number;
  facilityRating?: number;
  waitTimeRating?: number;
  comments?: string;
  wouldRecommend?: boolean;
};

/** Matches the Survey model's `comments` maxlength. */
export const FEEDBACK_COMMENTS_MAX = 2000;

const rating = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : undefined);

/**
 * A submitted form, validated: ratings are integers 1–5 (others dropped), the overall rating is
 * required, comments are trimmed and capped.
 */
export function parseFeedbackInput(body: unknown): { ok: true; input: FeedbackInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const overallRating = rating(b.overallRating);
  if (!overallRating) return { ok: false, error: 'Overall rating (1–5) is required' };
  const comments = typeof b.comments === 'string' ? b.comments.trim().slice(0, FEEDBACK_COMMENTS_MAX) : '';
  return {
    ok: true,
    input: {
      overallRating,
      doctorRating: rating(b.doctorRating),
      staffRating: rating(b.staffRating),
      facilityRating: rating(b.facilityRating),
      waitTimeRating: rating(b.waitTimeRating),
      comments: comments || undefined,
      wouldRecommend: b.wouldRecommend !== undefined && b.wouldRecommend !== null ? Boolean(b.wouldRecommend) : undefined,
    },
  };
}

/** Whether feedback was already given for this visit. */
export async function feedbackSubmitted(visitId: unknown): Promise<boolean> {
  return !!(await Survey.exists({ visitId }));
}

/**
 * Save the feedback for a visit. `duplicate` when the visit already has a response (checked
 * first, and again by the unique index when two submissions race).
 */
export async function submitVisitFeedback(
  visit: { _id: unknown; tenantId?: unknown; patient?: unknown },
  input: FeedbackInput,
  meta: { ipAddress?: string } = {}
): Promise<'created' | 'duplicate'> {
  if (await feedbackSubmitted(visit._id)) return 'duplicate';
  try {
    await Survey.create({
      tenantId: visit.tenantId,
      visitId: visit._id,
      patientId: visit.patient,
      ...input,
      submittedAt: new Date(),
      ipAddress: meta.ipAddress,
    });
    return 'created';
  } catch (error: any) {
    if (error?.code === 11000) return 'duplicate';
    throw error;
  }
}
