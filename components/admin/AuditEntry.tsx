'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FOCUS_RING, Svg } from '../appointments/shared';
import { deviceLabel } from '@/lib/user-agent';
import { RESOURCE_LABEL, actionPhrase, recordHref, usefulDescription, type AuditChange, type AuditRow } from '@/lib/audit-log';

export const ENTRY_GRID =
  'lg:grid lg:grid-cols-[5.5rem_minmax(0,0.9fr)_minmax(0,2fr)_minmax(0,0.9fr)_6rem] lg:items-start lg:gap-4';

const CHEVRON = 'M19 9l-7 7-7-7';

/** Narrowing the list from inside an entry ("Only their entries"). */
export interface EntryFilters {
  onUser: (id: string) => void;
  onPatient: (p: { _id: string; name: string; code: string | null }) => void;
  onRecord: (resource: AuditRow['resource'], id: string) => void;
}

export function whoName(row: AuditRow, meId: string) {
  if (row.user._id && row.user._id === meId) return 'You';
  return row.user.name || row.user.email || 'Someone no longer on file';
}

export default function AuditEntry({
  row,
  meId,
  tz,
  index,
  open,
  onToggle,
  filters,
}: {
  row: AuditRow;
  meId: string;
  tz: string;
  index: number;
  open: boolean;
  onToggle: () => void;
  filters: EntryFilters;
}) {
  const at = new Date(row.at);
  const time = at.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const who = whoName(row, meId);
  const isYou = who === 'You';
  const refused = row.action === 'access_denied';
  const failed = !row.success && !refused;
  const href = recordHref(row.resource, row.resourceId, row.action);
  const detail = usefulDescription(row.description);
  const detailId = `audit-${row._id}`;

  const onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onToggle();
  };

  return (
    <li className="motion-row-in" style={{ animationDelay: `${Math.min(index * 16, 220)}ms` }}>
      <div onClick={onRowClick} className={`group flex cursor-pointer flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-50 ${ENTRY_GRID} ${open ? 'bg-gray-50' : ''}`}>
        <time dateTime={row.at} className="font-mono text-sm tabular-nums text-gray-700 lg:pt-px">
          {time}
        </time>

        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${row.user.name || isYou ? 'text-gray-900' : 'text-gray-600'}`}>{who}</span>
          {row.user.role && <span className="block truncate text-xs text-gray-500">{row.user.role}</span>}
        </span>

        <span className="min-w-0 text-sm">
          <span className="text-gray-900">
            <span className="lg:hidden">{who} </span>
            {actionPhrase(row.action, row.resource, row.success)}
            {row.patient && (
              <>
                {' '}
                <span className="text-gray-500">for</span>{' '}
                <Link href={`/patients/${row.patient._id}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  {row.patient.name}
                </Link>
              </>
            )}
            {row.patientMissing && <span className="text-gray-500"> for a patient no longer on file</span>}
          </span>
          {refused && <Badge tone="red">Refused</Badge>}
          {failed && <Badge tone="red">Didn’t go through</Badge>}
          {(row.errorMessage || detail) && (
            <span className={`mt-0.5 block text-sm ${open ? '' : 'lg:truncate'} ${row.errorMessage ? 'text-red-700' : 'text-gray-500'}`}>
              {row.errorMessage ?? detail}
            </span>
          )}
        </span>

        <span className="min-w-0 text-sm">
          {row.ipAddress && <span className="block truncate font-mono text-xs tabular-nums text-gray-700">{row.ipAddress}</span>}
          {row.userAgent && <span className="block truncate text-xs text-gray-500">{deviceLabel(row.userAgent)}</span>}
          {!row.ipAddress && !row.userAgent && <span className="hidden text-xs text-gray-400 lg:block">Not recorded</span>}
        </span>

        <span className="flex items-start gap-1 lg:justify-end">
          {href && (
            <Link
              href={href}
              aria-label={`Open the record (${RESOURCE_LABEL[row.resource] ?? row.resource})`}
              className={`rounded-md px-2 py-1 text-sm font-semibold text-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`}
            >
              Open
            </Link>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? 'Hide the details' : 'Show the details'}
            className={`rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            <span className={`block transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
              <Svg d={CHEVRON} />
            </span>
          </button>
        </span>
      </div>

      {open && <Details id={detailId} row={row} who={who} tz={tz} href={href} filters={filters} />}
    </li>
  );
}

