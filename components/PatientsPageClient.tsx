'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SubPageHeader from './SubPageHeader';
import AlertBanner from './sharable/AlertBanner';
import { AlertDialog } from './ui/Modal';
import PatientListItem from './PatientListItem';
import PatientExportModal from './PatientExportModal';
import { BulkCommunicationModal } from './BulkCommunicationModal';
import SearchStatsFiltersBar from './SearchStatsFiltersBar';
import QuickStatsPanel from './QuickStatsPanel';
import PatientFiltersSection from './PatientFiltersSection';
import ResultsInfoPanel from './ResultsInfoPanel';
import {
  Patient,
  SortOption,
  FilterState,
  PaginationState,
  PATIENT_SORT_OPTIONS,
  SORT_MAP,
  DEFAULT_FILTERS,
  DEFAULT_PAGINATION,
} from './types/PatientTypes';
import { ApiError, parseApiResponse, formatErrorMessage } from '@/lib/errors';

export default function PatientsPageClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(PATIENT_SORT_OPTIONS.NAME_ASC);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [bulkCommunicationOpen, setBulkCommunicationOpen] = useState(false);
  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSegmentFlags, setSelectedSegmentFlags] = useState<Record<string, boolean>>({});
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Update indeterminate state for select-all checkbox
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate =
        selectedPatients.length > 0 && selectedPatients.length < patients.length;
    }
  }, [selectedPatients.length, patients.length]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchForm = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Only update debouncedSearchQuery if not already set (prevents double fetch)
    if (debouncedSearchQuery !== searchQuery) {
      setDebouncedSearchQuery(searchQuery);
    }
  }, [debouncedSearchQuery, searchQuery]);

  // Fetch patients when filters or search change
  useEffect(() => {
    fetchPatients();
  }, [debouncedSearchQuery, sortBy, JSON.stringify(filters), pagination.page]);

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim()) {
        params.append('search', debouncedSearchQuery.trim());
      }
      if (filters.sex !== 'all') {
        params.append('sex', filters.sex);
      }
      if (filters.active !== 'all') {
        params.append('active', filters.active);
      }
      if (filters.minAge) {
        params.append('minAge', filters.minAge);
      }
      if (filters.maxAge) {
        params.append('maxAge', filters.maxAge);
      }
      if (filters.city) {
        params.append('city', filters.city);
      }
      if (filters.state) {
        params.append('state', filters.state);
      }
      if (filters.global) {
        params.append('global', 'true');
      }

      // Add pagination params
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());

      // Map sortBy to API format
      const sort = SORT_MAP[sortBy];
      params.append('sortBy', sort.sortBy);
      params.append('sortOrder', sort.sortOrder);

      const res = await fetch(`/api/patients?${params.toString()}`);

      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await parseApiResponse<Patient[]>(res);

      if (data.success && data.data) {
        setPatients(data.data);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        throw new ApiError(res.status, data.error || 'Failed to fetch patients');
      }
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(500, 'Unknown error', err);
      const message = formatErrorMessage(apiError);
      console.error('Failed to fetch patients:', apiError);
      setError(message);
      // Auto-clear error after 5 seconds
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, filters, sortBy, pagination.page, pagination.limit, router]);

  // Patients are already filtered and sorted on the server, apply client-side segmentation filters
  const filteredPatients = useMemo(() => {
    let result = patients;

    // Apply tag filters
    if (selectedTags.length > 0) {
      result = result.filter((p) => {
        const patientTags = (p as any).tags || [];
        return selectedTags.some((tag) => patientTags.includes(tag));
      });
    }

    // Apply segment flag filters (AND logic - all selected flags must be true)
    const activeFlagKeys = Object.keys(selectedSegmentFlags).filter((k) => selectedSegmentFlags[k]);
    if (activeFlagKeys.length > 0) {
      result = result.filter((p) => {
        const flags = (p as any).segmentFlags || {};
        return activeFlagKeys.every((key) => flags[key] === true);
      });
    }

    return result;
  }, [patients, selectedTags, selectedSegmentFlags]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sex !== 'all') count++;
    if (filters.active !== 'all') count++;
    if (filters.minAge) count++;
    if (filters.maxAge) count++;
    if (filters.city) count++;
    if (filters.state) count++;
    if (selectedTags.length > 0) count++;
    if (Object.values(selectedSegmentFlags).some(Boolean)) count++;
    return count;
  }, [filters, selectedTags, selectedSegmentFlags]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setPagination(DEFAULT_PAGINATION);
  }, []);

  // Extract unique tags from all patients
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    patients.forEach((p) => {
      if ((p as any).tags && Array.isArray((p as any).tags)) {
        (p as any).tags.forEach((tag: string) => tags.add(tag));
      }
    });
    return Array.from(tags).sort();
  }, [patients]);

  const handleToggleSelectAll = useCallback(() => {
    if (selectedPatients.length === filteredPatients.length) {
      setSelectedPatients([]);
    } else {
      setSelectedPatients(filteredPatients.map((p) => p._id));
    }
  }, [selectedPatients.length, filteredPatients]);

  const handleTogglePatient = useCallback((patientId: string) => {
    setSelectedPatients((prev) =>
      prev.includes(patientId) ? prev.filter((id) => id !== patientId) : [...prev, patientId]
    );
  }, []);

  const handleApplySegmentationFilters = useCallback(() => {
    // Filter patients based on tags and segment flags
    const newFilters = { ...filters };
    // Pass tags/flags to filter state for server-side filtering (future enhancement)
    // For now, this demonstrates the segmentation UI integration
    console.log('Segmentation filters:', { tags: selectedTags, flags: selectedSegmentFlags });
    // Could extend FilterState to include these fields and refetch
  }, [selectedTags, selectedSegmentFlags, filters]);

  const handleClearSegmentationFilters = useCallback(() => {
    setSelectedTags([]);
    setSelectedSegmentFlags({});
    setSelectedPatients([]);
  }, []);

  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    // Reset to first page when filters change
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleDeleteClick = useCallback((id: string) => {
    setPatientToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!patientToDelete) return;

    try {
      setDeleteLoading(true);
      setError(null);
      const res = await fetch(`/api/patients/${patientToDelete}`, { method: 'DELETE' });

      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await parseApiResponse(res);

      if (data.success) {
        await fetchPatients();
        setDeleteDialogOpen(false);
        setPatientToDelete(null);
        setSuccess('Patient deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new ApiError(res.status, data.error || 'Failed to delete patient');
      }
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(500, 'Unknown error', err);
      const message = formatErrorMessage(apiError);
      console.error('Failed to delete patient:', apiError);
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeleteLoading(false);
    }
  }, [patientToDelete, router, fetchPatients]);

  return (
    <section className="bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <SubPageHeader
            backHref="/dashboard"
            iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            title="Patients"
            subtitle="Manage patient records and information"
            actions={
              <>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setBulkCommunicationOpen(true)}
                    disabled={selectedPatients.length === 0}
                    className="px-3 py-2.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    title={`Send bulk SMS or email (${selectedPatients.length} selected)`}
                    aria-label="Send bulk communications"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden sm:inline">Communicate</span>
                    {selectedPatients.length > 0 && <span className="bg-purple-700 text-white text-xs px-1.5 py-0.5 rounded">+{selectedPatients.length}</span>}
                  </button>
                  <button
                    onClick={() => setExportModalOpen(true)}
                    disabled={patients.length === 0}
                    className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Export patient data"
                    aria-label="Export patients"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8a9 9 0 018.354-8.646M3.646 3.646a9 9 0 1016.708 0M9 5h.01M15 5h.01" />
                    </svg>
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
                <Link
                  href="/patients/new"
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-semibold text-sm inline-flex items-center gap-2 flex-shrink-0"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Add Patient</span>
                  <span className="sm:hidden">Add</span>
                </Link>
              </>
            }
          />
          {/* Alerts */}
          {error && <AlertBanner type="error" message={error} />}
          {success && <AlertBanner type="success" message={success} />}

          {/* Search, Stats and Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
            {/* Search, Stats, and Filter Controls */}
            <SearchStatsFiltersBar
              showStats={showStats}
              onShowStatsChange={setShowStats}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={handleSearchForm}
              sortBy={sortBy}
              onSortChange={setSortBy}
              showFilters={showFilters}
              onShowFiltersChange={setShowFilters}
              activeFilterCount={activeFilterCount}
            />

            {/* Quick Stats Panel */}
            <QuickStatsPanel showStats={showStats} patients={patients} filteredPatients={filteredPatients} />

            {/* Filters Section */}
            <PatientFiltersSection
              showFilters={showFilters}
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              selectedSegmentFlags={selectedSegmentFlags}
              onFlagsChange={setSelectedSegmentFlags}
              availableTags={availableTags}
              onApplySegmentation={handleApplySegmentationFilters}
              onClearSegmentation={handleClearSegmentationFilters}
              showStats={showStats}
            />

            {/* Results Info Panel */}
            <ResultsInfoPanel
              debouncedSearchQuery={debouncedSearchQuery}
              activeFilterCount={activeFilterCount}
              filteredPatients={filteredPatients}
              pagination={pagination}
            />
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <nav aria-label="Pagination" className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 order-2 sm:order-1">
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    disabled={pagination.page === 1 || loading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))}
                    disabled={pagination.page === pagination.pages || loading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    Next →
                  </button>
                </div>

                <div className="flex items-center gap-1 order-1 sm:order-2">
                  {Array.from({ length: Math.min(5, pagination.pages) }).map((_, i) => {
                    const pageNum = pagination.page <= 3 ? i + 1 : pagination.page + i - 2;
                    if (pageNum > pagination.pages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPagination((prev) => ({ ...prev, page: pageNum }))}
                        disabled={loading}
                        className={`w-10 h-10 rounded-lg transition-colors text-sm font-semibold ${
                          pagination.page === pageNum
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                        aria-current={pagination.page === pageNum ? 'page' : undefined}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            </nav>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 mt-4" aria-busy="true" aria-live="polite">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm animate-pulse flex flex-col">
                <div className="p-4 sm:p-6 flex items-center gap-4 justify-between flex-wrap sm:flex-nowrap">
                  {/* Avatar skeleton */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="h-5 bg-gray-200 rounded w-32 mb-1" />
                        <div className="h-4 bg-gray-100 rounded w-16" />
                        <div className="h-4 bg-blue-100 rounded w-12" />
                        <div className="h-4 bg-gray-100 rounded w-10" />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <div className="h-4 bg-gray-100 rounded w-24" />
                        <div className="h-4 bg-gray-100 rounded w-20" />
                        <div className="h-4 bg-gray-100 rounded w-20" />
                        <div className="h-4 bg-gray-100 rounded w-24" />
                      </div>
                    </div>
                  </div>
                  {/* Actions skeleton */}
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                    <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                    <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Patients List */}
        {filteredPatients.length === 0 && patients.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No patients found</h2>
              <p className="text-sm text-gray-600 mb-4">Try adjusting your search or filter criteria.</p>
              <button onClick={() => setSearchQuery('')} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold">
                Clear Search
              </button>
            </div>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No patients found</h2>
              <p className="text-sm text-gray-600 mb-4">Get started by adding your first patient.</p>
              <Link
                href="/patients/new"
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
              >
                Add First Patient
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-4">
            {/* Select All Section */}
            {filteredPatients.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={selectedPatients.length === filteredPatients.length && filteredPatients.length > 0}
                    onChange={handleToggleSelectAll}
                    className="w-5 h-5 rounded cursor-pointer accent-blue-600"
                    aria-label="Select all patients on this page"
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    {selectedPatients.length === 0
                      ? `Select all (${filteredPatients.length})`
                      : `${selectedPatients.length} of ${filteredPatients.length} selected`}
                  </span>
                </label>
                {selectedPatients.length > 0 && (
                  <button
                    onClick={() => setSelectedPatients([])}
                    className="text-xs px-3 py-1.5 text-blue-600 hover:text-blue-700 font-semibold bg-white rounded hover:bg-blue-50 transition-colors"
                    aria-label="Clear selection"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Patient List Items */}
            {filteredPatients.map((patient) => (
              <div key={patient._id} className="group flex items-center gap-3 transition-all">
                <div className="flex-shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={selectedPatients.includes(patient._id)}
                    onChange={() => handleTogglePatient(patient._id)}
                    className="w-5 h-5 rounded cursor-pointer accent-blue-600"
                    aria-label={`Select patient ${patient.firstName} ${patient.lastName}`}
                  />
                </div>
                <div className="flex-1">
                  <PatientListItem
                    patient={patient}
                    onDelete={handleDeleteClick}
                    onClick={() => router.push(`/patients/${patient._id}`)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Patient"
          description="Are you sure you want to delete this patient? This action cannot be undone."
        >
          <button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleteLoading}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteLoading}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </button>
        </AlertDialog>

        {/* Patient Export Modal */}
        <PatientExportModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          patientIds={patients.map((p) => p._id)}
          patientCount={patients.length}
        />

        {/* Bulk Communication Modal */}
        <BulkCommunicationModal
          isOpen={bulkCommunicationOpen}
          onClose={() => setBulkCommunicationOpen(false)}
          selectedPatients={selectedPatients}
        />

      </div>
    </section>
  );
}
