'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PrescriptionForm from './PrescriptionForm';
import { Modal } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, TableTwin, TipRow, useTooltip } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { medicinesDispensed, type DispenseItem } from '@/lib/prescription-dispense';
import type { PrescriptionsPageContext } from '@/lib/prescriptions-page';
import { RX_STATE, STATUS_ORDER, type RxStatus } from './prescriptions/shared';

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  prescribedBy?: { _id: string; name: string } | null;
  visit?: { _id: string; visitCode: string } | null;
  medications: { name: string; dose?: string; frequency?: string; durationDays?: number; quantity?: number }[];
  status: RxStatus;
  issuedAt: string;
  pharmacyDispenses?: { pharmacyName?: string; dispensedAt?: string; quantityDispensed?: number; items?: DispenseItem[] }[];
}

interface Insights {
  today: string;
  status: Partial<Record<RxStatus, number>>;
  days: { date: string; issued: number }[];
  medicines: { name: string; count: number }[];
}

interface FormPatient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  weight?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 20;


const ROW_GRID =
  'lg:grid lg:grid-cols-[6.5rem_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_9rem_4.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  pill: 'M10.5 20.5l10-10a4.95 4.95 0 10-7-7l-10 10a4.95 4.95 0 107 7zM8.5 8.5l7 7',
};

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', opts);

