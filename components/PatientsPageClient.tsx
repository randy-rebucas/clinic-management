'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import PatientExportModal from './PatientExportModal';
import { BulkCommunicationModal } from './BulkCommunicationModal';
import PatientInsights, { PatientInsightsSkeleton, type PatientInsightsData } from './patients/PatientInsights';
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
import { AGE_BANDS, type AgeBand } from '@/lib/patient-age-bands';
import { ApiError, parseApiResponse, formatErrorMessage } from '@/lib/errors';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const FIELD =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

const SEGMENT_FLAGS: { key: string; label: string }[] = [
  { key: 'isVIP', label: 'VIP' },
  { key: 'isHighRisk', label: 'High risk' },
  { key: 'isHighUtilizer', label: 'High utilizer' },
  { key: 'hasRecurringNoShow', label: 'Recurring no-show' },
  { key: 'isPendingVerification', label: 'Pending verification' },
  { key: 'hasOutstandingBalance', label: 'Outstanding balance' },
];

const SORT_LABELS: Record<SortOption, string> = {
  [PATIENT_SORT_OPTIONS.NAME_ASC]: 'Name, A–Z',
  [PATIENT_SORT_OPTIONS.NAME_DESC]: 'Name, Z–A',
  [PATIENT_SORT_OPTIONS.ADDED_DESC]: 'Recently added',
  [PATIENT_SORT_OPTIONS.ADDED_ASC]: 'Oldest records',
  [PATIENT_SORT_OPTIONS.DATE_ASC]: 'Oldest patients',
  [PATIENT_SORT_OPTIONS.DATE_DESC]: 'Youngest patients',
  [PATIENT_SORT_OPTIONS.CODE_ASC]: 'Patient code, ascending',
  [PATIENT_SORT_OPTIONS.CODE_DESC]: 'Patient code, descending',
};

const ROW_GRID =
  'lg:grid lg:grid-cols-[2.25rem_minmax(0,2.3fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_6.75rem] lg:items-center lg:gap-4';

function ageOf(dob: string) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function isThisMonth(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function shortDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Wraps the part of `text` that matches `query` so a search result shows why it matched. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-brand-teal-light px-0.5 text-brand-teal-deep">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function Svg({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const ICON = {
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  filter: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
  plus: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  x: 'M6 18L18 6M6 6l12 12',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  chevL: 'M15 19l-7-7 7-7',
  chevR: 'M9 5l7 7-7 7',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
};

