'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { SERIES } from './dashboards/charts';
import { ExpiryLine, KindMark, shortDate, type DocumentRow } from './documents/shared';
import { CATEGORY_LABEL, DOCUMENT_CATEGORY_KEYS, categoryLabel, expiryOf, fileSize, type DocumentCategory, type DocumentStatusFilter } from '@/lib/documents';
import type { DocumentPermissions } from '@/lib/documents-page';

interface Insights {
  active: number;
  archived: number;
  bytes: number;
  confidential: number;
  byCategory: Partial<Record<DocumentCategory, number>>;
  unfiled: { count: number; newest: { _id: string; title: string; documentCode: string; uploadDate: string; category: string }[] };
  expiring: { expired: number; soon: number; next: { _id: string; title: string; category: string; patientName: string | null; expiry: string }[] };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 25;
const ROW_GRID = 'lg:grid lg:grid-cols-[2.25rem_minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_8rem_4.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
};

const STATUS_LABEL: Record<DocumentStatusFilter, string> = { active: 'In use', archived: 'Archived', all: 'In use and archived' };

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

export default function DocumentsPageClient({
  permissions,
  initialUnfiled,
  initialExpiring,
}: {
  permissions: DocumentPermissions;
  initialUnfiled: boolean;
  initialExpiring: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [status, setStatus] = useState<DocumentStatusFilter>('active');
  const [unfiled, setUnfiled] = useState(initialUnfiled);
  const [expiring, setExpiring] = useState(initialExpiring);
  const [staffOnly, setStaffOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), status });
  if (debounced.trim()) params.set('search', debounced.trim());
  if (category) params.set('category', category);
  if (unfiled) params.set('filed', 'none');
  if (expiring) params.set('expiring', '1');
  if (staffOnly) params.set('confidential', '1');
  const listUrl = `/api/documents?${params}`;
  const list = useKeyedFetch<DocumentRow[]>(listUrl);
  const insights = useKeyedFetch<Insights>('/api/documents/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  const reset = () => setPage(1);
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (category) chips.push({ key: 'cat', label: CATEGORY_LABEL[category], clear: () => (setCategory(''), reset()) });
  if (status !== 'active') chips.push({ key: 'status', label: STATUS_LABEL[status], clear: () => (setStatus('active'), reset()) });
  if (unfiled) chips.push({ key: 'unfiled', label: 'Not filed to a patient', clear: () => (setUnfiled(false), reset()) });
  if (expiring) chips.push({ key: 'exp', label: 'Expired or expiring soon', clear: () => (setExpiring(false), reset()) });
  if (staffOnly) chips.push({ key: 'staff', label: 'Staff only', clear: () => (setStaffOnly(false), reset()) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setCategory('');
    setStatus('active');
    setUnfiled(false);
    setExpiring(false);
    setStaffOnly(false);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Documents</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Scans, results and letters on file, and the patient each one belongs to.</p>
          </div>
          {permissions.canUpload && (
            <Link href="/documents/upload" className={`inline-flex w-fit items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.upload} />
              Upload document
            </Link>
          )}
        </header>

        {insights.value ? (
          <DocumentInsights
            data={insights.value}
            category={category}
            unfiled={unfiled}
            expiring={expiring}
            onCategory={(c) => {
              setCategory((cur) => (cur === c ? '' : c));
              reset();
            }}
            onUnfiled={() => {
              setUnfiled((v) => !v);
              reset();
            }}
            onExpiring={() => {
              setExpiring((v) => !v);
              reset();
            }}
          />
        ) : insights.error ? (
          <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
            The document figures didn&apos;t load ({insights.error}).{' '}
            <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-[240px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setDebounced(search);
                setPage(1);
              }}
            >
              <label htmlFor="doc-search" className="sr-only">
                Search documents
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="doc-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, code, file name, tag or patient"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
              <label htmlFor="doc-cat" className="sr-only">
                Kind of document
              </label>
              <select
                id="doc-cat"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as DocumentCategory | '');
                  reset();
                }}
                className={`${FIELD} lg:w-52`}
              >
                <option value="">Any kind</option>
                {DOCUMENT_CATEGORY_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <label htmlFor="doc-status" className="sr-only">
                In use or archived
              </label>
              <select
                id="doc-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as DocumentStatusFilter);
                  reset();
                }}
                className={`${FIELD} lg:w-52`}
              >
                {(Object.keys(STATUS_LABEL) as DocumentStatusFilter[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {insights.value && insights.value.confidential > 0 && !staffOnly && (
              <button
                type="button"
                onClick={() => {
                  setStaffOnly(true);
                  reset();
                }}
                className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 hover:border-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.lock} className="h-3.5 w-3.5" />
                Staff only <span className="font-mono text-gray-500">{insights.value.confidential}</span>
              </button>
            )}
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
            {chips.length > 0 && (
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            )}
          </div>
        </div>

        {list.error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">The documents didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} documents${narrowed ? ' match' : ''}.` : ''}
        </p>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span className="sr-only">File type</span>
            <span>Document</span>
            <span>Patient</span>
            <span>Kind</span>
            <span>Added</span>
            <span className="sr-only">Actions</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="h-9 w-9 rounded-md bg-gray-100" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-52 rounded bg-gray-100" />
                      <span className="block h-3 w-32 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3 w-32 rounded bg-gray-100 lg:block" />
                    <span className="h-3 w-20 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} canUpload={permissions.canUpload} onClear={clearAll} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((d, i) => (
                <DocumentListRow key={d._id} doc={d} index={i} onOpen={() => router.push(`/documents/${d._id}`)} />
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
                {narrowed ? ' matching documents' : ' documents'}, newest first
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function DocumentListRow({ doc: d, index, onOpen }: { doc: DocumentRow; index: number; onOpen: () => void }) {
  const expiry = expiryOf(d);
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
      <span className="hidden lg:block">
        <KindMark kind={d.documentType} />
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <Link href={`/documents/${d._id}`} className={`truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
            {d.title}
          </Link>
          {d.isConfidential && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300" title="Kept out of the patient's portal">
              Staff only
            </span>
          )}
          {d.status === 'archived' && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">Archived</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          <span className="font-mono">{d.documentCode}</span>
          {d.originalFilename && d.originalFilename !== d.title && ` · ${d.originalFilename}`}
          <span className="font-mono"> · {fileSize(d.size)}</span>
        </span>
      </span>

      <span className="min-w-0 text-sm">
        {d.patient?._id ? (
          <Link href={`/patients/${d.patient._id}`} className={`block truncate rounded text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
            {d.patient.firstName} {d.patient.lastName}
            {d.patient.patientCode && <span className="font-mono text-xs text-gray-500"> {d.patient.patientCode}</span>}
          </Link>
        ) : (
          <span className="font-medium text-amber-800">Not filed to a patient</span>
        )}
        {d.visit?.visitCode && <span className="block truncate font-mono text-xs text-gray-500">Visit {d.visit.visitCode}</span>}
      </span>

      <span className="min-w-0 text-sm">
        <span className="block truncate text-gray-700">{categoryLabel(d.category)}</span>
        {expiry && <ExpiryLine iso={String(expiry)} className="block truncate text-xs" />}
      </span>

      <span className="text-sm">
        <span className="block font-mono tabular-nums text-gray-900">{shortDate(d.uploadDate)}</span>
        {d.uploadedBy?.name && <span className="block truncate text-xs text-gray-500">{d.uploadedBy.name}</span>}
      </span>

      <span className="flex items-center justify-end gap-0.5">
        <a
          href={`/api/documents/${d._id}/view`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${d.title} in a new tab`}
          title="Open"
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.eye} />
        </a>
        <a
          href={`/api/documents/${d._id}/download`}
          aria-label={`Download ${d.title}`}
          title="Download"
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.download} />
        </a>
      </span>
    </li>
  );
}

/**
 * The three questions whoever keeps the records asks: what is on file (by kind, which filters
 * the list), what came in without a patient, and what has run out or is about to (certificates,
 * insurance cards). Counts are clinic-wide and never shrink with the filters.
 */
function DocumentInsights({
  data,
  category,
  unfiled,
  expiring,
  onCategory,
  onUnfiled,
  onExpiring,
}: {
  data: Insights;
  category: DocumentCategory | '';
  unfiled: boolean;
  expiring: boolean;
  onCategory: (c: DocumentCategory) => void;
  onUnfiled: () => void;
  onExpiring: () => void;
}) {
  const kinds = (Object.entries(data.byCategory) as [DocumentCategory, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = kinds.slice(0, 5);
  const max = Math.max(1, ...kinds.map(([, n]) => n));
  const exp = data.expiring.expired + data.expiring.soon;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-kinds-h">
          <h2 id="doc-kinds-h" className="text-sm text-gray-600">
            Documents on file
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${data.active ? 'text-gray-900' : 'text-gray-500'}`}>{data.active.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono">{fileSize(data.bytes)}</span> of files
            {data.archived > 0 && (
              <>
                {', '}
                <span className="font-mono">{data.archived}</span> archived
              </>
            )}
          </p>
          {shown.length > 0 && (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by kind of document">
              {shown.map(([c, n], i) => {
                const on = category === c;
                return (
                  <li key={c}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onCategory(c)}
                      aria-label={`${CATEGORY_LABEL[c]}: ${n}${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{CATEGORY_LABEL[c]}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(n / max) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: category && !on ? 0.3 : 1, animationDelay: `${i * 60}ms` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {kinds.length > shown.length && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-mono">{kinds.length - shown.length}</span> more kinds in the Kind filter.
            </p>
          )}
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-unfiled-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="doc-unfiled-h" className="text-sm text-gray-600">
              Not filed to a patient
            </h2>
            {data.unfiled.count > 0 && (
              <button type="button" aria-pressed={unfiled} onClick={onUnfiled} className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                {unfiled ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${data.unfiled.count ? 'text-gray-900' : 'text-gray-500'}`}>{data.unfiled.count.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">{data.unfiled.count === 0 ? 'Every document belongs to a patient.' : 'They don’t appear on any patient’s record until filed.'}</p>
          {data.unfiled.newest.length > 0 && (
            <ul className="mt-3 space-y-1">
              {data.unfiled.newest.map((d) => (
                <li key={d._id}>
                  <Link href={`/documents/${d._id}`} className={`-mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50 ${FOCUS_RING}`}>
                    <span className="min-w-0 truncate text-gray-700">{d.title}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">{shortDate(d.uploadDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-exp-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="doc-exp-h" className="text-sm text-gray-600">
              Expired or expiring in 30 days
            </h2>
            {exp > 0 && (
              <button type="button" aria-pressed={expiring} onClick={onExpiring} className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                {expiring ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${exp ? 'text-gray-900' : 'text-gray-500'}`}>{exp.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {exp === 0 ? (
              'Nothing on file runs out in the next 30 days.'
            ) : data.expiring.expired > 0 ? (
              <span className="font-medium text-red-700">
                <span className="font-mono">{data.expiring.expired}</span> already expired
              </span>
            ) : (
              'None expired yet'
            )}
          </p>
          {data.expiring.next.length > 0 && (
            <ul className="mt-3 space-y-1">
              {data.expiring.next.map((d) => (
                <li key={d._id}>
                  <Link href={`/documents/${d._id}`} className={`-mx-2 block rounded px-2 py-1 text-sm hover:bg-gray-50 ${FOCUS_RING}`}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-gray-700">{d.patientName ?? d.title}</span>
                      <ExpiryLine iso={d.expiry} className="shrink-0 text-xs" />
                    </span>
                    {d.patientName && <span className="block truncate text-xs text-gray-500">{categoryLabel(d.category)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, canUpload, onClear }: { narrowed: boolean; canUpload: boolean; onClear: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No documents match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by code or patient, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No documents yet</p>
        <p className="mt-1 text-sm text-gray-500">Upload referral letters, outside lab results, imaging and IDs, and file each one to its patient.</p>
        {canUpload && (
          <Link href="/documents/upload" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.upload} />
            Upload document
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.doc} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
