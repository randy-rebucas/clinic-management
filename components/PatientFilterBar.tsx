'use client';

import { FilterState, DEFAULT_FILTERS } from './types/PatientTypes';

interface PatientFilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

export default function PatientFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
}: PatientFilterBarProps) {
  return (
    <div className="pt-4 pb-4 border-t border-gray-200 mt-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Sex Filter */}
        <div>
          <label htmlFor="filter-sex" className="block text-xs font-semibold text-gray-700 mb-2">
            Sex
          </label>
          <select
            id="filter-sex"
            name="sex"
            value={filters.sex}
            onChange={(e) => onFilterChange({ sex: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Active Status Filter */}
        <div>
          <label htmlFor="filter-active" className="block text-xs font-semibold text-gray-700 mb-2">
            Status
          </label>
          <select
            id="filter-active"
            name="active"
            value={filters.active}
            onChange={(e) => onFilterChange({ active: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {/* Age Range Filters */}
        <div>
          <label htmlFor="filter-min-age" className="block text-xs font-semibold text-gray-700 mb-2">
            Min Age
          </label>
          <input
            id="filter-min-age"
            name="minAge"
            type="number"
            placeholder="Min"
            value={filters.minAge}
            onChange={(e) => onFilterChange({ minAge: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
        </div>
        <div>
          <label htmlFor="filter-max-age" className="block text-xs font-semibold text-gray-700 mb-2">
            Max Age
          </label>
          <input
            id="filter-max-age"
            name="maxAge"
            type="number"
            placeholder="Max"
            value={filters.maxAge}
            onChange={(e) => onFilterChange({ maxAge: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
        </div>

        {/* City Filter */}
        <div>
          <label htmlFor="filter-city" className="block text-xs font-semibold text-gray-700 mb-2">
            City
          </label>
          <input
            id="filter-city"
            name="city"
            type="text"
            placeholder="City"
            value={filters.city}
            onChange={(e) => onFilterChange({ city: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
        </div>

        {/* State Filter */}
        <div>
          <label htmlFor="filter-state" className="block text-xs font-semibold text-gray-700 mb-2">
            State
          </label>
          <input
            id="filter-state"
            name="state"
            type="text"
            placeholder="State"
            value={filters.state}
            onChange={(e) => onFilterChange({ state: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
        </div>
      </div>

      {/* Clear Filters Button */}
      {activeFilterCount > 0 && (
        <div className="flex justify-end mt-4">
          <button
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
            onClick={onClearFilters}
            type="button"
            aria-label="Clear all filters"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
