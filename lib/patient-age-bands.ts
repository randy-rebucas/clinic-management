/** Age bands shared by the patient insights endpoint and the patients list's age filter (inclusive years). */
export const AGE_BANDS = [
  { label: '0–12', min: 0, max: 12 },
  { label: '13–17', min: 13, max: 17 },
  { label: '18–25', min: 18, max: 25 },
  { label: '26–35', min: 26, max: 35 },
  { label: '36–45', min: 36, max: 45 },
  { label: '46–55', min: 46, max: 55 },
  { label: '56–65', min: 56, max: 65 },
  { label: '66+', min: 66, max: null },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number];

/** Segment flags a list can filter on; mirrors `segmentFlags` on the Patient model. */
export const SEGMENT_FLAG_KEYS = [
  'isVIP',
  'isHighRisk',
  'isHighUtilizer',
  'hasRecurringNoShow',
  'isPendingVerification',
  'hasOutstandingBalance',
] as const;
