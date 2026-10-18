'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { useSend } from './users-shared';
import RoomDialog, { type RoomPreset } from './RoomDialog';
import {
  ROOM_SHOWS,
  ROOM_SHOW_LABEL,
  ROOM_STATE,
  ROOM_TYPES,
  ROOM_TYPE_LABEL,
  ROOM_USAGE_DAYS,
  roomState,
  whereLine,
  type RoomRow,
  type RoomShow,
  type RoomState,
  type RoomType,
  type RoomsPageData,
} from '@/lib/rooms';

export const ROOM_ICONS = {
  ...ICON,
  plus: 'M12 5v14m7-7H5',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  door: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
};

const GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_10rem_5.5rem] lg:items-center lg:gap-4';
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const INSET_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal';

const SORTS = { name: 'By name', where: 'By building and floor', booked: 'Most booked' } as const;
type Sort = keyof typeof SORTS;

const STATE_ORDER: RoomState[] = ['in-use', 'free', 'maintenance', 'unavailable'];
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const n = (x: number) => x.toLocaleString('en-US');
const bookings = (x: number) => `${n(x)} ${x === 1 ? 'booking' : 'bookings'}`;

function matchesShow(r: RoomRow, show: RoomShow) {
  if (show === 'all') return true;
  if (show === 'unbooked') return r.status === 'available' && r.booked.past + r.booked.today === 0;
  return roomState(r) === show;
}

