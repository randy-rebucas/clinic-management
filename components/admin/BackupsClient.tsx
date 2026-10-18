'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { AlertDialog, Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import {
  BACKUP_STALE_DAYS,
  HEADLINE_COLLECTIONS,
  MAX_BACKUP_BYTES,
  NEAR_BACKUP_LIMIT,
  collectionWords,
  sizeLabel,
  type BackupRow,
  type BackupSummary,
} from '@/lib/backups';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const ICONS = {
  ...ICON,
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
};
const PRIMARY = `inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const SECONDARY = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function ago(iso: string, now: number) {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** "120 patients · 340 visits · 98 invoices", then "and 9 other kinds of record". */
function contents(b: BackupRow): string {
  if (!b.counts) return b.collections.length ? `${b.collections.length} kinds of record` : 'Nothing recorded';
  const names = Object.keys(b.counts);
  const head = HEADLINE_COLLECTIONS.filter((n) => b.counts![n]).slice(0, 3);
  const rest = names.filter((n) => !head.includes(n)).length;
  const parts = head.map((n) => collectionWords(n, b.counts![n]));
  if (rest) parts.push(`${rest} other ${rest === 1 ? 'kind' : 'kinds'} of record`);
  return parts.join(' · ');
}

export default function BackupsClient({ meId }: { meId: string }) {
  const [page, setPage] = useState(1);
  const [making, setMaking] = useState(false);
  const [removing, setRemoving] = useState<BackupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const list = useKeyedFetch<BackupRow[]>(`/api/backups?page=${page}&limit=${PAGE_SIZE}`);
  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const summary = (list.raw?.summary as BackupSummary | undefined) ?? null;
  const pages = (list.raw?.pagination as { pages?: number } | undefined)?.pages ?? 1;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const res = await fetch(`/api/backups/${removing._id}`, { method: 'DELETE' }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && json?.success) {
      setNotice({ tone: 'ok', text: `Deleted the backup from ${when(removing.createdAt)}. Files you downloaded from it are not affected.` });
      setRemoving(null);
      list.reload();
    } else {
      setNotice({ tone: 'error', text: json?.error || 'The backup couldn’t be deleted. Try again.' });
      setRemoving(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Backups</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Copies of the clinic’s records, to download and keep somewhere safe.</p>
        </div>
        <button type="button" onClick={() => setMaking(true)} className={PRIMARY}>
          <Svg d={ICONS.archive} />
          Make a backup
        </button>
      </header>

      <p className="-mt-3 max-w-3xl text-sm text-gray-500">
        A backup holds every record of this clinic except passwords, sign-in codes and device tokens. It is stored in the same database as the records,
        so it protects against mistakes, not against losing the database: download it to keep a copy elsewhere. Making, downloading and deleting
        backups are recorded in the audit log.
      </p>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-4 ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="flex items-start gap-2 text-sm font-medium">
            <Svg d={notice.tone === 'error' ? ICONS.alert : ICONS.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      {summary ? (
        <Figures summary={summary} now={list.receivedAt} />
      ) : (
        !list.error && <div className="h-[148px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
      )}

      {list.error && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">The backups didn’t load ({list.error}).</p>
          <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.8fr)_5rem_auto] lg:gap-4 border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500">
          <span>Made</span>
          <span>By</span>
          <span>What’s in it</span>
          <span className="text-right">Size</span>
          <span className="sr-only">Actions</span>
        </div>

        {!loaded ? (
          list.error ? null : (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-4">
                  <span className="h-3.5 w-36 rounded bg-gray-100" />
                  <span className="h-3.5 flex-1 rounded bg-gray-50" />
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
              <Svg d={ICONS.archive} className="h-5 w-5" />
            </div>
            <p className="font-semibold text-gray-900">No backups yet</p>
            <p className="mt-1 text-sm text-gray-500">Make one, then download it and keep the file somewhere other than this server.</p>
            <button type="button" onClick={() => setMaking(true)} className={`mt-5 ${PRIMARY}`}>
              Make a backup
            </button>
          </div>
        ) : (
          <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${list.loading ? 'opacity-60' : ''}`}>
            {rows.map((b, i) => {
              const failed = b.status !== 'completed';
              const by = b.createdBy._id === meId ? 'You' : b.createdBy.name || b.createdBy.email || 'Someone no longer on file';
              return (
                <li
                  key={b._id}
                  className="motion-row-in group flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:bg-gray-50 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.8fr)_5rem_auto] lg:items-center lg:gap-4"
                  style={{ animationDelay: `${Math.min(i * 30, 220)}ms` }}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm tabular-nums text-gray-900">{when(b.createdAt)}</span>
                    {b.label && <span className="block truncate text-sm text-gray-500">{b.label}</span>}
                  </span>
                  <span className="truncate text-sm text-gray-700">
                    <span className="text-gray-500 lg:hidden">By </span>
                    {by}
                  </span>
                  <span className="min-w-0 text-sm text-gray-700">
                    {failed ? (
                      <>
                        <span className="inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">Didn’t finish</span>
                        {b.errorMessage && <span className="mt-0.5 block text-red-700">{b.errorMessage}</span>}
                      </>
                    ) : (
                      <>
                        {contents(b)}
                        <span className="block text-xs text-gray-500">
                          <span className="font-mono">{b.totalDocuments.toLocaleString('en-US')}</span> records in all
                        </span>
                      </>
                    )}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-gray-700 lg:text-right">{sizeLabel(b.sizeBytes)}</span>
                  <span className="flex items-center gap-1 lg:justify-end">
                    {!failed && (
                      <a href={`/api/backups/${b._id}/download`} download className={SECONDARY}>
                        <Svg d={ICONS.download} />
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemoving(b)}
                      aria-label={`Delete the backup from ${when(b.createdAt)}`}
                      className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.trash} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {loaded && pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-600">
              Page <span className="font-mono text-gray-900">{page}</span> of <span className="font-mono text-gray-900">{pages}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || list.loading}
                aria-label="Newer backups"
                className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
              >
                <Svg d={ICONS.chevL} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages || list.loading}
                aria-label="Older backups"
                className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
              >
                <Svg d={ICONS.chevR} />
              </button>
            </div>
          </nav>
        )}
      </div>

      {making && (
        <MakeDialog
          lastBytes={summary?.last?.sizeBytes ?? null}
          onClose={() => setMaking(false)}
          onDone={(text) => {
            setMaking(false);
            setNotice({ tone: 'ok', text });
            setPage(1);
            list.reload();
          }}
        />
      )}

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && !busy && setRemoving(null)}
            title={`Delete the backup from ${when(removing.createdAt)}?`}
            description="The copy stored in the app is removed for good. Files already downloaded from it are not affected."
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
              {busy ? 'Deleting…' : 'Delete the backup'}
            </button>
          </AlertDialog>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Figures: the last backup, what's kept, and how close the clinic is to the limit