function Badge({ tone, children }: { tone: 'red'; children: ReactNode }) {
  return (
    <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 align-[1px] text-xs font-semibold ring-1 ring-inset ${tone === 'red' ? 'bg-red-50 text-red-700 ring-red-200' : ''}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The whole entry
// ---------------------------------------------------------------------------

function Details({
  id,
  row,
  who,
  tz,
  href,
  filters,
}: {
  id: string;
  row: AuditRow;
  who: string;
  tz: string;
  href: string | null;
  filters: EntryFilters;
}) {
  const at = new Date(row.at);
  const when = `${at.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${at.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  const meta = row.metadata ? Object.entries(row.metadata).filter(([k]) => k !== 'clientReported') : [];
  const clientReported = row.metadata?.clientReported === true;
  const link = `rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`;

  return (
    <div id={id} className="motion-panel-in border-t border-gray-100 bg-gray-50/60 px-4 py-4 lg:pl-[calc(5.5rem+2rem)]">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <Fact label="When">
          <span className="font-mono tabular-nums">{when}</span>
          <span className="block text-xs text-gray-500">Clinic time ({tz})</span>
        </Fact>
        <Fact label="Who">
          {who}
          {row.user.email && row.user.email !== who && <span className="text-gray-500"> · {row.user.email}</span>}
          {row.user.role && <span className="text-gray-500"> · {row.user.role}</span>}
          {row.user._id && (
            <button type="button" onClick={() => filters.onUser(row.user._id!)} className={`mt-0.5 block ${link}`}>
              Only their entries
            </button>
          )}
        </Fact>
        {(row.patient || row.patientMissing) && (
          <Fact label="Patient">
            {row.patient ? (
              <>
                <Link href={`/patients/${row.patient._id}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  {row.patient.name}
                </Link>
                {row.patient.code && <span className="ml-1.5 font-mono text-xs text-gray-500">{row.patient.code}</span>}
                <button type="button" onClick={() => filters.onPatient(row.patient!)} className={`mt-0.5 block ${link}`}>
                  Only entries about them
                </button>
              </>
            ) : (
              <span className="text-gray-600">No longer on file</span>
            )}
          </Fact>
        )}
        <Fact label="Record">
          {RESOURCE_LABEL[row.resource] ?? row.resource}
          {row.resourceId && <span className="ml-1.5 break-all font-mono text-xs text-gray-500">{row.resourceId}</span>}
          <span className="mt-0.5 flex flex-wrap gap-x-4">
            {href && (
              <Link href={href} className={link}>
                Open it
              </Link>
            )}
            {row.resourceId && (
              <button type="button" onClick={() => filters.onRecord(row.resource, row.resourceId!)} className={link}>
                Only this record
              </button>
            )}
          </span>
        </Fact>
        <Fact label="From">
          {row.ipAddress ? <span className="font-mono tabular-nums">{row.ipAddress}</span> : <span className="text-gray-500">Address not recorded</span>}
          {row.userAgent && (
            <>
              <span className="text-gray-500"> · {deviceLabel(row.userAgent)}</span>
              <span className="mt-0.5 block break-all text-xs text-gray-500">{row.userAgent}</span>
            </>
          )}
        </Fact>
        {(row.requestMethod || row.requestPath) && (
          <Fact label="Request">
            <span className="break-all font-mono text-xs text-gray-700">{[row.requestMethod, row.requestPath].filter(Boolean).join(' ')}</span>
          </Fact>
        )}
        {row.description && (
          <Fact label="Details" wide>
            {row.description}
          </Fact>
        )}
        {row.errorMessage && (
          <Fact label="Problem" wide>
            <span className="text-red-700">{row.errorMessage}</span>
          </Fact>
        )}
        {clientReported && (
          <Fact label="Source" wide>
            Reported by the browser, not checked by the server
          </Fact>
        )}
      </dl>

      {row.changes.length > 0 && <Changes changes={row.changes} />}

      {meta.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm text-gray-500">Also recorded</h4>
          <dl className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {meta.map(([key, value]) => (
              <div key={key} className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <dt className="font-mono text-xs text-gray-500">{key}</dt>
                <dd className="break-all text-sm text-gray-900">
                  <Value value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function Changes({ changes }: { changes: AuditChange[] }) {
  return (
    <div className="mt-4">
      <h4 className="text-sm text-gray-500">
        What changed <span className="font-mono text-gray-400">{changes.length}</span>
      </h4>
      <div className="mt-1.5 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full table-fixed text-sm">
          <thead className="hidden bg-gray-50/60 text-left text-gray-500 sm:table-header-group">
            <tr>
              <th scope="col" className="w-1/4 px-3 py-2 font-medium">Field</th>
              <th scope="col" className="px-3 py-2 font-medium">Before</th>
              <th scope="col" className="px-3 py-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {changes.map((c, i) => (
              <tr key={`${c.field}-${i}`} className="flex flex-col gap-1 px-3 py-2 sm:table-row sm:p-0">
                <th scope="row" className="break-all text-left font-mono text-xs font-normal text-gray-700 sm:px-3 sm:py-2 sm:align-top">
                  {c.field}
                </th>
                <td className="break-all text-gray-600 sm:px-3 sm:py-2 sm:align-top">
                  <span className="text-xs text-gray-500 sm:hidden">Before: </span>
                  <Value value={c.oldValue} />
                </td>
                <td className="break-all text-gray-900 sm:px-3 sm:py-2 sm:align-top">
                  <span className="text-xs text-gray-500 sm:hidden">After: </span>
                  <Value value={c.newValue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A stored value in words: empty, Yes/No, or the value itself (structures as compact JSON). */
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-gray-400">empty</span>;
  }
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (typeof value === 'number') return <span className="font-mono tabular-nums">{value.toLocaleString('en-US')}</span>;
  if (typeof value === 'string') return <>{value.length > 400 ? `${value.slice(0, 400)}…` : value}</>;
  const json = JSON.stringify(value);
  return <span className="font-mono text-xs">{json.length > 400 ? `${json.slice(0, 400)}…` : json}</span>;
}
