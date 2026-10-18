'use client';

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { useSend } from './users-shared';
import MedicineDialog, { type MedicinePreset } from './MedicineDialog';
import {
  FORM_LABEL,
  MEDICINE_FORMS,
  MEDICINE_SHOWS,
  MEDICINE_SHOW_LABEL,
  ROUTE_LABEL,
  USAGE_DAYS,
  hasNoDose,
  rangeLabel,
  usualLine,
  type MedicineForm,
  type MedicineRow,
  type MedicineShow,
  type MedicinesPageData,
  type StockStatus,
} from '@/lib/medicines';

const PATHS = {
  plus: 'M12 5v14m7-7H5',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  pill: 'M10.5 20.5l10-10a4.95 4.95 0 10-7-7l-10 10a4.95 4.95 0 107 7zM8.5 8.5l7 7',
};

/** Grid columns by what the viewer may see: medicine, when picked, [prescribed], [stock], actions. */
const GRID = {
  both: 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_9rem_8.5rem_5.5rem] lg:items-center lg:gap-4',
  usage: 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_9rem_5.5rem] lg:items-center lg:gap-4',
  stock: 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_8.5rem_5.5rem] lg:items-center lg:gap-4',
  plain: 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_5.5rem] lg:items-center lg:gap-4',
};
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const INSET_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal';
const QUIET_ICON = `rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`;

const SORTS = { name: 'By name', prescribed: 'Most prescribed', category: 'By category' } as const;
type Sort = keyof typeof SORTS;

/** Rows drawn at first; "Show more" adds this many. */
const PAGE = 150;
const TOP_CATEGORIES = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const n = (x: number) => x.toLocaleString('en-US');
const times = (x: number) => (x === 1 ? 'once' : x === 2 ? 'twice' : `${n(x)} times`);
const qty = (x: number) => (Number.isInteger(x) ? n(x) : x.toLocaleString('en-US', { maximumFractionDigits: 2 }));

