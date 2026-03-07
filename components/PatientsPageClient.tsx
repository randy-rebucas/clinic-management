'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';

interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: string;
  address?: {
    city?: string;
    state?: string;
  };
}

type SortOption = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc' | 'code-asc' | 'code-desc';

export default function PatientsPageClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [filters, setFilters] = useState({
    sex: 'all',
    active: 'all',
    minAge: '',
    maxAge: '',
    city: '',
    state: '',
    global: false, // new filter: search all patients (not just under tenant)
  });
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Prevent page refresh on search submit
  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Only update debouncedSearchQuery if not already set (prevents double fetch)
    if (debouncedSearchQuery !== searchQuery) {
      setDebouncedSearchQuery(searchQuery);
    }
  };

  // Fetch patients when filters or search change
  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, sortBy, JSON.stringify(filters)]);

  const fetchPatients = async () => {
    try {
      setLoading(true);

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

      // Map sortBy to API format
      const sortMap: Record<SortOption, { sortBy: string; sortOrder: string }> = {
        'name-asc': { sortBy: 'name', sortOrder: 'asc' },
        'name-desc': { sortBy: 'name', sortOrder: 'desc' },
        'date-asc': { sortBy: 'dateOfBirth', sortOrder: 'asc' },
        'date-desc': { sortBy: 'dateOfBirth', sortOrder: 'desc' },
        'code-asc': { sortBy: 'patientCode', sortOrder: 'asc' },
        'code-desc': { sortBy: 'patientCode', sortOrder: 'desc' },
      };
      const sort = sortMap[sortBy];
      params.append('sortBy', sort.sortBy);
      params.append('sortOrder', sort.sortOrder);

      const res = await fetch(`/api/patients?${params.toString()}`);

      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      if (data.success) {
        setPatients(data.data);
      } else {
        console.error('Failed to fetch patients:', data.error);
        setError(data.error || 'Failed to fetch patients');
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
      setError('Failed to fetch patients');
    } finally {
      setLoading(false);
    }
  };

  // Patients are already filtered and sorted on the server
  const filteredPatients = patients;

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sex !== 'all') count++;
    if (filters.active !== 'all') count++;
    if (filters.minAge) count++;
    if (filters.maxAge) count++;
    if (filters.city) count++;
    if (filters.state) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      sex: 'all',
      active: 'all',
      minAge: '',
      maxAge: '',
      city: '',
      state: '',
      global: false,
    });
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  const handleDeleteClick = (id: string) => {
    setPatientToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!patientToDelete) return;

    try {
      const res = await fetch(`/api/patients/${patientToDelete}`, { method: 'DELETE' });

      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        setError('Failed to delete patient: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (data.success) {
        fetchPatients();
        setDeleteDialogOpen(false);
        setPatientToDelete(null);
        setSuccess('Patient deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to delete patient:', error);
      setError('Failed to delete patient');
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-md p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-md p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-blue-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Patients</h1>
                  <p className="text-xs text-gray-500">Manage patient records and information</p>
                </div>
              </div>
              <Link
                href="/patients/new"
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Patient
              </Link>
            </div>
          </div>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-sm font-semibold text-gray-900">{patients.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Showing</p>
                <p className="text-sm font-semibold text-gray-900">{filteredPatients.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">This Month</p>
                <p className="text-sm font-semibold text-gray-900">
                  {patients.filter((p) => {
                    const created = new Date((p as any).createdAt || 0);
                    const now = new Date();
                    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                  }).length}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Active</p>
                <p className="text-sm font-semibold text-gray-900">
                  {patients.filter((p) => (p as any).active !== false).length}
                </p>
              </div>
            </div>
          </div>
          {/* Search, Sort & Filter Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <form onSubmit={handleSearchForm} className="flex flex-col sm:flex-row gap-3">
              {/* Search Input */}
              <div className="flex-1 min-w-0">
                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <label htmlFor="patient-search" className="sr-only">Search patients</label>
                  <input
                    id="patient-search"
                    name="patient-search"
                    type="text"
                    placeholder="Search by name, email, phone, code, or location..."
                    value={searchQuery}
                    onChange={handleSearchInput}
                    onKeyDown={e => { if (e.key === 'Escape') setSearchQuery(''); }}
                    autoFocus
                    aria-label="Search patients"
                    autoComplete="off"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                  {searchQuery && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearchQuery('')}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
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
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white min-w-[160px]"
              >
                <option value="name-asc">Name (A–Z)</option>
                <option value="name-desc">Name (Z–A)</option>
                <option value="date-desc">DOB (Newest)</option>
                <option value="date-asc">DOB (Oldest)</option>
                <option value="code-asc">Code (A–Z)</option>
                <option value="code-desc">Code (Z–A)</option>
              </select>
              {/* Filter Toggle Button */}
              <button
                type="button"
                className={`px-3 py-2.5 rounded-lg transition-all flex items-center gap-1.5 text-sm font-medium flex-shrink-0 ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-white/25 text-xs rounded-full font-bold leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </form>

            {/* Global Search Toggle */}
            <div className="flex items-center gap-2 mt-3">
              <input
                id="global-search-toggle"
                type="checkbox"
                checked={filters.global}
                onChange={e => {
                  setFilters(f => ({ ...f, global: e.target.checked }));
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="global-search-toggle" className="text-xs text-gray-500 select-none cursor-pointer">
                Search all patients (not just my clinic)
              </label>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label htmlFor="filter-sex" className="block text-xs font-medium text-gray-600 mb-1.5">Sex</label>
                    <select
                      id="filter-sex"
                      value={filters.sex}
                      onChange={(e) => setFilters({ ...filters, sex: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="all">All</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filter-active" className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                    <select
                      id="filter-active"
                      value={filters.active}
                      onChange={(e) => setFilters({ ...filters, active: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="all">All</option>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filter-min-age" className="block text-xs font-medium text-gray-600 mb-1.5">Min Age</label>
                    <input
                      id="filter-min-age"
                      type="number"
                      placeholder="e.g. 18"
                      value={filters.minAge}
                      onChange={(e) => setFilters({ ...filters, minAge: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-max-age" className="block text-xs font-medium text-gray-600 mb-1.5">Max Age</label>
                    <input
                      id="filter-max-age"
                      type="number"
                      placeholder="e.g. 60"
                      value={filters.maxAge}
                      onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-city" className="block text-xs font-medium text-gray-600 mb-1.5">City</label>
                    <input
                      id="filter-city"
                      type="text"
                      placeholder="City"
                      value={filters.city}
                      onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-state" className="block text-xs font-medium text-gray-600 mb-1.5">State</label>
                    <input
                      id="filter-state"
                      type="text"
                      placeholder="State"
                      value={filters.state}
                      onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <div className="flex justify-end mt-3">
                    <button
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium"
                      onClick={clearFilters}
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Results count */}
            {(debouncedSearchQuery || activeFilterCount > 0) && !loading && (
              <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                <span className="font-semibold text-gray-700">{filteredPatients.length}</span> {filteredPatients.length === 1 ? 'patient' : 'patients'} found
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 mt-2" aria-busy="true" aria-live="polite">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 animate-pulse">
                <div className="p-4 flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="h-4 bg-gray-200 rounded w-36" />
                        <div className="h-4 bg-gray-100 rounded w-16" />
                        <div className="h-4 bg-gray-100 rounded w-10" />
                      </div>
                      <div className="flex gap-4">
                        <div className="h-3 bg-gray-100 rounded w-28" />
                        <div className="h-3 bg-gray-100 rounded w-20" />
                        <div className="h-3 bg-gray-100 rounded w-20" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                    <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                    <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                    <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        
        {/* Patients List */}
        {filteredPatients.length === 0 && patients.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 mt-2">
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-xl mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">No patients found</h2>
              <p className="text-xs text-gray-500 mb-4">Try adjusting your search or filters.</p>
              <button onClick={() => setSearchQuery('')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">
                Clear Search
              </button>
            </div>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 mt-2">
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-50 rounded-xl mb-3">
                <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">No patients yet</h2>
              <p className="text-xs text-gray-500 mb-4">Get started by adding your first patient.</p>
              <Link
                href="/patients/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium inline-block"
              >
                Add First Patient
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {filteredPatients.map((patient) => {
              const age = Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              return (
                <div
                  key={patient._id}
                  className="bg-white rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                  onClick={() => router.push(`/patients/${patient._id}`)}
                >
                  <div className="p-4">
                    <div className="flex items-center gap-3 justify-between">
                      {/* Patient Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">
                              {patient.firstName} {patient.lastName}
                            </span>
                            {patient.patientCode && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">
                                {patient.patientCode}
                              </span>
                            )}
                            {patient.sex && patient.sex !== 'unknown' && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded font-medium capitalize">
                                {patient.sex}
                              </span>
                            )}
                            {age > 0 && (
                              <span className="text-xs text-gray-500">{age} yrs</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {patient.email}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {patient.phone}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(patient.dateOfBirth).toLocaleDateString()}
                            </span>
                            {patient.address && (patient.address.city || patient.address.state) && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {[patient.address.city, patient.address.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/patients/${patient._id}`} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors" title="View">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <Link href={`/appointments/new?patientId=${patient._id}`} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors" title="New Appointment">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </Link>
                        <Link href={`/patients/${patient._id}/edit`} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(patient._id)}
                          className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-red-50 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-md"
          >
            Delete
          </button>
        </AlertDialog>

      </div>
    </section>
  );
}