export default function RoomsPageClient({
  data,
  initialShow,
  initialType,
}: {
  data: RoomsPageData;
  initialShow: RoomShow;
  initialType: RoomType | '';
}) {
  const router = useRouter();
  const send = useSend('That didn’t go through');
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<RoomType | ''>(initialType);
  const [show, setShow] = useState<RoomShow>(initialShow);
  const [sort, setSort] = useState<Sort>('name');
  const [editing, setEditing] = useState<{ row: RoomRow | null; preset?: RoomPreset } | null>(null);
  const [removing, setRemoving] = useState<RoomRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const { rows: all, can } = data;

  const rows = useMemo(() => {
    const q = fold(search.trim());
    const out = all.filter((r) => {
      if (type && r.roomType !== type) return false;
      if (!matchesShow(r, show)) return false;
      if (!q) return true;
      return fold(`${r.name} ${r.roomNumber ?? ''} ${r.building ?? ''} ${r.equipment.join(' ')} ${r.amenities.join(' ')}`).includes(q);
    });
    const byName = (a: RoomRow, b: RoomRow) => a.name.localeCompare(b.name, undefined, { numeric: true });
    return out.sort((a, b) =>
      sort === 'booked'
        ? b.booked.past + b.booked.today - (a.booked.past + a.booked.today) || byName(a, b)
        : sort === 'where'
          ? (a.building ?? '￿').localeCompare(b.building ?? '￿') || (a.floor ?? 1e9) - (b.floor ?? 1e9) || byName(a, b)
          : byName(a, b)
    );
  }, [all, search, type, show, sort]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (type) chips.push({ key: 'type', label: `${ROOM_TYPE_LABEL[type]} rooms`, clear: () => setType('') });
  if (show !== 'all') chips.push({ key: 'show', label: ROOM_SHOW_LABEL[show], clear: () => setShow('all') });
  const narrowed = chips.length > 0 || search.trim() !== '';
  const clearAll = () => {
    setType('');
    setShow('all');
    setSearch('');
  };

  const refresh = () => startRefresh(() => router.refresh());
  const saved = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
    refresh();
  };

  const remove = async () => {
    if (!removing) return;
    const r = removing;
    setBusy(true);
    const result = await send(`/api/rooms/${r._id}`, 'DELETE');
    setBusy(false);
    setRemoving(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Removed ${r.name}.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const add = (preset?: RoomPreset) => setEditing({ row: null, preset });

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Rooms</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Where patients are seen, which rooms are free right now, and which are out of use.</p>
        </div>
        {can.write && (
          <button
            type="button"
            onClick={() => add(type ? { roomType: type } : undefined)}
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep sm:self-auto ${FOCUS_RING}`}
          >
            <Svg d={ROOM_ICONS.plus} />
            Add a room
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
          show={show}
          onShow={(s) => setShow((cur) => (cur === s ? 'all' : s))}
          onAdd={(label) => add({ name: label })}
        />
      )}

      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form role="search" className="relative flex-1" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="room-search" className="sr-only">
                Search rooms
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICON.search} />
              </span>
              <input
                id="room-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, number, building or equipment"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
              <label htmlFor="room-type" className="sr-only">
                Kind of room
              </label>
              <select id="room-type" value={type} onChange={(e) => setType(e.target.value as RoomType | '')} className={`${FIELD} lg:w-44`}>
                <option value="">Every kind of room</option>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ROOM_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <label htmlFor="room-show" className="sr-only">
                Show
              </label>
              <select id="room-show" value={show} onChange={(e) => setShow(e.target.value as RoomShow)} className={`${FIELD} lg:w-52`}>
                {ROOM_SHOWS.map((s) => (
                  <option key={s} value={s}>
                    {ROOM_SHOW_LABEL[s]}
                  </option>
                ))}
              </select>
              <label htmlFor="room-sort" className="sr-only">
                Sort
              </label>
              <select id="room-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${FIELD} lg:w-52`}>
                {(Object.keys(SORTS) as Sort[]).map((s) => (
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
        {`${rows.length} ${rows.length === 1 ? 'room' : 'rooms'}${narrowed ? ' match' : ''}.`}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={refreshing}>
        {rows.length > 0 && (
          <div className={`hidden ${GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Room</span>
            <span>Right now</span>
            <span>Bookings naming it</span>
            <span className="sr-only">Actions</span>
          </div>
        )}

        {rows.length === 0 ? (
          <Empty none={all.length === 0} canAdd={can.write} onClear={clearAll} onAdd={() => add()} />
        ) : (
          <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {rows.map((r, i) => (
              <RoomItem key={r._id} r={r} index={i} canWrite={can.write} onEdit={() => setEditing({ row: r })} onRemove={() => setRemoving(r)} />
            ))}
          </ul>
        )}

        {all.length > 0 && (
          <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
            {narrowed ? (
              <>
                <span className="font-mono text-gray-900">{rows.length}</span> of <span className="font-mono text-gray-900">{all.length}</span> rooms match
              </>
            ) : (
              <>
                <span className="font-mono text-gray-900">{all.length}</span> {all.length === 1 ? 'room' : 'rooms'}
              </>
            )}
          </p>
        )}
      </div>

      {editing && <RoomDialog row={editing.row} preset={editing.preset} rows={all} onClose={() => setEditing(null)} onSaved={saved} />}

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && !busy && setRemoving(null)}
            title={`Remove ${removing.name}?`}
            description={
              <span className="block space-y-2">
                <span className="block">No patient has been seen in it, so nothing points to it. It goes from this list for good.</span>
                {removing.booked.today + removing.booked.ahead > 0 && (
                  <span className="block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                    {bookings(removing.booked.today + removing.booked.ahead)} from today on still name it; they keep the name as written.
                  </span>
                )}
              </span>
            }
          >
            <button type="button" onClick={() => setRemoving(null)} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
              Keep it
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              aria-busy={busy}
              className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              {busy ? 'Removing…' : 'Remove the room'}
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

function StateBadge({ state }: { state: RoomState }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ROOM_STATE[state].badge}`}>{ROOM_STATE[state].label}</span>;
}

function RoomItem({ r, index, canWrite, onEdit, onRemove }: { r: RoomRow; index: number; canWrite: boolean; onEdit: () => void; onRemove: () => void }) {
  const state = roomState(r);
  const closed = r.status !== 'available';
  const details = [ROOM_TYPE_LABEL[r.roomType], whereLine(r), r.capacity ? `fits ${r.capacity}` : null].filter(Boolean).join(' · ');
  const kit = [...r.equipment, ...r.amenities];
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if (!canWrite || (e.target as HTMLElement).closest('a,button')) return;
    onEdit();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex flex-col gap-2 px-4 py-3 transition-colors ${state === 'in-use' ? 'bg-brand-teal-light/25 hover:bg-brand-teal-light/40' : 'hover:bg-gray-50'} ${canWrite ? 'cursor-pointer' : ''} ${GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {canWrite ? (
            <button type="button" onClick={onEdit} className={`max-w-full truncate rounded text-left font-semibold ${closed ? 'text-gray-600' : 'text-gray-900'} hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {r.name}
            </button>
          ) : (
            <span className={`truncate font-semibold ${closed ? 'text-gray-600' : 'text-gray-900'}`}>{r.name}</span>
          )}
          {r.roomNumber && <span className="font-mono text-xs tabular-nums text-gray-500">No. {r.roomNumber}</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-gray-500">{details}</span>
        {kit.length > 0 && (
          <span className="mt-0.5 block truncate text-sm text-gray-700" title={kit.join(', ')}>
            {kit.slice(0, 4).join(', ')}
            {kit.length > 4 && <span className="text-gray-500"> and {kit.length - 4} more</span>}
          </span>
        )}
        {r.notes && <span className="mt-0.5 block truncate text-sm italic text-gray-500">{r.notes}</span>}
      </span>

      <span className="min-w-0 text-sm">
        <StateBadge state={state} />
        {r.inUse.map((o) => (
          <span key={o.queueNumber} className="mt-1 block truncate text-gray-700">
            <span className="font-mono tabular-nums text-gray-900">{o.queueNumber}</span>
            {o.doctor && <> with {o.doctor}</>}
            {o.since && (
              <span className="text-gray-500">
                {' '}
                · since <span className="font-mono tabular-nums">{o.since}</span>
              </span>
            )}
          </span>
        ))}
        {r.waiting > 0 && (
          <span className="mt-1 block text-gray-600">
            <span className="font-mono tabular-nums">{r.waiting}</span> waiting for it
          </span>
        )}
        {closed && r.booked.today + r.booked.ahead > 0 && (
          <span className="mt-1 flex items-start gap-1.5 text-amber-800">
            <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Still named on {bookings(r.booked.today + r.booked.ahead)} from today on
          </span>
        )}
      </span>

      <span className="text-sm">
        {r.booked.today + r.booked.ahead + r.booked.past === 0 ? (
          <span className="text-gray-500">None in {ROOM_USAGE_DAYS} days</span>
        ) : (
          <>
            <span className="block font-mono tabular-nums text-gray-900">
              {n(r.booked.today)} today{r.booked.ahead > 0 && <span className="text-gray-600"> · {n(r.booked.ahead)} later</span>}
            </span>
            <span className="block text-gray-500">
              <span className="font-mono tabular-nums">{n(r.booked.past)}</span> in the last {ROOM_USAGE_DAYS} days
            </span>
          </>
        )}
        {r.consults > 0 && (
          <span className="block text-gray-500">
            <span className="font-mono tabular-nums">{n(r.consults)}</span> {r.consults === 1 ? 'consultation' : 'consultations'} from the queue
          </span>
        )}
      </span>

      <span className="flex items-center gap-1 lg:justify-end">
        {canWrite && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${r.name}`}
            className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ROOM_ICONS.edit} />
          </button>
        )}
        {canWrite && r.history === 0 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${r.name}`}
            title="Remove the room"
            className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ROOM_ICONS.trash} />
          </button>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insights: what is ready now, which rooms bookings use, and rooms written that aren't here
// ---------------------------------------------------------------------------

function FilterRow({ on, onClick, label, count, tone }: { on: boolean; onClick: () => void; label: ReactNode; count: number; tone?: 'amber' }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 ${INSET_RING} ${
        on ? 'bg-brand-teal-light/60 font-semibold text-gray-900' : tone === 'amber' && count > 0 ? 'text-amber-800' : 'text-gray-700'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">{label}</span>
      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n(count)}</span>
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

const SWATCH: Record<RoomState, string> = {
  'in-use': 'bg-brand-teal-dark',
  free: 'bg-emerald-600',
  maintenance: 'bg-amber-600',
  unavailable: 'bg-white ring-1 ring-inset ring-gray-400',
};

function Insights({ data, show, onShow, onAdd }: { data: RoomsPageData; show: RoomShow; onShow: (s: RoomShow) => void; onAdd: (label: string) => void }) {
  const { rows, typed, can } = data;
  const count = (s: RoomState) => rows.filter((r) => roomState(r) === s).length;
  const open = rows.filter((r) => r.status === 'available').length;
  const unbooked = rows.filter((r) => matchesShow(r, 'unbooked')).length;

  const ranked = rows
    .map((r) => ({ r, used: r.booked.past + r.booked.today }))
    .filter((x) => x.used > 0)
    .sort((a, b) => b.used - a.used)
    .slice(0, 5);
  const max = Math.max(1, ...ranked.map((x) => x.used));
  const onList = rows.reduce((s, r) => s + r.booked.past + r.booked.today + r.booked.ahead, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
          <Cell id="room-ready-h" title="Open for patients">
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
              {n(open)}
              <span className="text-lg text-gray-500"> of {n(rows.length)}</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">rooms; who is in them comes from the queue</p>
            <div className="mt-3 space-y-0.5" role="group" aria-label="Filter by what the room is doing">
              {STATE_ORDER.map((s) => (
                <FilterRow
                  key={s}
                  on={show === s}
                  onClick={() => onShow(s)}
                  tone={s === 'maintenance' ? 'amber' : undefined}
                  count={count(s)}
                  label={
                    <>
                      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SWATCH[s]}`} />
                      {ROOM_STATE[s].label}
                    </>
                  }
                />
              ))}
            </div>
          </Cell>

          <Cell id="room-booked-h" title={`Named on bookings, last ${ROOM_USAGE_DAYS} days`}>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{n(onList)}</p>
            <p className="mt-1 text-sm text-gray-500">bookings name a room on this list, including ones still to come</p>
            {ranked.length > 0 ? (
              <ul className="mt-3 space-y-2.5" aria-label="Booked most, up to today">
                {ranked.map(({ r, used }, i) => (
                  <li key={r._id}>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-700">{r.name}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n(used)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                      <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(used / max) * 100}%`, background: SERIES.teal, animationDelay: `${i * 50}ms` }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No booking up to today names one of these rooms.</p>
            )}
            <div className="mt-2 border-t border-gray-100 pt-2">
              <FilterRow on={show === 'unbooked'} onClick={() => onShow('unbooked')} label={`Open, not booked in ${ROOM_USAGE_DAYS} days`} count={unbooked} />
            </div>
          </Cell>

          <Cell id="room-typed-h" title="Written on bookings, not on this list">
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
              {n(data.bookingsWithRoom - onList)}
              <span className="text-lg text-gray-500"> of {n(data.bookingsWithRoom)}</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">bookings with a room typed that matches no room’s name or number</p>
            {typed.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-100" aria-label="Typed most often">
                {typed.map((t) => (
                  <li key={t.label} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate text-gray-900">“{t.label}”</span>
                      <span className="block font-mono text-xs tabular-nums text-gray-500">{bookings(t.bookings)}</span>
                    </span>
                    {can.write && (
                      <button
                        type="button"
                        onClick={() => onAdd(t.label)}
                        aria-label={`Add ${t.label} as a room`}
                        className={`shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                      >
                        Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                {data.bookingsWithRoom === 0 ? 'No booking in this time names a room.' : 'Every room named on a booking is on this list.'}
              </p>
            )}
          </Cell>
        </div>
      </div>
      <AssignLine data={data} />
    </div>
  );
}

/** How a patient ends up in a room, stated from the settings that decide it. */
function AssignLine({ data }: { data: RoomsPageData }) {
  const on = data.autoAssign && data.queueOptimisation;
  return (
    <p className="flex items-start gap-1.5 px-1 text-sm text-gray-600">
      <Svg d={on ? ICON.check : ROOM_ICONS.door} className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
      <span>
        {on ? (
          <>
            When a patient’s consultation starts without a room, the queue gives them a free, open room.{' '}
            <span className="font-mono tabular-nums">{n(data.roomedConsults)}</span> {data.roomedConsults === 1 ? 'consultation was' : 'consultations were'} given one in
            the last {ROOM_USAGE_DAYS} days.
          </>
        ) : (
          <>
            Rooms aren’t given to patients automatically; staff write one on a booking. To have the queue hand out free rooms, turn on{' '}
            {!data.autoAssign && !data.queueOptimisation ? '“Auto assign rooms” and queue optimisation' : !data.autoAssign ? '“Auto assign rooms”' : 'queue optimisation'} in{' '}
            <Link href="/admin/settings" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Clinic settings
            </Link>
            .
          </>
        )}
      </span>
    </p>
  );
}

function Empty({ none, canAdd, onClear, onAdd }: { none: boolean; canAdd: boolean; onClear: () => void; onAdd: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={none ? ROOM_ICONS.door : ICON.search} className="h-5 w-5" />
      </div>
      {none ? (
        <>
          <p className="font-semibold text-gray-900">No rooms yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Add the rooms patients are seen in. Staff can then name them on bookings, and the queue can give a free room to the next patient.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ROOM_ICONS.plus} />
              Add a room
            </button>
          )}
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">No room matches</p>
          <p className="mt-1 text-sm text-gray-500">Check the spelling, or loosen a filter.</p>
          <button type="button" onClick={onClear} className={`mt-5 ${OUTLINE} px-4 py-2`}>
            Clear search and filters
          </button>
        </>
      )}
    </div>
  );
}
