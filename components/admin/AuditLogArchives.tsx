'use client';

import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FOCUS_RING, Svg } from '../appointments/shared';

interface ArchiveRow {
  id: string;
  month: string;
  entries: number;
  bytes: number;
}

interface ArchivesData {
  archives: ArchiveRow[];
  keepInDatabaseDays: number;
  keepArchiveDays: number;
  storageConfigured: boolean;
}

const DOWNLOAD_ICON = 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4';

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Months moved out of the log into archive files (lib/audit-archive.ts), each downloadable. */
export default function AuditLogArchives() {
  const archives = useKeyedFetch<ArchivesData>('/api/audit-logs/archives');
  const data = archives.value;
  const years = data ? Math.round(data.keepArchiveDays / 365) : 5;

  return (
    <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="audit-archives-h">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 id="audit-archives-h" className="text-base font-semibold text-gray-900">
          Archived months
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Finished months older than about {data ? Math.round(data.keepInDatabaseDays / 30) : 3} months move out of the list
          above into a file, kept for {years} years. Each file holds every entry of that month as gzipped JSON lines.
        </p>
      </div>

      {archives.error ? (
        <p className="px-5 py-4 text-sm text-gray-500">
          The archived months didn’t load ({archives.error}).{' '}
          <button type="button" onClick={archives.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Try again
          </button>
        </p>
      ) : !data ? (
        <div className="m-5 h-16 animate-pulse rounded-md bg-gray-100" aria-hidden="true" />
      ) : data.archives.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">
          {data.storageConfigured
            ? 'Nothing archived yet. Older months move here when the weekly job runs.'
            : 'Archiving isn’t set up yet, so every entry stays in the list above.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.archives.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{monthLabel(a.month)}</p>
                <p className="text-sm text-gray-500">
                  <span className="font-mono">{a.entries.toLocaleString('en-US')}</span> entries ·{' '}
                  <span className="font-mono">{sizeLabel(a.bytes)}</span>
                </p>
              </div>
              <a
                href={`/api/audit-logs/archives/${a.id}`}
                download
                className={`inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={DOWNLOAD_ICON} />
                Download
                <span className="sr-only"> {monthLabel(a.month)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
