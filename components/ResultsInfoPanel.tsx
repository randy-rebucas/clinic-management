'use client';

import { PaginationState, Patient } from './types/PatientTypes';

interface ResultsInfoPanelProps {
  debouncedSearchQuery: string;
  activeFilterCount: number;
  filteredPatients: Patient[];
  pagination: PaginationState;
}

export default function ResultsInfoPanel({
  debouncedSearchQuery,
  activeFilterCount,
  filteredPatients,
  pagination,
}: ResultsInfoPanelProps) {
  // Don't show if no search, no filters, and pagination limit not exceeded
  if (!debouncedSearchQuery && activeFilterCount === 0 && pagination.total <= pagination.limit) {
    return null;
  }

  return (
    <div className="pt-3 border-t border-gray-200 space-y-2 text-sm text-gray-600">
      {(debouncedSearchQuery || activeFilterCount > 0) && (
        <p className="font-medium text-gray-700">
          Found <span className="font-bold text-gray-900">{filteredPatients.length}</span>{' '}
          {filteredPatients.length === 1 ? 'patient' : 'patients'}
        </p>
      )}
      {pagination.total > pagination.limit && (
        <p className="text-xs text-gray-600">
          Page <span className="font-semibold">{pagination.page}</span> of{' '}
          <span className="font-semibold">{pagination.pages}</span> • Showing{' '}
          <span className="font-semibold">{(pagination.page - 1) * pagination.limit + 1}</span>-
          <span className="font-semibold">
            {Math.min(pagination.page * pagination.limit, pagination.total)}
          </span>{' '}
          of <span className="font-semibold">{pagination.total}</span>
        </p>
      )}
    </div>
  );
}
