import { STATE } from '../dashboards/charts';

export type LabStatus = 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';

/**
 * Lab states on the validated state hues by meaning: ordered blue (not started), at the lab
 * amber (under way), results in teal (ready for the doctor). Reviewed is the neutral done
 * state (gray fill + outline); cancelled is an outline. Shared by the list and the result page.
 */
export const LAB_STATE: Record<LabStatus, { label: string; fill: string | null; muted?: boolean; badge: string }> = {
  ordered: { label: 'Ordered', fill: STATE.upcoming.fill, badge: 'bg-white text-gray-700 ring-gray-300' },
  'in-progress': { label: 'At the lab', fill: STATE.pending.fill, badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  completed: { label: 'Results in', fill: STATE.completed.fill, badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  reviewed: { label: 'Reviewed', fill: null, muted: true, badge: 'bg-gray-100 text-gray-700 ring-gray-200' },
  cancelled: { label: 'Cancelled', fill: null, badge: 'bg-white text-gray-600 ring-gray-300' },
};
export const STATUS_ORDER: LabStatus[] = ['ordered', 'in-progress', 'completed', 'reviewed', 'cancelled'];

/** STAT and urgent orders carry a badge; routine ones carry none. */
export const URGENCY_BADGE: Record<string, { label: string; badge: string }> = {
  stat: { label: 'STAT', badge: 'bg-red-50 text-red-800 ring-red-200' },
  urgent: { label: 'Urgent', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
};
