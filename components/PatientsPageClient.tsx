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

  // --- Autocomplete State ---
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Patient[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);

  // --- Autocomplete Logic ---
  useEffect(() => {
    if (!searchQuery) {
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
      setAutocompleteIndex(-1);
      return;
    }
    // Suggest from patients list (local, fast)
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
      setAutocompleteIndex(-1);
      return;
    }
    // Match by name, email, code (limit 8)
    const suggestions = patients.filter((p: Patient) => {
      return (
        (p.firstName && p.firstName.toLowerCase().includes(q)) ||
        (p.lastName && p.lastName.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.patientCode && p.patientCode.toLowerCase().includes(q))
      );
    }).slice(0, 8);
    setAutocompleteSuggestions(suggestions);
    setShowAutocomplete(suggestions.length > 0);
    setAutocompleteIndex(suggestions.length > 0 ? 0 : -1);
  }, [searchQuery, patients]);

  // --- Autocomplete Select Handler ---
  // Only navigate on Enter, not on click
  function handleAutocompleteSelect(suggestion: Patient, navigate: boolean = false) {
    setSearchQuery(suggestion.firstName + ' ' + suggestion.lastName);
    setShowAutocomplete(false);
    setAutocompleteSuggestions([]);
    setAutocompleteIndex(-1);
    if (navigate && suggestion._id) {
      router.push(`/patients/${suggestion._id}`);
    }
  }

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

  // if (loading) {
  //   return (
  //     <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen" aria-busy="true" aria-live="polite">
  //       <div className="max-w-7xl mx-auto">
  //         <div className="flex flex-col items-center gap-4" style={{ minHeight: '50vh', justifyContent: 'center' }}>
  //           <div className="relative">
  //             <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600" aria-label="Loading spinner"></div>
  //           </div>
  //           <p className="text-gray-600 font-medium">Loading patients...</p>
  //         </div>
  //       </div>
  //     </section>
  //   );
  // }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Patients</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage patient records and information</p>
                </div>
              </div>
              <Link
                href="/patients/new"
                className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-semibold text-sm inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Patient
              </Link>
            </div>
          </div>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Patients</p>
                <div className="p-2 bg-blue-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-blue-700">{patients.length}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Showing</p>
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-purple-700">{filteredPatients.length}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">This Month</p>
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-emerald-700">
                {patients.filter((p) => {
                  const created = new Date((p as any).createdAt || 0);
                  const now = new Date();
                  return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                }).length}
              </p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Active</p>
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-amber-700">
                {patients.filter((p) => (p as any).active !== false).length}
              </p>
            </div>
          </div>
          {/* Search and Filter Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <form onSubmit={handleSearchForm} className={`flex flex-col sm:flex-row gap-4 ${debouncedSearchQuery || activeFilterCount > 0 ? "mb-4" : "mb-0"}`}>
              {/* Search Input */}
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                      }
                      // Keyboard navigation for autocomplete
                      if (autocompleteSuggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setAutocompleteIndex(i => Math.min(i + 1, autocompleteSuggestions.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setAutocompleteIndex(i => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter' && autocompleteIndex >= 0) {
                          e.preventDefault();
                          handleAutocompleteSelect(autocompleteSuggestions[autocompleteIndex], true);
                        }
                      }
                    }}
                    autoFocus
                    aria-label="Search patients"
                    autoComplete="off"
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    onBlur={() => setTimeout(() => setShowAutocomplete(false), 100)}
                    onFocus={() => {
                      if (autocompleteSuggestions.length > 0) setShowAutocomplete(true);
                    }}
                  />
                  {searchQuery && (
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                      <button
                        type="button"
                        aria-label="Clear search"
                        tabIndex={0}
                        onClick={() => setSearchQuery('')}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSearchQuery('');
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
                  {/* Autocomplete Dropdown */}
                  {showAutocomplete && autocompleteSuggestions.length > 0 && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto animate-in fade-in text-sm" role="listbox">
                      {autocompleteSuggestions.map((s, idx) => (
                        <li
                          key={s._id}
                          role="option"
                          aria-selected={autocompleteIndex === idx}
                          className={`px-4 py-2 cursor-pointer hover:bg-blue-50 ${autocompleteIndex === idx ? 'bg-blue-100 text-blue-900 font-semibold' : ''}`}
                          onMouseDown={e => { e.preventDefault(); handleAutocompleteSelect(s, false); }}
                          onMouseEnter={() => setAutocompleteIndex(idx)}
                        >
                          <span className="font-bold">{s.firstName} {s.lastName}</span>
                          {s.patientCode && (
                            <span className="ml-2 text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5">{s.patientCode}</span>
                          )}
                          {s.email && (
                            <span className="ml-2 text-xs text-gray-500">{s.email}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {/* Sort Dropdown */}
              <div style={{ minWidth: '180px' }}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-medium bg-white"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="date-desc">Date of Birth (Newest)</option>
                  <option value="date-asc">Date of Birth (Oldest)</option>
                  <option value="code-asc">Patient Code (A-Z)</option>
                  <option value="code-desc">Patient Code (Z-A)</option>
                </select>
              </div>
              {/* Filter Toggle Button */}
              <button
                className={`px-4 py-3 rounded-lg transition-all flex items-center font-semibold text-sm ${showFilters || activeFilterCount > 0
                  ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-white/20 text-white text-xs rounded-full font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </form>

          </div>

          {/* Global Search Toggle */}
          <div className="flex items-center gap-2">
            <input
              id="global-search-toggle"
              type="checkbox"
              checked={filters.global}
              onChange={e => {
                setFilters(f => ({ ...f, global: e.target.checked }));
                // When toggling global, also clear search to avoid confusion
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              className="form-checkbox h-4 w-4 text-blue-600 transition-all"
            />
            <label htmlFor="global-search-toggle" className="text-xs text-gray-700 select-none cursor-pointer">
              Search all patients (not just my clinic)
            </label>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="pt-4 pb-4 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {/* Sex Filter */}
                <div>
                  <label htmlFor="filter-sex" className="block text-xs font-semibold text-gray-700 mb-2">Sex</label>
                  <select
                    id="filter-sex"
                    name="sex"
                    value={filters.sex}
                    onChange={(e) => setFilters({ ...filters, sex: e.target.value })}
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
                  <label htmlFor="filter-active" className="block text-xs font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    id="filter-active"
                    name="active"
                    value={filters.active}
                    onChange={(e) => setFilters({ ...filters, active: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                {/* Age Range Filters */}
                <div>
                  <label htmlFor="filter-min-age" className="block text-xs font-semibold text-gray-700 mb-2">Min Age</label>
                  <input
                    id="filter-min-age"
                    name="minAge"
                    type="number"
                    placeholder="Min"
                    value={filters.minAge}
                    onChange={(e) => setFilters({ ...filters, minAge: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="filter-max-age" className="block text-xs font-semibold text-gray-700 mb-2">Max Age</label>
                  <input
                    id="filter-max-age"
                    name="maxAge"
                    type="number"
                    placeholder="Max"
                    value={filters.maxAge}
                    onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>

                {/* City Filter */}
                <div>
                  <label htmlFor="filter-city" className="block text-xs font-semibold text-gray-700 mb-2">City</label>
                  <input
                    id="filter-city"
                    name="city"
                    type="text"
                    placeholder="City"
                    value={filters.city}
                    onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>

                {/* State Filter */}
                <div>
                  <label htmlFor="filter-state" className="block text-xs font-semibold text-gray-700 mb-2">State</label>
                  <input
                    id="filter-state"
                    name="state"
                    type="text"
                    placeholder="State"
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>

              {/* Clear Filters Button */}
              {activeFilterCount > 0 && (
                <div className="flex justify-end mt-4">
                  <button
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Results Count */}
          {(debouncedSearchQuery || activeFilterCount > 0) && (
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700">
                Found <span className="font-bold text-gray-900">{filteredPatients.length}</span> {filteredPatients.length === 1 ? 'patient' : 'patients'}
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600" aria-label="Loading spinner"></div>
            <span className="ml-4 text-gray-600 font-medium">Loading patients...</span>
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
            {filteredPatients.map((patient) => {
              const age = Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              return (
                <div key={patient._id} className="bg-white rounded-xl border border-gray-200 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all" onClick={() => router.push(`/patients/${patient._id}`)}>
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center gap-4 justify-between flex-wrap sm:flex-nowrap">
                      {/* Patient Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-md">
                          {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-lg font-bold text-gray-900">
                              {patient.firstName} {patient.lastName}
                            </span>
                            {patient.patientCode && (
                              <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-semibold">
                                {patient.patientCode}
                              </span>
                            )}
                            {patient.sex && patient.sex !== 'unknown' && (
                              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-semibold capitalize">
                                {patient.sex}
                              </span>
                            )}
                            {age > 0 && (
                              <span className="text-sm font-medium text-gray-600">
                                {age} years
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {patient.email}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {patient.phone}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(patient.dateOfBirth).toLocaleDateString()}
                            </span>
                            {patient.address && (patient.address.city || patient.address.state) && (
                              <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <div className="flex gap-2 items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/patients/${patient._id}`} className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors" title="View">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <Link href={`/appointments/new?patientId=${patient._id}`} className="p-2.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors" title="New Appointment">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </Link>
                        <Link
                          href={`/patients/${patient._id}/edit`}
                          className="p-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(patient._id)}
                          className="p-2.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