// ---------------------------------------------------------------------------

function Figures({ summary, now }: { summary: BackupSummary; now: number }) {
  const last = summary.last;
  const stale = !last || now - new Date(last.at).getTime() > BACKUP_STALE_DAYS * DAY_MS;
  const share = last ? Math.min(1, last.sizeBytes / MAX_BACKUP_BYTES) : 0;
  const near = share >= NEAR_BACKUP_LIMIT;
  const full = share >= 1;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 sm:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5">
          <h2 className="text-sm text-gray-600">Last backup</h2>
          <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${last ? 'text-gray-900' : 'text-gray-500'}`}>{last ? ago(last.at, now) : 'None yet'}</p>
          <p className={`mt-1 text-sm ${stale ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
            {!last ? 'The clinic has never been backed up here' : stale ? `More than ${BACKUP_STALE_DAYS} days ago: make a new one` : when(last.at)}
          </p>
        </section>
        <section className="border-r border-b border-gray-200 p-5">
          <h2 className="text-sm text-gray-600">Kept here</h2>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-gray-900">{summary.total.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {summary.total === 1 ? 'backup' : 'backups'}, <span className="font-mono">{sizeLabel(summary.storedBytes)}</span> in the database
          </p>
        </section>
        <section className="border-r border-b border-gray-200 p-5">
          <h2 className="text-sm text-gray-600">Size against the limit</h2>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-gray-900">
            {last ? sizeLabel(last.sizeBytes) : '—'}
            <span className="text-base text-gray-500"> of {sizeLabel(MAX_BACKUP_BYTES)}</span>
          </p>
          <div
            role="meter"
            aria-label="Last backup's size against the in-app limit"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share * 100)}
            aria-valuetext={`${Math.round(share * 100)}% of the limit`}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
          >
            <div
              className="motion-bar-grow h-full rounded-full"
              style={{ width: `${share * 100}%`, background: full ? '#BE123C' : near ? '#D97706' : SERIES.teal }}
            />
          </div>
          <p className={`mt-2 text-sm ${near ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
            {near
              ? 'Close to the limit: soon the clinic will need database-level backups (Atlas snapshots or scripts/backup)'
              : 'An in-app backup can hold up to this much'}
          </p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Make a backup
// ---------------------------------------------------------------------------

function MakeDialog({ lastBytes, onClose, onDone }: { lastBytes: number | null; onClose: () => void; onDone: (text: string) => void }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() || undefined }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && json?.success) {
      onDone(`Backup made: ${Number(json.data.totalDocuments).toLocaleString('en-US')} records, ${sizeLabel(json.data.sizeBytes)}. Download it to keep a copy elsewhere.`);
    } else {
      setError(json?.error || 'The backup couldn’t be made. Try again.');
    }
  };

  return createPortal(
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} labelledBy="make-backup-title" closeOnBackdrop={!busy} closeOnEscape={!busy}>
      <form onSubmit={make}>
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 id="make-backup-title" className="text-base font-bold tracking-tight text-gray-900">
            Make a backup
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Copies every record of the clinic now{lastBytes ? `; the last one was ${sizeLabel(lastBytes)}` : ''}. It can take a minute.
          </p>
        </div>
        <div className="px-5 py-4">
          <label htmlFor="backup-label" className="mb-1.5 block text-sm font-medium text-gray-700">
            What it’s for <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="backup-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
            placeholder="Before changing the price list"
            autoComplete="off"
            disabled={busy}
            className={FIELD}
          />
          {error && (
            <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60 ${FOCUS_RING}`}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
            {busy ? 'Making the backup…' : 'Make the backup'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body
  );
}