/** 1 … 4 5 6 … 20 */
function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export default function PatientsPageClient() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [insights, setInsights] = useState<PatientInsightsData | null>(null);
  const [insightsVersion, setInsightsVersion] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(PATIENT_SORT_OPTIONS.NAME_ASC);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [reload, setReload] = useState(0);

  const [selected, setSelected] = useState<string[]>([]);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  // --- Data -----------------------------------------------------------------

  useEffect(() => {
    if (searchQuery === debouncedSearch) return;
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/patients/insights')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.success) setInsights(json.data);
      })
      .catch(() => {
        // The roster still works without its summary.
      });
    return () => {
      cancelled = true;
    };
  }, [insightsVersion]);

  // Loading is derived: the list is loading whenever its inputs differ from the last settled request.
  const requestKey = JSON.stringify([debouncedSearch, filters, sortBy, pagination.page, pagination.limit, reload]);
  const loading = settledKey !== requestKey;
  const loaded = settledKey !== null;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const stale = () => requestId !== requestIdRef.current;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
        if (filters.sex !== 'all') params.set('sex', filters.sex);
        if (filters.active !== 'all') params.set('active', filters.active);
        if (filters.minAge) params.set('minAge', filters.minAge);
        if (filters.maxAge) params.set('maxAge', filters.maxAge);
        if (filters.city) params.set('city', filters.city);
        if (filters.state) params.set('state', filters.state);
        if (filters.tags.length) params.set('tags', filters.tags.join(','));
        if (filters.flags.length) params.set('flags', filters.flags.join(','));
        params.set('page', String(pagination.page));
        params.set('limit', String(pagination.limit));
        params.set('sortBy', SORT_MAP[sortBy].sortBy);
        params.set('sortOrder', SORT_MAP[sortBy].sortOrder);

        const res = await fetch(`/api/patients?${params}`);
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const data = await parseApiResponse<Patient[]>(res);
        if (stale()) return;
        if (!data.success || !data.data) throw new ApiError(res.status, data.error || 'Failed to fetch patients');
        setPatients(data.data);
        if (data.pagination) setPagination(data.pagination);
        setError(null);
      } catch (err) {
        if (stale()) return;
        const apiError = err instanceof ApiError ? err : new ApiError(500, 'Unknown error', err);
        console.error('Failed to fetch patients:', apiError);
        setError(formatErrorMessage(apiError));
      } finally {
        if (!stale()) setSettledKey(requestKey);
      }
    }

    load();
    // pagination.page/limit are the only pagination inputs; total/pages come back from the server.
  }, [debouncedSearch, filters, sortBy, pagination.page, pagination.limit, router, reload, requestKey]);

  // Selection is per page: drop ids that left the page.
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selected.length > 0 && selected.length < patients.length;
  }, [selected.length, patients.length]);

  // --- Filters --------------------------------------------------------------

  const updateFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagination((p) => ({ ...p, page: 1 }));
    setSelected([]);
  }, []);

  const activeAge = useMemo(() => {
    const band = AGE_BANDS.find((b) => String(b.min) === filters.minAge && (b.max === null ? filters.maxAge === '' : String(b.max) === filters.maxAge));
    return band?.label ?? null;
  }, [filters.minAge, filters.maxAge]);

  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    if (filters.sex !== 'all') out.push({ key: 'sex', label: filters.sex.charAt(0).toUpperCase() + filters.sex.slice(1), clear: () => updateFilters({ sex: 'all' }) });
    if (filters.active !== 'all') out.push({ key: 'active', label: filters.active === 'true' ? 'Active' : 'Inactive', clear: () => updateFilters({ active: 'all' }) });
    if (filters.minAge || filters.maxAge)
      out.push({
        key: 'age',
        label: activeAge ? `Ages ${activeAge}` : `Ages ${filters.minAge || '0'}–${filters.maxAge || 'any'}`,
        clear: () => updateFilters({ minAge: '', maxAge: '' }),
      });
    if (filters.city) out.push({ key: 'city', label: `City: ${filters.city}`, clear: () => updateFilters({ city: '' }) });
    if (filters.state) out.push({ key: 'state', label: `Province: ${filters.state}`, clear: () => updateFilters({ state: '' }) });
    filters.tags.forEach((t) => out.push({ key: `tag-${t}`, label: `#${t}`, clear: () => updateFilters({ tags: filters.tags.filter((x) => x !== t) }) }));
    filters.flags.forEach((f) =>
      out.push({ key: `flag-${f}`, label: SEGMENT_FLAGS.find((s) => s.key === f)?.label ?? f, clear: () => updateFilters({ flags: filters.flags.filter((x) => x !== f) }) })
    );
    return out;
  }, [filters, activeAge, updateFilters]);

  const clearAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    setDebouncedSearch('');
    setPagination((p) => ({ ...p, page: 1 }));
    setSelected([]);
  }, []);

  const narrowed = chips.length > 0 || debouncedSearch.trim() !== '';

  // --- Actions --------------------------------------------------------------

  const toggleAll = () => setSelected((s) => (s.length === patients.length ? [] : patients.map((p) => p._id)));
  const toggleOne = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleDelete = useCallback(async () => {
    if (!patientToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/patients/${patientToDelete._id}`, { method: 'DELETE' });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await parseApiResponse(res);
      if (!data.success) throw new ApiError(res.status, data.error || 'Failed to delete patient');
      const name = `${patientToDelete.firstName} ${patientToDelete.lastName}`;
      setPatientToDelete(null);
      setSelected((s) => s.filter((x) => x !== patientToDelete._id));
      setNotice(`${name} was deleted.`);
      setTimeout(() => setNotice(null), 4000);
      setReload((n) => n + 1);
      setInsightsVersion((n) => n + 1);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(500, 'Unknown error', err);
      console.error('Failed to delete patient:', apiError);
      setError(formatErrorMessage(apiError));
      setPatientToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  }, [patientToDelete, router]);

  // Selection describes the visible page, so it resets when the page changes.
  const goToPage = (n: number) => {
    setSelected([]);
    setPagination((p) => ({ ...p, page: Math.min(Math.max(1, n), Math.max(1, p.pages)) }));
  };

  const exportIds = selected.length > 0 ? selected : patients.map((p) => p._id);
  const firstRow = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastRow = Math.min(pagination.page * pagination.limit, pagination.total);
  const refreshing = loading && loaded;

  // --- Render -----------------------------------------------------------------

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* Title row */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Patients</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Every patient registered with your clinic.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={patients.length === 0}
              className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Svg d={ICON.download} />
              Export
            </button>
            <Link
              href="/patients/new"
              className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICON.plus} />
              Add patient
            </Link>
          </div>
        </header>

        {/* Roster at a glance: the charts are also filters */}
        {insights ? (
          <PatientInsights
            data={insights}
            activeAge={activeAge}
            activeSex={filters.sex}
            onAgeBand={(band: AgeBand | null) =>
              updateFilters(band ? { minAge: String(band.min), maxAge: band.max === null ? '' : String(band.max) } : { minAge: '', maxAge: '' })
            }
            onSex={(sex) => updateFilters({ sex })}
          />
        ) : (
          !loaded && <PatientInsightsSkeleton />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setDebouncedSearch(searchQuery);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            >
              <label htmlFor="patient-search" className="sr-only">
                Search patients
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICON.search} />
              </span>
              <input
                id="patient-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, patient code, phone, email or city"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="flex gap-2">
              <label htmlFor="patient-sort" className="sr-only">
                Sort patients
              </label>
              <select
                id="patient-sort"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className={`${FIELD} sm:w-52`}
              >
                {Object.values(PATIENT_SORT_OPTIONS).map((v) => (
                  <option key={v} value={v}>
                    {SORT_LABELS[v]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-controls="patient-filters"
                className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                  showFilters ? 'border-brand-teal-dark bg-brand-teal-light text-brand-teal-deep' : 'border-gray-300 bg-white text-gray-900 hover:border-gray-900'
                }`}
              >
                <Svg d={ICON.filter} />
                Filters
                {chips.length > 0 && (
                  <span className="rounded bg-brand-teal-dark px-1.5 py-0.5 font-mono text-xs leading-none text-white">{chips.length}</span>
                )}
              </button>
            </div>
          </div>

          {showFilters && (
            <div id="patient-filters" className="motion-panel-in rounded-lg border border-gray-200 bg-white p-5">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <div>
                  <label htmlFor="f-sex" className="mb-1.5 block text-sm font-medium text-gray-700">Sex</label>
                  <select id="f-sex" value={filters.sex} onChange={(e) => updateFilters({ sex: e.target.value })} className={FIELD}>
                    <option value="all">Any</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-active" className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
                  <select id="f-active" value={filters.active} onChange={(e) => updateFilters({ active: e.target.value })} className={FIELD}>
                    <option value="all">Any</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-min" className="mb-1.5 block text-sm font-medium text-gray-700">Age from</label>
                  <input id="f-min" type="number" min={0} max={150} inputMode="numeric" value={filters.minAge} onChange={(e) => updateFilters({ minAge: e.target.value })} className={`${FIELD} font-mono`} placeholder="0" />
                </div>
                <div>
                  <label htmlFor="f-max" className="mb-1.5 block text-sm font-medium text-gray-700">Age to</label>
                  <input id="f-max" type="number" min={0} max={150} inputMode="numeric" value={filters.maxAge} onChange={(e) => updateFilters({ maxAge: e.target.value })} className={`${FIELD} font-mono`} placeholder="Any" />
                </div>
                <div>
                  <label htmlFor="f-city" className="mb-1.5 block text-sm font-medium text-gray-700">City</label>
                  <input id="f-city" value={filters.city} onChange={(e) => updateFilters({ city: e.target.value })} className={FIELD} placeholder="Any city" />
                </div>
                <div>
                  <label htmlFor="f-state" className="mb-1.5 block text-sm font-medium text-gray-700">Province</label>
                  <input id="f-state" value={filters.state} onChange={(e) => updateFilters({ state: e.target.value })} className={FIELD} placeholder="Any province" />
                </div>
              </div>

              <div className="mt-5 grid gap-5 border-t border-gray-100 pt-5 lg:grid-cols-2">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">Flags <span className="font-normal text-gray-500">· all must apply</span></legend>
                  <div className="flex flex-wrap gap-2">
                    {SEGMENT_FLAGS.map((f) => {
                      const on = filters.flags.includes(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => updateFilters({ flags: on ? filters.flags.filter((x) => x !== f.key) : [...filters.flags, f.key] })}
                          className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${FOCUS_RING} ${
                            on ? 'border-brand-teal-dark bg-brand-teal-light font-semibold text-brand-teal-deep' : 'border-gray-200 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">Tags <span className="font-normal text-gray-500">· any may apply</span></legend>
                  {insights && insights.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {insights.tags.map(({ tag, count }) => {
                        const on = filters.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            aria-pressed={on}
                            onClick={() => updateFilters({ tags: on ? filters.tags.filter((x) => x !== tag) : [...filters.tags, tag] })}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${FOCUS_RING} ${
                              on ? 'border-brand-teal-dark bg-brand-teal-light font-semibold text-brand-teal-deep' : 'border-gray-200 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            #{tag}
                            <span className="font-mono text-xs text-gray-500">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No patients are tagged yet. Add tags from a patient&apos;s record.</p>
                  )}
                </fieldset>
              </div>
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={`motion-chip-in inline-flex items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                >
                  {c.label}
                  <Svg d={ICON.x} className="h-3.5 w-3.5" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-red-800 hover:text-red-900 rounded ${FOCUS_RING}`}
            >
              <Svg d={ICON.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {notice ?? (loaded && !loading ? `${pagination.total} patients${narrowed ? ' match' : ''}.` : '')}
        </p>
        {notice && (
          <div role="status" className="motion-chip-in rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {notice}
          </div>
        )}

        {/* Roster */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={loading}>
          {/* Header row */}
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500 lg:grid`}>
            <span className="flex items-center">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={patients.length > 0 && selected.length === patients.length}
                onChange={toggleAll}
                disabled={patients.length === 0}
                className="h-4 w-4 cursor-pointer rounded accent-brand-teal-dark"
                aria-label="Select every patient on this page"
              />
            </span>
            <span>Patient</span>
            <span>Age · sex</span>
            <span>Contact</span>
            <span>Location</span>
            <span>Added</span>
            <span className="sr-only">Actions</span>
          </div>

          {!loaded ? (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className={`px-4 py-3.5 ${ROW_GRID} flex items-center gap-3`}>
                  <span className="hidden lg:block h-4 w-4 rounded bg-gray-100" />
                  <span className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-md bg-gray-100" />
                    <span className="space-y-1.5">
                      <span className="block h-3.5 w-36 rounded bg-gray-100" />
                      <span className="block h-3 w-20 rounded bg-gray-50" />
                    </span>
                  </span>
                  <span className="hidden lg:block h-3.5 w-16 rounded bg-gray-50" />
                  <span className="hidden lg:block h-3.5 w-32 rounded bg-gray-50" />
                  <span className="hidden lg:block h-3.5 w-24 rounded bg-gray-50" />
                  <span className="hidden lg:block h-3.5 w-20 rounded bg-gray-50" />
                </li>
              ))}
            </ul>
          ) : patients.length === 0 ? (
            <EmptyRoster
              narrowed={narrowed}
              onClear={clearAll}
              query={debouncedSearch}
            />
          ) : (
            <ul key={`${pagination.page}:${debouncedSearch}:${chips.length}`} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {patients.map((p, i) => (
                <PatientRow
                  key={p._id}
                  patient={p}
                  index={i}
                  query={debouncedSearch}
                  selected={selected.includes(p._id)}
                  onToggle={() => toggleOne(p._id)}
                  onOpen={() => router.push(`/patients/${p._id}`)}
                  onDelete={() => setPatientToDelete(p)}
                />
              ))}
            </ul>
          )}

          {/* Footer: count + pagination */}
          {loaded && pagination.total > 0 && (
            <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-mono text-gray-900">
                  {firstRow.toLocaleString('en-US')}–{lastRow.toLocaleString('en-US')}
                </span>{' '}
                of <span className="font-mono text-gray-900">{pagination.total.toLocaleString('en-US')}</span>
                {narrowed ? ' matching patients' : ' patients'}
              </p>
              {pagination.pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(pagination.page - 1)}
                    disabled={pagination.page === 1 || loading}
                    aria-label="Previous page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICON.chevL} />
                  </button>
                  {pageWindow(pagination.page, pagination.pages).map((n, i) =>
                    n === 'gap' ? (
                      <span key={`g${i}`} className="px-1.5 text-gray-400" aria-hidden="true">…</span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => goToPage(n)}
                        disabled={loading}
                        aria-current={pagination.page === n ? 'page' : undefined}
                        aria-label={`Page ${n}`}
                        className={`min-w-9 rounded-md px-2 py-1.5 font-mono text-sm transition-colors ${FOCUS_RING} ${
                          pagination.page === n ? 'bg-brand-teal-dark font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => goToPage(pagination.page + 1)}
                    disabled={pagination.page === pagination.pages || loading}
                    aria-label="Next page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICON.chevR} />
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>

        {/* Selection tray: rises when the list becomes a set you can act on */}
        {selected.length > 0 && (
          <div className="sticky bottom-4 z-20 flex justify-center pointer-events-none">
            <div
              role="region"
              aria-label="Selected patients"
              className="motion-tray-in pointer-events-auto flex items-center gap-1 rounded-lg bg-brand-navy px-2 py-1.5 text-sm text-white shadow-[0_20px_50px_rgb(15,23,42,0.28)]"
            >
              <span className="px-2.5 font-semibold">
                <span className="font-mono">{selected.length}</span> selected
              </span>
              <span className="h-5 w-px bg-white/20" aria-hidden="true" />
              <button type="button" onClick={() => setMessageOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                <Svg d={ICON.mail} />
                Message
              </button>
              <button type="button" onClick={() => setExportOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                <Svg d={ICON.download} />
                Export
              </button>
              <button type="button" onClick={() => setSelected([])} aria-label="Clear selection" className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                <Svg d={ICON.x} />
              </button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={patientToDelete !== null}
        onOpenChange={(open) => !open && !deleteLoading && setPatientToDelete(null)}
        title="Delete this patient?"
        description={
          patientToDelete
            ? `${patientToDelete.firstName} ${patientToDelete.lastName}${patientToDelete.patientCode ? ` (${patientToDelete.patientCode})` : ''} and their record will be removed. This can't be undone.`
            : ''
        }
      >
        <button
          type="button"
          onClick={() => setPatientToDelete(null)}
          disabled={deleteLoading}
          className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}
        >
          Keep patient
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteLoading}
          className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 ${FOCUS_RING}`}
        >
          {deleteLoading ? 'Deleting…' : 'Delete patient'}
        </button>
      </AlertDialog>

      <PatientExportModal open={exportOpen} onOpenChange={setExportOpen} patientIds={exportIds} patientCount={exportIds.length} />
      <BulkCommunicationModal isOpen={messageOpen} onClose={() => setMessageOpen(false)} selectedPatients={selected} />
    </section>
  );
}

function PatientRow({
  patient: p,
  index,
  query,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  patient: Patient;
  index: number;
  query: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const name = `${p.firstName} ${p.lastName}`;
  const age = ageOf(p.dateOfBirth);
  const inactive = p.active === false;
  const fresh = isThisMonth(p.createdAt);
  const place = [p.address?.city, p.address?.state].filter(Boolean).join(', ');
  const initials = `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase();

  // Row click opens the record; clicks on its own controls don't.
  const onRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,label')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group relative cursor-pointer px-4 py-3 transition-colors ${ROW_GRID} flex items-start gap-3 ${
        selected ? 'bg-brand-teal-light/50' : 'hover:bg-gray-50'
      }`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="flex pt-2.5 lg:pt-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 cursor-pointer rounded accent-brand-teal-dark"
          aria-label={`Select ${name}`}
        />
      </span>

      {/* Patient */}
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
            inactive ? 'bg-gray-100 text-gray-500' : 'bg-brand-teal-light text-brand-teal-deep'
          }`}
        >
          {initials}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <Link
              href={`/patients/${p._id}`}
              className={`truncate font-semibold text-gray-900 hover:text-brand-teal-deep rounded ${FOCUS_RING}`}
            >
              <Highlight text={name} query={query} />
            </Link>
            {inactive && <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200">Inactive</span>}
            {fresh && !inactive && (
              <span className="shrink-0 rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal-deep">New</span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-xs text-gray-500">
            {p.patientCode ? <Highlight text={p.patientCode} query={query} /> : 'No code'}
          </span>
          {/* Compact details below lg */}
          <span className="mt-1 block text-sm text-gray-600 lg:hidden">
            {[age !== null ? `${age} yrs` : null, p.sex && p.sex !== 'unknown' ? p.sex : null, p.phone].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>

      <span className="hidden text-sm text-gray-700 lg:block">
        {age !== null ? <span className="font-mono">{age}</span> : <span className="text-gray-400">—</span>}
        {p.sex && p.sex !== 'unknown' && <span className="capitalize text-gray-500"> · {p.sex}</span>}
      </span>

      <span className="hidden min-w-0 text-sm lg:block">
        <span className="block truncate font-mono text-gray-900">{p.phone || '—'}</span>
        {p.email && <span className="block truncate text-gray-500">{p.email}</span>}
      </span>

      <span className="hidden truncate text-sm text-gray-600 lg:block">{place || <span className="text-gray-400">—</span>}</span>

      <span className="hidden font-mono text-sm text-gray-600 lg:block">{shortDate(p.createdAt)}</span>

      {/* Actions */}
      <span className="flex shrink-0 items-center justify-end gap-0.5 lg:opacity-60 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        <RowAction href={`/appointments/new?patientId=${p._id}`} label={`Book an appointment for ${name}`} d={ICON.calendar} />
        <RowAction href={`/patients/${p._id}/edit`} label={`Edit ${name}`} d={ICON.edit} />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${name}`}
          title="Delete"
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
        >
          <Svg d={ICON.trash} />
        </button>
      </span>
    </li>
  );
}

function RowAction({ href, label, d }: { href: string; label: string; d: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}
    >
      <Svg d={d} />
    </Link>
  );
}

function EmptyRoster({ narrowed, onClear, query }: { narrowed: boolean; onClear: () => void; query: string }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">{query ? `No patients match “${query}”` : 'No patients match these filters'}</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by patient code or phone, or loosen a filter.</p>
        <button
          type="button"
          onClick={onClear}
          className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
        >
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No patients yet</p>
        <p className="mt-1 text-sm text-gray-500">Register your first patient, or they can sign up from your public booking page.</p>
        <Link
          href="/patients/new"
          className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
        >
          <Svg d={ICON.plus} />
          Add patient
        </Link>
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICON.search : ICON.users} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