function ago(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${n(days)} days ago`;
}

/** Stock state in words and its colour (text only: the word carries the meaning). */
const STOCK_WORD: Record<StockStatus, { label: string; tone: string }> = {
  'in-stock': { label: 'In stock', tone: 'text-gray-500' },
  'low-stock': { label: 'Running low', tone: 'text-amber-800' },
  'out-of-stock': { label: 'Out of stock', tone: 'text-red-700' },
  expired: { label: 'Expired', tone: 'text-red-700' },
};

export default function MedicinesPageClient({
  data,
  initialShow,
  initialCategory,
}: {
  data: MedicinesPageData;
  initialShow: MedicineShow;
  initialCategory: string;
}) {
  const router = useRouter();
  const send = useSend('That didn’t go through');
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [form, setForm] = useState<MedicineForm | ''>('');
  const [show, setShow] = useState<MedicineShow>(initialShow);
  const [sort, setSort] = useState<Sort>('name');
  const [more, setMore] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const [editing, setEditing] = useState<{ row: MedicineRow | null; preset?: MedicinePreset; key: number } | null>(null);
  const [removing, setRemoving] = useState<MedicineRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const { rows: all, usage, stockVisible, can } = data;
  const now = Date.parse(data.now);
  const since = usage ? Date.parse(usage.since) : 0;

  /** On the list, older than the window, and never prescribed in it. */
  const unused = useCallback((r: MedicineRow) => usage !== null && r.active && !r.usage && Date.parse(r.createdAt) < since, [usage, since]);
  const notStocked = useCallback((r: MedicineRow) => stockVisible && r.active && r.usage !== null && r.stock === null, [stockVisible]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.active) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].map(([c, count]) => ({ c, count })).sort((a, b) => a.c.localeCompare(b.c));
  }, [all]);

  const rows = useMemo(() => {
    const q = fold(search.trim());
    const out = all.filter((r) => {
      if (category && r.category !== category) return false;
      if (form && r.form !== form) return false;
      if (show === 'on-list' && !r.active) return false;
      if (show === 'off-list' && r.active) return false;
      if (show === 'controlled' && !(r.active && r.controlledSubstance)) return false;
      if (show === 'no-dose' && !(r.active && hasNoDose(r))) return false;
      if (show === 'unused' && !unused(r)) return false;
      if (show === 'not-stocked' && !notStocked(r)) return false;
      if (!q) return true;
      return fold([r.name, r.genericName ?? '', ...r.brandNames, r.category, ...r.indications].join(' ')).includes(q);
    });
    const byName = (a: MedicineRow, b: MedicineRow) => a.name.localeCompare(b.name);
    return out.sort((a, b) =>
      sort === 'prescribed'
        ? (b.usage?.lines ?? 0) - (a.usage?.lines ?? 0) || byName(a, b)
        : sort === 'category'
          ? a.category.localeCompare(b.category) || byName(a, b)
          : byName(a, b)
    );
  }, [all, search, category, form, show, sort, unused, notStocked]);

  const filterKey = JSON.stringify([search, category, form, show, sort]);
  const shown = PAGE + (more.key === filterKey ? more.n : 0);
  const visible = rows.slice(0, shown);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (category) chips.push({ key: 'category', label: category, clear: () => setCategory('') });
  if (form) chips.push({ key: 'form', label: `${FORM_LABEL[form]}s`, clear: () => setForm('') });
  if (show !== 'on-list') chips.push({ key: 'show', label: MEDICINE_SHOW_LABEL[show], clear: () => setShow('on-list') });
  const narrowed = chips.length > 0 || search.trim() !== '';
  const clearAll = () => {
    setCategory('');
    setForm('');
    setShow('on-list');
    setSearch('');
  };

  const refresh = () => startRefresh(() => router.refresh());

  // The key remounts the dialog when "Open it" switches to a medicine already on file.
  const open = (row: MedicineRow | null, preset?: MedicinePreset) => setEditing((cur) => ({ row, preset, key: (cur?.key ?? 0) + 1 }));
  const saved = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
    refresh();
  };

  const takeOff = async () => {
    if (!removing) return;
    const r = removing;
    setBusy(r._id);
    const result = await send(`/api/medicines/${r._id}`, 'DELETE');
    setBusy(null);
    setRemoving(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Took ${r.name} off the list. It’s under “Taken off the list” if you need it back.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const putBack = async (r: MedicineRow) => {
    setBusy(r._id);
    const result = await send(`/api/medicines/${r._id}`, 'PUT', { active: true });
    setBusy(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Put ${r.name} back on the list. Doctors can pick it again.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const showUsage = usage !== null;
  const grid = showUsage && stockVisible ? GRID.both : showUsage ? GRID.usage : stockVisible ? GRID.stock : GRID.plain;
  const grouped = sort === 'category' && !category;
  const groups = grouped
    ? [...new Set(visible.map((r) => r.category))].map((c) => ({ c, items: visible.filter((r) => r.category === c) }))
    : [{ c: null as string | null, items: visible }];
  const groupTotal = (c: string) => rows.filter((r) => r.category === c).length;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Medicines</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">The list doctors prescribe from. Picking a medicine fills in its form, strength, dose and how often.</p>
        </div>
        {can.write && (
          <button
            type="button"
            onClick={() => open(null, category ? { category } : undefined)}
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep sm:self-auto ${FOCUS_RING}`}
          >
            <Svg d={PATHS.plus} />
            Add a medicine
          </button>
        )}
      </header>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-4 ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="flex items-start gap-2 text-sm font-medium">
            <Svg d={notice.tone === 'error' ? ICON.alert : ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      {all.length > 0 && (
        <Insights
          data={data}
          category={category}
          show={show}
          unusedCount={all.filter(unused).length}
          notStockedCount={all.filter(notStocked).length}
          onCategory={(c) => setCategory((cur) => (cur === c ? '' : c))}
          onShow={(s) => setShow((cur) => (cur === s ? 'on-list' : s))}
          onAdd={(preset) => open(null, preset)}
        />
      )}

      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form role="search" className="relative flex-1" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="medicine-search" className="sr-only">
                Search medicines
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICON.search} />
              </span>
              <input
                id="medicine-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, generic or brand name, or what it’s for"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
              <label htmlFor="medicine-category" className="sr-only">
                Category
              </label>
              <select id="medicine-category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${FIELD} lg:w-48`}>
                <option value="">Every category</option>
                {categories.map(({ c, count }) => (
                  <option key={c} value={c}>
                    {c} ({count})
                  </option>
                ))}
                {category && !categories.some((x) => x.c === category) && <option value={category}>{category}</option>}
              </select>
              <label htmlFor="medicine-form" className="sr-only">
                Form
              </label>
              <select id="medicine-form" value={form} onChange={(e) => setForm(e.target.value as MedicineForm | '')} className={`${FIELD} lg:w-36`}>
                <option value="">Every form</option>
                {MEDICINE_FORMS.map((f) => (
                  <option key={f} value={f}>
                    {FORM_LABEL[f]}s
                  </option>
                ))}
              </select>
              <label htmlFor="medicine-show" className="sr-only">
                Show
              </label>
              <select id="medicine-show" value={show} onChange={(e) => setShow(e.target.value as MedicineShow)} className={`${FIELD} lg:w-52`}>
                {MEDICINE_SHOWS.filter((s) => (s !== 'unused' || showUsage) && (s !== 'not-stocked' || (showUsage && stockVisible))).map((s) => (
                  <option key={s} value={s}>
                    {MEDICINE_SHOW_LABEL[s]}
                  </option>
                ))}
              </select>
              <label htmlFor="medicine-sort" className="sr-only">
                Sort
              </label>
              <select id="medicine-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${FIELD} lg:w-40`}>
                {(Object.keys(SORTS) as Sort[])
                  .filter((s) => s !== 'prescribed' || showUsage)
                  .map((s) => (
                    <option key={s} value={s}>
                      {SORTS[s]}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={`motion-chip-in inline-flex max-w-full items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                >
                  <span className="truncate">{c.label}</span>
                  <Svg d={ICON.x} className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {`${rows.length} ${rows.length === 1 ? 'medicine' : 'medicines'}${narrowed ? ' match' : ''}.`}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={refreshing}>
        {rows.length > 0 && (
          <div className={`hidden ${grid} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Medicine</span>
            <span>When a doctor picks it</span>
            {showUsage && <span>Last {USAGE_DAYS} days</span>}
            {stockVisible && <span>Stock</span>}
            <span className="sr-only">Actions</span>
          </div>
        )}

        {rows.length === 0 ? (
          <Empty kind={all.length === 0 ? 'none' : narrowed ? 'narrowed' : 'all-off'} canAdd={can.write} onClear={clearAll} onAdd={() => open(null)} onShowOff={() => setShow('off-list')} />
        ) : (
          <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {groups.map((g, gi) => (
              <section key={g.c ?? 'all'} aria-label={g.c ?? undefined} className={gi > 0 ? 'border-t border-gray-200' : ''}>
                {g.c && (
                  <h2 className="flex items-baseline justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-sm font-semibold text-gray-900">
                    {g.c}
                    <span className="font-mono text-xs font-medium tabular-nums text-gray-500">{groupTotal(g.c)}</span>
                  </h2>
                )}
                <ul className="divide-y divide-gray-100">
                  {g.items.map((r, i) => (
                    <MedicineRowItem
                      key={r._id}
                      r={r}
                      index={i}
                      grid={grid}
                      now={now}
                      showUsage={showUsage}
                      showStock={stockVisible}
                      showCategory={!grouped && !category}
                      unused={unused(r)}
                      canWrite={can.write}
                      busy={busy === r._id}
                      onEdit={() => open(r)}
                      onTakeOff={() => setRemoving(r)}
                      onPutBack={() => putBack(r)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {all.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {visible.length < rows.length ? (
                <>
                  Showing <span className="font-mono text-gray-900">1–{n(visible.length)}</span> of <span className="font-mono text-gray-900">{n(rows.length)}</span>
                  {narrowed ? ' that match' : ''}
                </>
              ) : narrowed ? (
                <>
                  <span className="font-mono text-gray-900">{n(rows.length)}</span> of <span className="font-mono text-gray-900">{n(all.length)}</span> medicines match
                </>
              ) : (
                <>
                  <span className="font-mono text-gray-900">{n(rows.length)}</span> {rows.length === 1 ? 'medicine' : 'medicines'} on the list
                </>
              )}
              {data.truncated && ' (the first 2,000 are loaded)'}
            </p>
            {visible.length < rows.length && (
              <button type="button" onClick={() => setMore({ key: filterKey, n: shown })} className={`self-start ${OUTLINE}`}>
                Show {n(Math.min(PAGE, rows.length - visible.length))} more
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <MedicineDialog
          key={editing.key}
          row={editing.row}
          preset={editing.preset}
          rows={all}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onOpen={(r) => open(r)}
        />
      )}

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && busy === null && setRemoving(null)}
            title={`Take ${removing.name} off the list?`}
            description={
              <div className="space-y-2">
                <p>Doctors won’t find it when they prescribe. Prescriptions already written keep it, and you can put it back at any time.</p>
                {removing.stock && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                    Its stock ({qty(removing.stock.quantity)} {removing.stock.unit}) stays in Inventory and can still be dispensed.
                  </p>
                )}
              </div>
            }
          >
            <button type="button" onClick={() => setRemoving(null)} disabled={busy !== null} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
              Keep it
            </button>
            <button
              type="button"
              onClick={takeOff}
              disabled={busy !== null}
              aria-busy={busy !== null}
              className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              {busy !== null ? 'Taking it off…' : 'Take it off'}
            </button>
          </AlertDialog>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function MedicineRowItem({
  r,
  index,
  grid,
  now,
  showUsage,
  showStock,
  showCategory,
  unused,
  canWrite,
  busy,
  onEdit,
  onTakeOff,
  onPutBack,
}: {
  r: MedicineRow;
  index: number;
  grid: string;
  now: number;
  showUsage: boolean;
  showStock: boolean;
  showCategory: boolean;
  unused: boolean;
  canWrite: boolean;
  busy: boolean;
  onEdit: () => void;
  onTakeOff: () => void;
  onPutBack: () => void;
}) {
  const what = [
    r.genericName && r.genericName.toLowerCase() !== r.name.toLowerCase() ? r.genericName : null,
    `${FORM_LABEL[r.form]} ${r.strength}`.trim(),
    ROUTE_LABEL[r.route].toLowerCase(),
    showCategory ? r.category : null,
    r.requiresPrescription ? null : 'over the counter',
  ]
    .filter(Boolean)
    .join(' · ');
  const usual = usualLine(r);
  const muted = !r.active;
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if (!canWrite || (e.target as HTMLElement).closest('a,button')) return;
    onEdit();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${canWrite ? 'cursor-pointer' : ''} ${grid}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {canWrite ? (
            <button type="button" onClick={onEdit} className={`max-w-full truncate rounded text-left font-semibold ${muted ? 'text-gray-600' : 'text-gray-900'} hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {r.name}
            </button>
          ) : (
            <span className={`truncate font-semibold ${muted ? 'text-gray-600' : 'text-gray-900'}`}>{r.name}</span>
          )}
          {r.controlledSubstance && (
            <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-400">
              Controlled{r.schedule ? ` · ${r.schedule}` : ''}
            </span>
          )}
          {!r.active && <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">Off the list</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-gray-500">{what}</span>
        {r.brandNames.length > 0 && <span className="block truncate text-xs text-gray-500">Also sold as {r.brandNames.join(', ')}</span>}
      </span>

      <span className="min-w-0 text-sm">
        {usual ? (
          <span className="block truncate text-gray-900" title={usual}>
            {usual}
          </span>
        ) : r.dosageRanges.length === 0 ? (
          <span className={`flex items-start gap-1.5 ${muted ? 'text-gray-500' : 'text-amber-800'}`}>
            <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No usual dose set
          </span>
        ) : null}
        {r.dosageRanges.length > 0 && (
          <span className="block truncate text-gray-500" title={r.dosageRanges.map((d) => `${rangeLabel(d)}: ${d.dose} ${d.frequency}`).join('\n')}>
            {usual ? '+ ' : ''}
            {r.dosageRanges.length === 1 ? `a dose for ${rangeLabel(r.dosageRanges[0]).toLowerCase()}` : `${r.dosageRanges.length} doses by age or weight`}
          </span>
        )}
      </span>

      {showUsage && (
        <span className="min-w-0 text-sm">
          {r.usage ? (
            <>
              <span className="block font-mono tabular-nums text-gray-900">Prescribed {times(r.usage.lines)}</span>
              <span className="block text-gray-500">Last {ago(r.usage.last, now)}</span>
            </>
          ) : (
            <span className={unused ? 'text-gray-600' : 'text-gray-500'}>{unused || !r.active ? `Not prescribed in ${USAGE_DAYS} days` : `Added ${ago(r.createdAt, now)}`}</span>
          )}
        </span>
      )}

      {showStock && (
        <span className="min-w-0 text-sm">
          {r.stock ? (
            <Link
              href={r.stock.itemId ? `/inventory/${r.stock.itemId}` : `/inventory?search=${encodeURIComponent(r.name)}`}
              className={`block rounded hover:text-brand-teal-deep ${FOCUS_RING}`}
              aria-label={`Stock of ${r.name}: ${qty(r.stock.quantity)} ${r.stock.unit}, ${STOCK_WORD[r.stock.status].label.toLowerCase()}`}
            >
              <span className="block font-mono tabular-nums text-gray-900">
                {qty(r.stock.quantity)} <span className="font-sans text-gray-600">{r.stock.unit}</span>
              </span>
              <span className={`block ${STOCK_WORD[r.stock.status].tone}`}>
                {STOCK_WORD[r.stock.status].label}
                {r.stock.items > 1 ? ` · ${r.stock.items} items` : ''}
              </span>
            </Link>
          ) : (
            <span className={r.active && r.usage ? 'text-amber-800' : 'text-gray-500'}>No stock item</span>
          )}
        </span>
      )}

      <span className="flex items-center gap-1 lg:justify-end">
        {!r.active && canWrite ? (
          <button type="button" onClick={onPutBack} disabled={busy} aria-label={`Put ${r.name} back on the list`} className={OUTLINE}>
            {busy ? 'Putting back…' : 'Put back'}
          </button>
        ) : (
          canWrite && (
            <>
              <button type="button" onClick={onEdit} aria-label={`Edit ${r.name}`} className={QUIET_ICON}>
                <Svg d={PATHS.edit} />
              </button>
              <button type="button" onClick={onTakeOff} aria-label={`Take ${r.name} off the list`} title="Take off the list" className={QUIET_ICON}>
                <Svg d={PATHS.archive} />
              </button>
            </>
          )
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insights: what is on the list, what gets prescribed, and what is written in by hand
// ---------------------------------------------------------------------------

function FilterRow({ on, onClick, label, count, tone = 'text-gray-700' }: { on: boolean; onClick: () => void; label: string; count: number; tone?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 ${INSET_RING} ${
        on ? 'bg-brand-teal-light/60 font-semibold text-gray-900' : tone
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n(count)}</span>
    </button>
  );
}

function Bar({ value, max, on, dim, delay }: { value: number; max: number; on?: boolean; dim?: boolean; delay: number }) {
  return (
    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
      <span
        className="motion-bar-grow block h-full rounded-r"
        style={{ width: `${(value / Math.max(1, max)) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: dim ? 0.3 : 1, animationDelay: `${delay}ms` }}
      />
    </span>
  );
}

function Cell({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="border-r border-b border-gray-200 p-5" aria-labelledby={id}>
      <h2 id={id} className="text-sm text-gray-600">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Insights({
  data,
  category,
  show,
  unusedCount,
  notStockedCount,
  onCategory,
  onShow,
  onAdd,
}: {
  data: MedicinesPageData;
  category: string;
  show: MedicineShow;
  unusedCount: number;
  notStockedCount: number;
  onCategory: (c: string) => void;
  onShow: (s: MedicineShow) => void;
  onAdd: (preset: MedicinePreset) => void;
}) {
  const { rows, usage, stockVisible, can } = data;
  const active = rows.filter((r) => r.active);
  const counts = new Map<string, number>();
  for (const r of active) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const byCategory = [...counts.entries()].map(([c, count]) => ({ c, count })).sort((a, b) => b.count - a.count || a.c.localeCompare(b.c));
  const top = byCategory.slice(0, TOP_CATEGORIES);
  // A category picked from the menu stays visible here even when it isn't among the largest.
  const picked = category && !top.some((x) => x.c === category) ? byCategory.find((x) => x.c === category) : undefined;
  const shownCats = picked ? [...top, picked] : top;
  const restCount = byCategory.length - shownCats.length;
  const maxCat = Math.max(1, ...top.map((x) => x.count));
  const offList = rows.length - active.length;
  const controlled = active.filter((r) => r.controlledSubstance).length;
  const noDose = active.filter(hasNoDose).length;

  const prescribed = rows.filter((r) => r.usage).sort((a, b) => b.usage!.lines - a.usage!.lines || a.name.localeCompare(b.name));
  const topRx = prescribed.slice(0, 4);
  const maxRx = Math.max(1, ...topRx.map((r) => r.usage!.lines));
  const onListLines = prescribed.reduce((s, r) => s + r.usage!.lines, 0);
  const now = Date.parse(data.now);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className={`grid -mr-px -mb-px grid-cols-1 ${usage ? 'lg:grid-cols-3' : ''}`}>
        <Cell id="med-list-h" title="On the list">
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{n(active.length)}</p>
          <p className="mt-1 text-sm text-gray-500">
            medicines doctors can pick, in <span className="font-mono tabular-nums">{n(byCategory.length)}</span> {byCategory.length === 1 ? 'category' : 'categories'}
          </p>
          <ul className={`mt-3 space-y-1 ${usage ? '' : 'sm:grid sm:grid-cols-2 sm:gap-x-8 sm:space-y-0 lg:grid-cols-3'}`} role="group" aria-label="Filter by category">
            {shownCats.map(({ c, count }, i) => {
              const on = category === c;
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onCategory(c)}
                    aria-label={`${c}: ${count}${on ? ', filtering' : ''}`}
                    className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 ${INSET_RING} ${on ? 'bg-brand-teal-light/60' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={`truncate ${on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{c}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{count}</span>
                    </span>
                    <Bar value={count} max={maxCat} on={on} dim={!!category && !on} delay={i * 50} />
                  </button>
                </li>
              );
            })}
          </ul>
          {restCount > 0 && (
            <p className="mt-1.5 text-xs text-gray-500">
              and <span className="font-mono tabular-nums">{n(restCount)}</span> more in the category menu
            </p>
          )}
          <div className="mt-2 border-t border-gray-100 pt-2">
            {controlled > 0 && <FilterRow on={show === 'controlled'} onClick={() => onShow('controlled')} label="Controlled substances" count={controlled} />}
            {noDose > 0 && <FilterRow on={show === 'no-dose'} onClick={() => onShow('no-dose')} label="No usual dose set" count={noDose} tone="text-amber-800" />}
            {offList > 0 && <FilterRow on={show === 'off-list'} onClick={() => onShow('off-list')} label="Taken off the list" count={offList} />}
          </div>
        </Cell>

        {usage && (
          <Cell id="med-rx-h" title={`Prescribed in the last ${USAGE_DAYS} days`}>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{n(onListLines)}</p>
            <p className="mt-1 text-sm text-gray-500">
              times a medicine on the list was prescribed, on <span className="font-mono tabular-nums">{n(usage.prescriptions)}</span>{' '}
              {usage.prescriptions === 1 ? 'prescription' : 'prescriptions'}; cancelled ones left out
            </p>
            {topRx.length > 0 ? (
              <ul className="mt-3 space-y-2.5" aria-label="Prescribed most">
                {topRx.map((r, i) => (
                  <li key={r._id}>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-700">{r.name}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n(r.usage!.lines)}</span>
                    </span>
                    <Bar value={r.usage!.lines} max={maxRx} delay={i * 50} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Nothing on the list was prescribed in this time.</p>
            )}
            <div className="mt-2 border-t border-gray-100 pt-2">
              <FilterRow on={show === 'unused'} onClick={() => onShow('unused')} label={`Not prescribed in ${USAGE_DAYS} days`} count={unusedCount} />
              {stockVisible && (
                <FilterRow on={show === 'not-stocked'} onClick={() => onShow('not-stocked')} label="Prescribed, but no stock item" count={notStockedCount} tone={notStockedCount ? 'text-amber-800' : 'text-gray-700'} />
              )}
            </div>
          </Cell>
        )}

        {usage && (
          <Cell id="med-written-h" title="Written in by name">
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
              {n(usage.writtenInLines)}
              <span className="text-lg text-gray-500"> of {n(usage.totalLines)}</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">prescribed medicines that aren’t on the list, so nothing was filled in for the doctor</p>
            {usage.writtenIn.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-100" aria-label="Written in most often">
                {usage.writtenIn.map((w) => (
                  <li key={w.name} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate text-gray-900">{w.name}</span>
                      <span className="block text-xs text-gray-500">
                        <span className="font-mono tabular-nums">{times(w.lines)}</span> · last {ago(w.last, now)}
                      </span>
                    </span>
                    {can.write && (
                      <button
                        type="button"
                        onClick={() => onAdd({ name: w.name, standardDosage: w.dose ?? undefined, standardFrequency: w.frequency ?? undefined })}
                        aria-label={`Add ${w.name} to the list`}
                        className={`shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                      >
                        Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Every medicine prescribed in this time was on the list.</p>
            )}
          </Cell>
        )}
      </div>
    </div>
  );
}

function Empty({
  kind,
  canAdd,
  onClear,
  onAdd,
  onShowOff,
}: {
  kind: 'none' | 'narrowed' | 'all-off';
  canAdd: boolean;
  onClear: () => void;
  onAdd: () => void;
  onShowOff: () => void;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={kind === 'narrowed' ? ICON.search : PATHS.pill} className="h-5 w-5" />
      </div>
      {kind === 'all-off' ? (
        <>
          <p className="font-semibold text-gray-900">Nothing is on the list</p>
          <p className="mt-1 text-sm text-gray-500">Every medicine has been taken off. Put one back, or add a new one.</p>
          <button type="button" onClick={onShowOff} className={`mt-5 ${OUTLINE} px-4 py-2`}>
            Show what was taken off
          </button>
        </>
      ) : kind === 'narrowed' ? (
        <>
          <p className="font-semibold text-gray-900">No medicine matches</p>
          <p className="mt-1 text-sm text-gray-500">Check the spelling, or loosen a filter.</p>
          <button type="button" onClick={onClear} className={`mt-5 ${OUTLINE} px-4 py-2`}>
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">No medicines yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Add what the clinic’s doctors prescribe. Picking one fills in its form, strength, dose and how often, so prescriptions read the same every time.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={PATHS.plus} />
              Add a medicine
            </button>
          )}
        </>
      )}
    </div>
  );
}
