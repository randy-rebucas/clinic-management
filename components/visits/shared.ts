export type VisitStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export const STATUS_LABEL: Record<VisitStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const STATUS_BADGE: Record<VisitStatus, string> = {
  draft: 'bg-amber-50 text-amber-800 ring-amber-200',
  open: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30',
  closed: 'bg-gray-100 text-gray-700 ring-gray-200',
  cancelled: 'bg-white text-gray-600 ring-gray-300',
};

export { VISIT_TYPES, visitTypeLabel } from '@/lib/visit-types';
