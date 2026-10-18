'use client';

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { makeCurrencyFormatter } from '../dashboards/shared';
import { useSend } from './users-shared';
import ServiceDialog, { type ServicePreset } from './ServiceDialog';
import { VISIT_TYPES } from '@/lib/visit-types';
import {
  CATEGORY,
  FALLBACK_VISIT_FEE,
  SERVICE_CATEGORIES,
  SERVICE_SHOWS,
  SERVICE_SHOW_LABEL,
  USAGE_DAYS,
  pickVisitFee,
  visitTypeOf,
  type ServiceCategory,
  type ServiceRow,
  type ServiceShow,
  type ServicesPageData,
} from '@/lib/services';

export const SERVICE_ICONS = {
  ...ICON,
  plus: 'M12 5v14m7-7H5',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  receipt: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
};

const GRID_USAGE = 'lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_minmax(0,14rem)_5.5rem] lg:items-center lg:gap-4';
const GRID_PLAIN = 'lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_5.5rem] lg:items-center lg:gap-4';
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

const SORTS = { category: 'By category', name: 'By name', billed: 'Most billed', price: 'Highest price' } as const;
type Sort = keyof typeof SORTS;

const DAY_MS = 24 * 60 * 60 * 1000;
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "today", "yesterday", "12 days ago". */
function ago(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n.toLocaleString('en-US')} times`);

export default function ServicesPageClient({
  data,
  initialShow,
  initialCategory,
}: {
  data: ServicesPageData;
  initialShow: ServiceShow;
  initialCategory: ServiceCategory | '';
}) {
  const router = useRouter();
  const send = useSend('That didn’t go through');
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ServiceCategory | ''>(initialCategory);
  const [show, setShow] = useState<ServiceShow>(initialShow);
  const [sort, setSort] = useState<Sort>('category');
  const [editing, setEditing] = useState<{ row: ServiceRow | null; preset?: ServicePreset } | null>(null);
  const [removing, setRemoving] = useState<ServiceRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const { rows: all, usage, can } = data;
  const now = Date.parse(data.now);
  const since = usage ? Date.parse(usage.since) : 0;
  const money = useMemo(() => makeCurrencyFormatter(data.currency), [data.currency]);
  const hasUsage = usage !== null;
  /** On the list, older than the window, and never billed in it. */
  const unused = useCallback((r: ServiceRow) => hasUsage && r.active && !r.usage && Date.parse(r.createdAt) < since, [hasUsage, since]);

  /** Which service each visit type bills when a visit closes, by the automatic invoice's rule. */
  const fees = useMemo(() => VISIT_TYPES.map((t) => ({ ...t, pick: pickVisitFee(all, t.value) })), [all]);
  const billedFor = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of fees) if (f.pick) m.set(f.pick.service._id, [...(m.get(f.pick.service._id) ?? []), f.label]);
    return m;
  }, [fees]);

  const rows = useMemo(() => {
    const q = fold(search.trim());
    const out = all.filter((r) => {
      if (category && r.category !== category) return false;
      if (show === 'on-list' && !r.active) return false;
      if (show === 'off-list' && r.active) return false;
      if (show === 'unused' && !unused(r)) return false;
      if (!q) return true;
      return fold(`${r.name} ${r.code} ${r.description ?? ''} ${r.type ?? ''}`).includes(q);
    });
    const byName = (a: ServiceRow, b: ServiceRow) => a.name.localeCompare(b.name);
    return out.sort((a, b) =>
      sort === 'billed'
        ? (b.usage?.amount ?? 0) - (a.usage?.amount ?? 0) || byName(a, b)
        : sort === 'price'
          ? b.unitPrice - a.unitPrice || byName(a, b)
          : sort === 'category'
            ? SERVICE_CATEGORIES.indexOf(a.category) - SERVICE_CATEGORIES.indexOf(b.category) || byName(a, b)
            : byName(a, b)
    );
  }, [all, search, category, show, sort, unused]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (category) chips.push({ key: 'category', label: CATEGORY[category].plural, clear: () => setCategory('') });
  if (show !== 'on-list') chips.push({ key: 'show', label: SERVICE_SHOW_LABEL[show], clear: () => setShow('on-list') });
  const narrowed = chips.length > 0 || search.trim() !== '';
  const clearAll = () => {
    setCategory('');
    setShow('on-list');
    setSearch('');
  };

  const refresh = () => startRefresh(() => router.refresh());

  const saved = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
    refresh();
  };

  const takeOff = async () => {
    if (!removing) return;
    const r = removing;
    setBusy(r._id);
    const result = await send(`/api/services/${r._id}`, 'DELETE');
    setBusy(null);
    setRemoving(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Took ${r.name} off the price list. It’s under “Taken off the list” if you need it back.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const putBack = async (r: ServiceRow) => {
    setBusy(r._id);
    const result = await send(`/api/services/${r._id}`, 'PUT', { active: true });
    setBusy(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Put ${r.name} back on the price list at ${money(r.unitPrice)}.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const add = (preset?: ServicePreset) => setEditing({ row: null, preset });
  const showUsage = usage !== null;
  const grid = showUsage ? GRID_USAGE : GRID_PLAIN;
  const grouped = sort === 'category' && !category;
  const groups = grouped
    ? SERVICE_CATEGORIES.map((c) => ({ c, items: rows.filter((r) => r.category === c) })).filter((g) => g.items.length > 0)
    : [{ c: null, items: rows }];

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Services and prices</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">The price list staff bill from, and the fee each kind of visit is charged when it closes.</p>
        </div>
        <button
          type="button"
          onClick={() => add(category ? { category } : undefined)}
          className={`inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep sm:self-auto ${FOCUS_RING}`}
        >
          <Svg d={SERVICE_ICONS.plus} />
          Add a service
        </button>
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
        <>
          <Insights
            data={data}
            money={money}
            category={category}
            show={show}
            unusedCount={all.filter(unused).length}
            onCategory={(c) => setCategory((cur) => (cur === c ? '' : c))}
            onShow={(s) => setShow((cur) => (cur === s ? 'on-list' : s))}
            onAdd={add}
          />
          <VisitFees data={data} fees={fees} money={money} onSet={(type, label) => add({ category: 'consultation', type, name: `${label} consultation` })} />
        </>
      )}

      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form role="search" className="relative flex-1" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="service-search" className="sr-only">
                Search services
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICON.search} />
              </span>
              <input
                id="service-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code or description"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
              <label htmlFor="service-category" className="sr-only">
                Category
              </label>
              <select id="service-category" value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory | '')} className={`${FIELD} lg:w-44`}>
                <option value="">Every category</option>
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c].plural}
                  </option>
                ))}
              </select>
              <label htmlFor="service-show" className="sr-only">
                Show
              </label>
              <select id="service-show" value={show} onChange={(e) => setShow(e.target.value as ServiceShow)} className={`${FIELD} lg:w-52`}>
                {SERVICE_SHOWS.filter((s) => s !== 'unused' || showUsage).map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_SHOW_LABEL[s]}
                  </option>
                ))}
              </select>
              <label htmlFor="service-sort" className="sr-only">
                Sort
              </label>
              <select id="service-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${FIELD} lg:w-40`}>
                {(Object.keys(SORTS) as Sort[])
                  .filter((s) => s !== 'billed' || showUsage)
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
        {`${rows.length} ${rows.length === 1 ? 'service' : 'services'}${narrowed ? ' match' : ''}.`}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={refreshing}>
        {rows.length > 0 && (
          <div className={`hidden ${grid} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Service</span>
            <span className="text-right">Price</span>
            {showUsage && <span>Last {USAGE_DAYS} days</span>}
            <span className="sr-only">Actions</span>
          </div>
        )}

        {rows.length === 0 ? (
          <Empty
            kind={all.length === 0 ? 'none' : narrowed ? 'narrowed' : 'all-off'}
            canAdd={can.write}
            onClear={clearAll}
            onAdd={() => add()}
            onShowOff={() => setShow('off-list')}
          />
        ) : (
          <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {groups.map((g, gi) => (
              <section key={g.c ?? 'all'} aria-label={g.c ? CATEGORY[g.c].plural : undefined} className={gi > 0 ? 'border-t border-gray-200' : ''}>
                {g.c && (
                  <h2 className="flex items-baseline justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-sm font-semibold text-gray-900">
                    {CATEGORY[g.c].plural}
                    <span className="font-mono text-xs font-medium tabular-nums text-gray-500">{g.items.length}</span>
                  </h2>
                )}
                <ul className="divide-y divide-gray-100">
                  {g.items.map((r, i) => (
                    <ServiceRowItem
                      key={r._id}
                      r={r}
                      index={i}
                      grid={grid}
                      now={now}
                      money={money}
                      showUsage={showUsage}
                      showCategory={!grouped}
                      unused={unused(r)}
                      billedFor={billedFor.get(r._id) ?? []}
                      setFor={r.active && r.category === 'consultation' ? setButBeaten(r, fees) : null}
                      can={can}
                      busy={busy === r._id}
                      onEdit={() => setEditing({ row: r })}
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
          <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            {narrowed ? (
              <>
                <span className="font-mono text-gray-900">{rows.length}</span> of <span className="font-mono text-gray-900">{all.length}</span> services match
              </>
            ) : (
              <>
                <span className="font-mono text-gray-900">{rows.length}</span> {rows.length === 1 ? 'service' : 'services'} on the price list
              </>
            )}
            {data.truncated && ' (the first 1,000 are shown)'}
          </p>
        )}
      </div>

      {editing && (
        <ServiceDialog
          row={editing.row}
          preset={editing.preset}
          rows={all}
          money={money}
          currency={data.currency}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && busy === null && setRemoving(null)}
            title={`Take ${removing.name} off the price list?`}
            description={<TakeOffConsequences row={removing} rows={all} money={money} />}
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

/** A consultation set for a visit type that another (dearer) service wins. */
function setButBeaten(r: ServiceRow, fees: { value: string; label: string; pick: ReturnType<typeof pickVisitFee<ServiceRow>> }[]) {
  const t = visitTypeOf(r.type);
  const fee = t ? fees.find((f) => f.value === t) : null;
  if (!fee?.pick || fee.pick.service._id === r._id) return null;
  return { label: fee.label, winner: fee.pick.service.name };
}

function TakeOffConsequences({ row, rows, money }: { row: ServiceRow; rows: ServiceRow[]; money: (n: number) => string }) {
  const rest = rows.filter((r) => r._id !== row._id);
  const changes = VISIT_TYPES.filter((t) => pickVisitFee(rows, t.value)?.service._id === row._id).map((t) => {
    const next = pickVisitFee(rest, t.value)?.service;
    return { label: t.label, next: next ? `${next.name} (${money(next.unitPrice)})` : `the fixed ${money(FALLBACK_VISIT_FEE)}` };
  });
  return (
    <div className="space-y-2">
      <p>It stops appearing when staff bill. Invoices already made keep it, and you can put it back at any time.</p>
      {changes.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          {changes.map((c) => (
            <li key={c.label}>
              Closed {c.label.toLowerCase()} visits will be billed {c.next} instead.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function ServiceRowItem({
  r,
  index,
  grid,
  now,
  money,
  showUsage,
  showCategory,
  unused,
  billedFor,
  setFor,
  can,
  busy,
  onEdit,
  onTakeOff,
  onPutBack,
}: {
  r: ServiceRow;
  index: number;
  grid: string;
  now: number;
  money: (n: number) => string;
  showUsage: boolean;
  showCategory: boolean;
  unused: boolean;
  billedFor: string[];
  setFor: { label: string; winner: string } | null;
  can: ServicesPageData['can'];
  busy: boolean;
  onEdit: () => void;
  onTakeOff: () => void;
  onPutBack: () => void;
}) {
  const details = [showCategory ? CATEGORY[r.category].label : null, r.duration ? `${r.duration} min` : null, r.description].filter(Boolean).join(' · ');
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if (!can.write || (e.target as HTMLElement).closest('a,button')) return;
    onEdit();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${can.write ? 'cursor-pointer' : ''} ${grid}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {can.write ? (
            <button
              type="button"
              onClick={onEdit}
              className={`max-w-full truncate rounded text-left font-semibold ${r.active ? 'text-gray-900' : 'text-gray-600'} hover:text-brand-teal-deep ${FOCUS_RING}`}
            >
              {r.name}
            </button>
          ) : (
            <span className={`truncate font-semibold ${r.active ? 'text-gray-900' : 'text-gray-600'}`}>{r.name}</span>
          )}
          <span className="font-mono text-xs tabular-nums text-gray-500">{r.code}</span>
          {!r.active && <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">Off the list</span>}
        </span>
        {details && <span className="mt-0.5 block truncate text-sm text-gray-500">{details}</span>}
        {billedFor.length > 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <Svg d={SERVICE_ICONS.receipt} className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            Billed when a {billedFor.join(', ').toLowerCase()} visit closes
          </span>
        )}
        {setFor && (
          <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <Svg d={ICON.alert} className="h-3.5 w-3.5 shrink-0" />
            Set for {setFor.label.toLowerCase()} visits, but {setFor.winner} is billed instead
          </span>
        )}
      </span>

      <span className="text-sm lg:text-right">
        <span className={`font-mono font-semibold tabular-nums ${r.active ? 'text-gray-900' : 'text-gray-600'}`}>{money(r.unitPrice)}</span>
        <span className="ml-1.5 text-gray-500 lg:ml-0 lg:block">{r.unit}</span>
      </span>

      {showUsage && (
        <span className="min-w-0 text-sm">
          {r.usage ? (
            <>
              <span className="font-mono tabular-nums text-gray-900">
                {times(r.usage.lines)} · {money(r.usage.amount)}
              </span>
              <span className="block text-gray-500">Last billed {ago(r.usage.lastBilled, now)}</span>
            </>
          ) : !r.active ? (
            <span className="text-gray-500">Not billed in {USAGE_DAYS} days</span>
          ) : unused ? (
            <span className="text-gray-600">Not billed in {USAGE_DAYS} days</span>
          ) : (
            <span className="text-gray-500">Added {ago(r.createdAt, now)}; not billed yet</span>
          )}
        </span>
      )}

      <span className="flex items-center gap-1 lg:justify-end">
        {!r.active && can.write ? (
          <button type="button" onClick={onPutBack} disabled={busy} aria-label={`Put ${r.name} back on the price list`} className={OUTLINE}>
            {busy ? 'Putting back…' : 'Put back'}
          </button>
        ) : (
          <>
            {can.write && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${r.name}`}
                className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
              >
                <Svg d={SERVICE_ICONS.edit} />
              </button>
            )}
            {can.remove && r.active && (
              <button
                type="button"
                onClick={onTakeOff}
                aria-label={`Take ${r.name} off the price list`}
                title="Take off the price list"
                className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
              >
                <Svg d={SERVICE_ICONS.archive} />
              </button>
            )}
          </>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insights: what is on the list, what gets billed, and what is typed in by hand
// ---------------------------------------------------------------------------

function FilterRow({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
        on ? 'bg-brand-teal-light/60 font-semibold text-gray-900' : 'text-gray-700'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
    </button>
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
  money,
  category,
  show,
  unusedCount,
  onCategory,
  onShow,
  onAdd,
}: {
  data: ServicesPageData;
  money: (n: number) => string;
  category: ServiceCategory | '';
  show: ServiceShow;
  unusedCount: number;
  onCategory: (c: ServiceCategory) => void;
  onShow: (s: ServiceShow) => void;
  onAdd: (preset: ServicePreset) => void;
}) {
  const { rows, usage, can } = data;
  const active = rows.filter((r) => r.active);
  const byCategory = SERVICE_CATEGORIES.map((c) => ({ c, n: active.filter((r) => r.category === c).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxCat = Math.max(1, ...byCategory.map((x) => x.n));
  const offList = rows.length - active.length;

  const billed = rows.filter((r) => r.usage).sort((a, b) => b.usage!.amount - a.usage!.amount);
  const billedTotal = billed.reduce((s, r) => s + r.usage!.amount, 0);
  const billedLines = billed.reduce((s, r) => s + r.usage!.lines, 0);
  const top = billed.slice(0, 4);
  const maxTop = Math.max(1, ...top.map((r) => r.usage!.amount));

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className={`grid -mr-px -mb-px grid-cols-1 ${usage ? 'lg:grid-cols-3' : ''}`}>
        <Cell id="svc-list-h" title="On the price list">
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{active.length.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">services staff can bill</p>
          <ul className={`mt-3 space-y-1 ${usage ? '' : 'sm:grid sm:grid-cols-2 sm:gap-x-8 sm:space-y-0 lg:grid-cols-3'}`} role="group" aria-label="Filter by category">
            {byCategory.map(({ c, n }, i) => {
              const on = category === c;
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onCategory(c)}
                    aria-label={`${CATEGORY[c].plural}: ${n}${on ? ', filtering' : ''}`}
                    className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={on ? 'font-semibold text-gray-900' : 'text-gray-700'}>{CATEGORY[c].plural}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                      <span
                        className="motion-bar-grow block h-full rounded-r"
                        style={{ width: `${(n / maxCat) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: category && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {offList > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <FilterRow on={show === 'off-list'} onClick={() => onShow('off-list')} label="Taken off the list" n={offList} />
            </div>
          )}
        </Cell>

        {usage && (
          <Cell id="svc-billed-h" title={`Billed in the last ${USAGE_DAYS} days`}>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{money(billedTotal)}</p>
            <p className="mt-1 text-sm text-gray-500">
              from <span className="font-mono tabular-nums">{billedLines.toLocaleString('en-US')}</span> charges on the price list; refunds left out
            </p>
            {top.length > 0 ? (
              <ul className="mt-3 space-y-2.5" aria-label="Billed most">
                {top.map((r, i) => (
                  <li key={r._id}>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-700">{r.name}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{money(r.usage!.amount)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                      <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(r.usage!.amount / maxTop) * 100}%`, background: SERIES.teal, animationDelay: `${i * 50}ms` }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Nothing from the price list was billed in this time.</p>
            )}
            <div className="mt-2 border-t border-gray-100 pt-2">
              <FilterRow on={show === 'unused'} onClick={() => onShow('unused')} label={`Not billed in ${USAGE_DAYS} days`} n={unusedCount} />
            </div>
          </Cell>
        )}

        {usage && (
          <Cell id="svc-typed-h" title="Typed in by hand">
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
              {usage.typedLines.toLocaleString('en-US')}
              <span className="text-lg text-gray-500"> of {usage.totalLines.toLocaleString('en-US')}</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">charges entered without the price list, so their price is whatever was typed</p>
            {usage.typed.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-100" aria-label="Typed most often">
                {usage.typed.map((t) => (
                  <li key={t.label} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate text-gray-900">{t.label}</span>
                      <span className="block font-mono text-xs tabular-nums text-gray-500">
                        {times(t.lines)} · usually {money(t.typicalPrice)}
                      </span>
                    </span>
                    {t.sameAs ? (
                      <span className="shrink-0 text-xs text-gray-500">On the list</span>
                    ) : (
                      can.write && (
                        <button
                          type="button"
                          onClick={() => onAdd({ name: t.label, unitPrice: t.typicalPrice })}
                          aria-label={`Add ${t.label} to the price list`}
                          className={`shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                        >
                          Add
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Every charge in this time came from the price list.</p>
            )}
          </Cell>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// When a visit is closed: the consultation fee each visit type is billed
// ---------------------------------------------------------------------------

function VisitFees({
  data,
  fees,
  money,
  onSet,
}: {
  data: ServicesPageData;
  fees: { value: string; label: string; pick: ReturnType<typeof pickVisitFee<ServiceRow>> }[];
  money: (n: number) => string;
  onSet: (type: string, label: string) => void;
}) {
  const fallback = data.usage?.fallbackLines ?? 0;
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="svc-fees-h">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 id="svc-fees-h" className="font-bold tracking-tight text-gray-900">
          When a visit is closed
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">
          Closing a visit bills its consultation fee on its own. Each kind of visit uses the consultation set for it, or else one with its name in the
          service’s name.
        </p>
        {!data.autoBilling && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-700">
            <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
            <span>
              Automatic billing is off in{' '}
              <Link href="/admin/settings" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                Clinic settings
              </Link>
              , so nothing is billed when a visit closes; these fees apply once it’s back on.
            </span>
          </p>
        )}
      </div>
      <ul className="grid -mr-px -mb-px grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {fees.map((f) => (
          <li key={f.value} className="flex items-start justify-between gap-3 border-r border-b border-gray-200 px-5 py-3.5">
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-gray-900">{f.label}</span>
              {f.pick ? (
                <>
                  <span className="block truncate text-gray-700">
                    {f.pick.service.name} <span className="font-mono text-xs tabular-nums text-gray-500">{f.pick.service.code}</span>
                  </span>
                  <span className="block text-xs text-gray-500">{f.pick.how === 'set' ? 'Set on the service' : 'Matched by its name'}</span>
                </>
              ) : (
                <span className="block text-amber-800">Nothing set: bills a fixed {money(FALLBACK_VISIT_FEE)}</span>
              )}
            </span>
            {f.pick ? (
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900">{money(f.pick.service.unitPrice)}</span>
            ) : (
              data.can.write && (
                <button type="button" onClick={() => onSet(f.value, f.label)} aria-label={`Set the fee for ${f.label.toLowerCase()} visits`} className={`shrink-0 ${OUTLINE}`}>
                  Set a fee
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {fallback > 0 && (
        <p className="flex items-start gap-1.5 border-t border-gray-200 px-5 py-3 text-sm text-amber-800">
          <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
          In the last {USAGE_DAYS} days, <span className="font-mono tabular-nums">{fallback.toLocaleString('en-US')}</span>{' '}
          {fallback === 1 ? 'closed visit was' : 'closed visits were'} billed the fixed {money(FALLBACK_VISIT_FEE)} because no consultation matched.
        </p>
      )}
    </section>
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
        <Svg d={kind === 'narrowed' ? ICON.search : SERVICE_ICONS.tag} className="h-5 w-5" />
      </div>
      {kind === 'all-off' ? (
        <>
          <p className="font-semibold text-gray-900">Nothing is on the price list</p>
          <p className="mt-1 text-sm text-gray-500">Every service has been taken off. Put one back, or add a new one.</p>
          <button type="button" onClick={onShowOff} className={`mt-5 ${OUTLINE} px-4 py-2`}>
            Show what was taken off
          </button>
        </>
      ) : kind === 'narrowed' ? (
        <>
          <p className="font-semibold text-gray-900">No service matches</p>
          <p className="mt-1 text-sm text-gray-500">Check the spelling, or loosen a filter.</p>
          <button type="button" onClick={onClear} className={`mt-5 ${OUTLINE} px-4 py-2`}>
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">No services yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Add what the clinic charges for: consultations, procedures, tests. Staff pick them when billing, and closed visits are billed their consultation fee.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={SERVICE_ICONS.plus} />
              Add a service
            </button>
          )}
        </>
      )}
    </div>
  );
}