function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const nums = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export default function PrescriptionsPageClient({ canWrite, isDoctor, providerName }: PrescriptionsPageContext) {
  const router = useRouter();
  const [mine, setMine] = useState(isDoctor);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<RxStatus | 'waiting' | ''>('');
  const [medicine, setMedicine] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState<string | null>(null);
  const [formPatients, setFormPatients] = useState<FormPatient[]>([]);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // The form's patient picker searches on the server (20 best matches).
  useEffect(() => {
    if (!showForm) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({ limit: '20' });
      if (patientQuery?.trim()) params.set('search', patientQuery.trim());
      fetch(`/api/patients?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => json?.success && setFormPatients(json.data))
        .catch(() => {});
    }, patientQuery ? 300 : 0);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [patientQuery, showForm]);

  // --- Data -----------------------------------------------------------------

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (mine) params.set('mine', 'true');
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status) params.set('status', status);
  if (medicine) params.set('medication', medicine);
  const listUrl = `/api/prescriptions?${params}`;
  const list = useKeyedFetch<Prescription[]>(listUrl);
  const insights = useKeyedFetch<Insights>(`/api/prescriptions/insights${mine ? '?mine=true' : ''}`);

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  const reloadList = list.reload;
  const reloadInsights = insights.reload;

  // --- Filters --------------------------------------------------------------

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: status === 'waiting' ? 'Waiting to be dispensed' : RX_STATE[status].label, clear: () => (setStatus(''), setPage(1)) });
  if (medicine) chips.push({ key: 'med', label: medicine, clear: () => (setMedicine(null), setPage(1)) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setMedicine(null);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  // --- Create -----------------------------------------------------------------

  const openForm = () => {
    setFormError(null);
    setPatientQuery(null);
    setFormKey((k) => k + 1);
    setShowForm(true);
  };

  const handleSubmit = useCallback(
    async (formData: unknown) => {
      setFormError(null);
      try {
        const res = await fetch('/api/prescriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          setFormError(formatApiError(data, 'The prescription could not be saved'));
          return;
        }
        setShowForm(false);
        setNotice(data.data?.prescriptionCode ? `Prescription ${data.data.prescriptionCode} was issued.` : 'The prescription was issued.');
        reloadList();
        reloadInsights();
      } catch {
        setFormError('The prescription could not be saved. Check your connection and try again.');
      }
    },
    [router, reloadList, reloadInsights]
  );

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Prescriptions</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Issued prescriptions and what has been dispensed.</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Whose prescriptions" className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
              {[
                { on: !mine, label: 'Whole clinic', set: false },
                { on: mine, label: 'Mine', set: true },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={o.on}
                  onClick={() => {
                    setMine(o.set);
                    setPage(1);
                  }}
                  className={`rounded px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${FOCUS_RING} ${o.on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={openForm}
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.plus} />
                New prescription
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}

        {insights.value ? (
          <RxInsights
            data={insights.value}
            mine={mine}
            status={status}
            medicine={medicine}
            onStatus={(s) => {
              setStatus((cur) => (cur === s ? '' : s));
              setPage(1);
            }}
            onMedicine={(m) => {
              setMedicine((cur) => (cur?.toLowerCase() === m.toLowerCase() ? null : m));
              setPage(1);
            }}
          />
        ) : insights.error ? null : (
          <div className="h-[220px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setDebounced(search);
                setPage(1);
              }}
            >
              <label htmlFor="rx-search" className="sr-only">
                Search prescriptions
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="rx-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, prescription code or medicine"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <label htmlFor="rx-status" className="sr-only">
              Status
            </label>
            <select
              id="rx-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as RxStatus | 'waiting' | '');
                setPage(1);
              }}
              className={`${FIELD} sm:w-52`}
            >
              <option value="">Any status</option>
              <option value="waiting">Waiting to be dispensed</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {RX_STATE[s].label}
                </option>
              ))}
            </select>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={`motion-chip-in inline-flex max-w-full items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                >
                  <span className="truncate">{c.label}</span>
                  <Svg d={ICONS.x} className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {list.error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">The prescriptions didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} prescriptions${narrowed ? ' match' : ''}.` : ''}
        </p>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Issued</span>
            <span>Patient</span>
            <span>Medicines</span>
            <span>Prescriber</span>
            <span>Dispensing</span>
            <span className="sr-only">Actions</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="h-8 w-20 rounded bg-gray-100" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-40 rounded bg-gray-100" />
                      <span className="block h-3 w-24 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3.5 w-48 rounded bg-gray-50 lg:block" />
                    <span className="h-5 w-24 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} mine={mine} canWrite={canWrite} onClear={clearAll} onWholeClinic={() => (setMine(false), setPage(1))} onNew={openForm} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((rx, i) => (
                <RxRow key={rx._id} rx={rx} index={i} onOpen={() => router.push(`/prescriptions/${rx._id}`)} />
              ))}
            </ul>
          )}

          {loaded && total > 0 && (
            <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-mono text-gray-900">
                  {firstRow.toLocaleString('en-US')}–{lastRow.toLocaleString('en-US')}
                </span>{' '}
                of <span className="font-mono text-gray-900">{total.toLocaleString('en-US')}</span>
                {narrowed ? ' matching prescriptions' : mine ? ' of your prescriptions' : ' prescriptions'}
              </p>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || list.loading}
                    aria-label="Previous page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevL} />
                  </button>
                  {pageWindow(page, pages).map((n, i) =>
                    n === 'gap' ? (
                      <span key={`g${i}`} className="px-1.5 text-gray-400" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        disabled={list.loading}
                        aria-current={page === n ? 'page' : undefined}
                        aria-label={`Page ${n}`}
                        className={`min-w-9 rounded-md px-2 py-1.5 font-mono text-sm transition-colors ${FOCUS_RING} ${page === n ? 'bg-brand-teal-dark font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages || list.loading}
                    aria-label="Next page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevR} />
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>
      </div>

      {canWrite && (
        <Modal open={showForm} onOpenChange={(open) => !open && setShowForm(false)} className="max-w-6xl" ariaLabel="New prescription">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">New prescription</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Signed as <span className="font-semibold text-gray-900">{providerName}</span>. Interactions are checked before you issue it.
            </p>
          </div>
          <div className="px-6 py-5">
            {formError && (
              <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{formError}</p>
              </div>
            )}
            <PrescriptionForm key={formKey} patients={formPatients} onSubmit={handleSubmit} onCancel={() => setShowForm(false)} providerName={providerName} onPatientSearch={setPatientQuery} />
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function RxRow({ rx, index, onOpen }: { rx: Prescription; index: number; onOpen: () => void }) {
  const name = rx.patient ? `${rx.patient.firstName} ${rx.patient.lastName}` : 'Patient record unavailable';
  const cancelled = rx.status === 'cancelled';
  const st = RX_STATE[rx.status] ?? RX_STATE.active;
  const progress = medicinesDispensed(rx.medications, rx.pharmacyDispenses);
  const lastPharmacy = rx.pharmacyDispenses?.[rx.pharmacyDispenses.length - 1]?.pharmacyName;

  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="font-mono text-sm font-medium tabular-nums text-gray-900">{dayFmt(rx.issuedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span>

      <span className="min-w-0">
        <Link href={`/prescriptions/${rx._id}`} className={`block truncate rounded font-semibold hover:text-brand-teal-deep ${cancelled ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'} ${FOCUS_RING}`}>
          {name}
        </Link>
        <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
          {rx.prescriptionCode}
          {rx.patient?.patientCode ? ` · ${rx.patient.patientCode}` : ''}
        </span>
      </span>

      <span className="min-w-0 text-sm">
        {rx.medications.slice(0, 2).map((m, i) => (
          <span key={i} className="block truncate text-gray-800">
            {m.name}
            {m.dose && <span className="text-gray-500"> {m.dose}</span>}
            {m.frequency && <span className="text-gray-500"> · {m.frequency}</span>}
          </span>
        ))}
        {rx.medications.length > 2 && <span className="block text-xs text-gray-500">+{rx.medications.length - 2} more</span>}
      </span>

      <span className="truncate text-sm text-gray-700">{rx.prescribedBy?.name ?? <span className="text-gray-400">Not recorded</span>}</span>

      <span className="min-w-0">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
        {!cancelled && progress.total > 0 && rx.status !== 'completed' && (
          <span className="mt-1 block text-xs text-gray-500" title={lastPharmacy ? `Last dispensed by ${lastPharmacy}` : undefined}>
            <span className="font-mono">{progress.done}</span> of <span className="font-mono">{progress.total}</span> medicine{progress.total === 1 ? '' : 's'} given
          </span>
        )}
      </span>

      <span className="flex items-center justify-end gap-0.5">
        <a
          href={`/api/prescriptions/${rx._id}/print`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Print prescription ${rx.prescriptionCode} (opens in a new tab)`}
          title="Print"
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.print} />
        </a>
        <span className="hidden text-gray-400 transition-colors group-hover:text-gray-700 lg:inline" aria-hidden="true">
          <Svg d={ICONS.chevR} />
        </span>
      </span>
    </li>
  );
}

function RxInsights({
  data,
  mine,
  status,
  medicine,
  onStatus,
  onMedicine,
}: {
  data: Insights;
  mine: boolean;
  status: RxStatus | 'waiting' | '';
  medicine: string | null;
  onStatus: (s: RxStatus | 'waiting') => void;
  onMedicine: (m: string) => void;
}) {
  const tip = useTooltip();
  const waiting = (data.status.active || 0) + (data.status['partially-dispensed'] || 0);
  const statusTotal = STATUS_ORDER.reduce((s, k) => s + (data.status[k] || 0), 0);
  const issued = data.days.reduce((s, d) => s + d.issued, 0);
  const dayMax = Math.max(1, ...data.days.map((d) => d.issued));
  const medMax = Math.max(1, ...data.medicines.map((m) => m.count));
  const present = STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[1fr_1.25fr_1.25fr]">
        {/* Waiting + status */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="rx-status-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="rx-status-h" className="text-sm text-gray-600">
              Waiting to be dispensed
            </h2>
            {waiting > 0 && (
              <button
                type="button"
                aria-pressed={status === 'waiting'}
                onClick={() => onStatus('waiting')}
                className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}
              >
                {status === 'waiting' ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${waiting ? 'text-gray-900' : 'text-gray-500'}`}>{waiting.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            of {statusTotal.toLocaleString('en-US')} {mine ? 'you issued' : 'issued'}
          </p>
          {statusTotal > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {present.map((k, i) => (
                  <span
                    key={k}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${RX_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{ flexGrow: data.status[k], flexBasis: 0, background: RX_STATE[k].fill ?? (RX_STATE[k].muted ? '#E5E7EB' : '#FFFFFF'), opacity: status && status !== 'waiting' && status !== k ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {present.map((k) => {
                  const on = status === k;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onStatus(k)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 rounded-sm ${RX_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`}
                            style={{ background: RX_STATE[k].fill ?? (RX_STATE[k].muted ? '#E5E7EB' : '#FFFFFF') }}
                          />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{RX_STATE[k].label}</span>
                        </span>
                        <span className="font-mono tabular-nums text-gray-900">{(data.status[k] || 0).toLocaleString('en-US')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Issued per day */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="rx-days-h">
          <h2 id="rx-days-h" className="text-sm text-gray-600">
            Issued, last 30 days
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{issued.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono">{(issued / 30).toFixed(1)}</span> a day on average
          </p>
          <div className="mt-4 flex h-20 items-end gap-[2px]" role="img" aria-label={`Prescriptions issued per day over the last 30 days, ${issued} in all. Use View as table for each day.`}>
            {data.days.map((d, i) => {
              const today = d.date === data.today;
              return (
                <span
                  key={d.date}
                  className="motion-col-grow flex-1 rounded-t-[2px]"
                  style={{
                    height: `${d.issued > 0 ? Math.max(6, (d.issued / dayMax) * 100) : 3}%`,
                    background: d.issued > 0 ? (today ? '#0A7F7E' : SERIES.teal) : '#E5E7EB',
                    animationDelay: `${Math.min(240, i * 8)}ms`,
                  }}
                  onPointerEnter={(e) => tip.showFor(e.currentTarget, <TipRow color={SERIES.teal} kind="bar" label={dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }) + (today ? ' · today' : '')} value={d.issued} />)}
                  onPointerLeave={tip.hide}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-xs text-gray-500">
            <span>{dayFmt(data.days[0].date, { month: 'short', day: 'numeric' })}</span>
            <span className="font-semibold text-gray-900">Today</span>
          </div>
        </section>

        {/* Most prescribed */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="rx-meds-h">
          <h2 id="rx-meds-h" className="text-sm text-gray-600">
            Most prescribed, last 90 days
          </h2>
          {data.medicines.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No prescriptions in the last 90 days.</p>
          ) : (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by medicine">
              {data.medicines.map((m, i) => {
                const on = medicine?.toLowerCase() === m.name.toLowerCase();
                return (
                  <li key={m.name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onMedicine(m.name)}
                      aria-label={`${m.name}: on ${m.count} prescriptions${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{m.name}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{m.count}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span
                          className="motion-bar-grow block h-full rounded-r"
                          style={{ width: `${(m.count / medMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: medicine && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <TableTwin
        caption="Prescriptions issued per day, last 30 days"
        head={['Day', 'Issued']}
        rows={data.days.map((d) => [dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), d.issued])}
      />
      {tip.node}
    </div>
  );
}

function Empty({
  narrowed,
  mine,
  canWrite,
  onClear,
  onWholeClinic,
  onNew,
}: {
  narrowed: boolean;
  mine: boolean;
  canWrite: boolean;
  onClear: () => void;
  onWholeClinic: () => void;
  onNew: () => void;
}) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No prescriptions match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by prescription code or medicine, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else if (mine) {
    body = (
      <>
        <p className="font-semibold text-gray-900">You haven&apos;t issued any prescriptions yet</p>
        <p className="mt-1 text-sm text-gray-500">Prescriptions you write, here or from a visit, appear in this list.</p>
        <button type="button" onClick={onWholeClinic} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Show the whole clinic
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No prescriptions yet</p>
        <p className="mt-1 text-sm text-gray-500">Medicines added to a visit&apos;s treatment plan become prescriptions automatically.</p>
        {canWrite && (
          <button type="button" onClick={onNew} className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            New prescription
          </button>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.pill} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
