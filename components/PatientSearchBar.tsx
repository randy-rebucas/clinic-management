'use client';

import { SortOption, PATIENT_SORT_OPTIONS } from './types/PatientTypes';

interface PatientSearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
}

export default function PatientSearchBar({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  sortBy,
  onSortChange,
}: PatientSearchBarProps) {
  return (
    <form onSubmit={onSearchSubmit} className="flex flex-col sm:flex-row gap-3">
      {/* Search Input */}
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <label htmlFor="patient-search" className="sr-only">
            Search patients
          </label>
          <input
            id="patient-search"
            name="patient-search"
            type="text"
            placeholder="Search by name, email, phone, code, or location..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchChange('');
              }
            }}
            autoFocus
            aria-label="Search patients"
            autoComplete="off"
            className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
          {searchQuery && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
              <button
                type="button"
                aria-label="Clear search"
                tabIndex={0}
                onClick={() => onSearchChange('')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSearchChange('');
                  }
                }}
                className="cursor-pointer p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sort Dropdown */}
      <div style={{ minWidth: '180px' }}>
        <label htmlFor="patient-sort" className="sr-only">
          Sort patients
        </label>
        <select
          id="patient-sort"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          aria-label="Sort patients by"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium bg-white"
        >
          <option value={PATIENT_SORT_OPTIONS.NAME_ASC}>Name (A-Z)</option>
          <option value={PATIENT_SORT_OPTIONS.NAME_DESC}>Name (Z-A)</option>
          <option value={PATIENT_SORT_OPTIONS.DATE_DESC}>Date of Birth (Newest)</option>
          <option value={PATIENT_SORT_OPTIONS.DATE_ASC}>Date of Birth (Oldest)</option>
          <option value={PATIENT_SORT_OPTIONS.CODE_ASC}>Patient Code (A-Z)</option>
          <option value={PATIENT_SORT_OPTIONS.CODE_DESC}>Patient Code (Z-A)</option>
        </select>
      </div>
    </form>
  );
}
