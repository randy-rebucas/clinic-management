'use client';

import { useState } from 'react';
import PatientFilterBar from './PatientFilterBar';
import { PatientSegmentationFilter } from './PatientSegmentationFilter';
import { FilterState } from './types/PatientTypes';

interface PatientFiltersSectionProps {
  showFilters: boolean;
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedSegmentFlags: Record<string, boolean>;
  onFlagsChange: (flags: Record<string, boolean>) => void;
  availableTags: string[];
  onApplySegmentation: () => void;
  onClearSegmentation: () => void;
  showStats: boolean;
}

export default function PatientFiltersSection({
  showFilters,
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
  selectedTags,
  onTagsChange,
  selectedSegmentFlags,
  onFlagsChange,
  availableTags,
  onApplySegmentation,
  onClearSegmentation,
  showStats,
}: PatientFiltersSectionProps) {
  const [showSegmentationFilter, setShowSegmentationFilter] = useState(false);

  return (
    <>
      {/* Global Search Toggle */}
      <div className={`flex items-center gap-2 transition-all duration-200 ${showStats ? 'pt-3 border-t border-gray-100' : ''}`}>
        <input
          id="global-search-toggle"
          type="checkbox"
          checked={filters.global}
          onChange={(e) => {
            onFilterChange({ global: e.target.checked });
          }}
          className="form-checkbox h-4 w-4 text-blue-600 transition-all rounded cursor-pointer"
          aria-label="Search all patients (not just my clinic)"
        />
        <label htmlFor="global-search-toggle" className="text-xs text-gray-700 select-none cursor-pointer font-medium">
          All clinics
        </label>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="pt-4 border-t border-gray-200 space-y-4">
          <PatientFilterBar
            filters={filters}
            onFilterChange={onFilterChange}
            onClearFilters={onClearFilters}
            activeFilterCount={activeFilterCount}
          />

          {/* Segmentation Filter */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 overflow-hidden">
            <button
              onClick={() => setShowSegmentationFilter(!showSegmentationFilter)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-gray-700 hover:bg-blue-100 transition-colors"
              aria-expanded={showSegmentationFilter}
              aria-label="Toggle patient segmentation filters"
            >
              <span className="text-sm">Advanced Segmentation</span>
              <svg
                className={`w-5 h-5 transition-transform text-blue-600 ${showSegmentationFilter ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSegmentationFilter && (
              <div className="p-4 bg-white border-t border-blue-200 space-y-3">
                <PatientSegmentationFilter
                  selectedTags={selectedTags}
                  selectedFlags={selectedSegmentFlags}
                  availableTags={availableTags}
                  onTagsChange={onTagsChange}
                  onFlagsChange={onFlagsChange}
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onApplySegmentation}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    aria-label="Apply segmentation filters"
                  >
                    Apply
                  </button>
                  <button
                    onClick={onClearSegmentation}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                    aria-label="Clear segmentation filters"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
