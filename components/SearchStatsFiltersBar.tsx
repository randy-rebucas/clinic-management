'use client';

import PatientSearchBar from './PatientSearchBar';
import { SortOption } from './types/PatientTypes';

interface SearchStatsFiltersBarProps {
  showStats: boolean;
  onShowStatsChange: (show: boolean) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
  activeFilterCount: number;
}

export default function SearchStatsFiltersBar({
  showStats,
  onShowStatsChange,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  sortBy,
  onSortChange,
  showFilters,
  onShowFiltersChange,
  activeFilterCount,
}: SearchStatsFiltersBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
      {/* Stats Toggle */}
      <button
        type="button"
        onClick={() => onShowStatsChange(!showStats)}
        className={`group inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all flex-shrink-0 text-sm font-medium ${showStats ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'}`}
        title="Toggle Quick Stats"
        aria-label="Toggle quick stats"
        aria-expanded={showStats}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide hidden sm:inline">Stats</span>
        <svg
          className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${showStats ? 'rotate-0' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Search & Sort Bar */}
      <PatientSearchBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        sortBy={sortBy}
        onSortChange={onSortChange}
      />

      {/* Filter Toggle Button */}
      <button
        type="button"
        className={`px-4 py-2.5 rounded-lg transition-all flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
          showFilters || activeFilterCount > 0
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
        }`}
        onClick={() => onShowFiltersChange(!showFilters)}
        aria-label="Toggle filters"
        aria-expanded={showFilters}
      >
        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-bold">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}
