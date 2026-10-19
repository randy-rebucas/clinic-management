'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import HmoDialog from './HmoDialog';
import { BATCH_STATUS, HMO_KIND_LABEL, type BatchStatus, type HmoRow } from '@/lib/hmo';

interface OpenClaim {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;
  patientName: string;
  provider: string;
  hmoId: string | null;
  memberId: string;
  loaNumber: string;
  amount: number;
  problem: string | null;
}
interface BatchRow {
  _id: string;
  hmoId: string;
  hmoName: string;
  batchNumber: string;
  status: BatchStatus;
  claims: number;
  totalClaimed: number;
  received: number;
  outstanding: number;
  submittedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
}
type Tab = 'open' | 'batches' | 'hmos';
const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'To send' },
  { key: 'batches', label: 'Transmittals' },
  { key: 'hmos', label: 'HMOs' },
];

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const OUTLINE = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));

/**
 * HMO claims: what is billed to HMOs and not yet sent, the transmittals sent and what each still
 * owes, and the list of HMOs the clinic bills.
 */
export default function HmoClaimsClient({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const queue = useKeyedFetch<{ open: OpenClaim[]; batches: BatchRow[] }>('/api/hmo-claims');
  const hmos = useKeyedFetch<HmoRow[]>('/api/hmos');
  const [notice, setNotice] = useState<string | null>(null);
  const { money: moneyLine } = useMoney();

  const openCount = queue.value?.open.length ?? 0;
  const waiting = queue.value?.batches.filter((b) => b.status === 'submitted' || b.status === 'partial') ?? [];

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">HMO claims</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">Send claims to HMOs in transmittals, then match what each HMO pays, and the tax it withholds, to the invoices.</p>
      </header>

      {queue.value && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
          <Figure label="Claims to send" value={String(openCount)} sub={moneyLine(queue.value.open.reduce((s, c) => s + c.amount, 0))} />
          <Figure label="Transmittals waiting" value={String(waiting.length)} sub={moneyLine(waiting.reduce((s, b) => s + b.outstanding, 0)) + ' still owed'} />
          <Figure label="Past due" value={String(waiting.filter((b) => b.overdue).length)} sub="beyond the HMO’s payment terms" attention={waiting.some((b) => b.overdue)} />
          <Figure label="Received" value={moneyLine(queue.value.batches.reduce((s, b) => s + b.received, 0))} sub="paid and withheld, all transmittals" />
        </dl>
      )}

      <div role="tablist" aria-label="HMO claims" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'border-brand-teal-dark text-brand-teal-deep' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}
            >
              {t.label}
              {t.key === 'open' && openCount > 0 && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">{openCount}</span>}
            </button>
          );
        })}
      </div>

      {notice && (
        <p role="status" className="motion-panel-in flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`rounded ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </p>
      )}

      {(queue.error || hmos.error) && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          <p>This page didn’t load ({queue.error || hmos.error}).</p>
          <button
            type="button"
            onClick={() => {
              queue.reload();
              hmos.reload();
            }}
            className={`inline-flex items-center gap-1.5 rounded font-semibold ${FOCUS_RING}`}
          >
            <Svg d={ICON.refresh} />
            Try again
          </button>
        </div>
      )}

      {tab === 'open' && <OpenClaims claims={queue.value?.open ?? null} hmos={hmos.value ?? []} onCreated={() => queue.reload()} />}
      {tab === 'batches' && <Batches rows={queue.value?.batches ?? null} />}
      {tab === 'hmos' && (
        <HmoList
          rows={hmos.value ?? null}
          onSaved={(m) => {
            setNotice(m);
            hmos.reload();
            queue.reload();
          }}
        />
      )}
    </div>
  );
}

function Figure({ label, value, sub, attention }: { label: string; value: string; sub: string; attention?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${attention ? 'text-red-700' : 'text-gray-900'}`}>{value}</dd>
      <dd className="mt-0.5 text-xs text-gray-500">{sub}</dd>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
        <h2 className="text-base font-bold tracking-tight text-gray-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-gray-500">{children}</p>;
}

function Skeleton() {
  return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------

function OpenClaims({ claims, hmos, onCreated }: { claims: OpenClaim[] | null; hmos: HmoRow[]; onCreated: () => void }) {
  const { money } = useMoney();
  const router = useRouter();
  const send = useSend('The transmittal couldn’t be made');
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; hmo: HmoRow | null; provider: string; claims: OpenClaim[] }>();
    for (const c of claims ?? []) {
      const key = c.hmoId ?? `name:${c.provider.toLowerCase()}`;
      const g = m.get(key) ?? { key, hmo: hmos.find((h) => h._id === c.hmoId) ?? null, provider: c.provider, claims: [] };
      g.claims.push(c);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => Number(!a.hmo) - Number(!b.hmo) || b.claims.length - a.claims.length);
  }, [claims, hmos]);

  if (!claims) return <Skeleton />;
  if (!claims.length)
    return (
      <Panel title="Claims to send">
        <Empty>Nothing waiting. Claims appear here when an invoice is billed to an HMO.</Empty>
      </Panel>
    );

  const create = async (hmoId: string, ids: string[]) => {
    setBusy(hmoId);
    setError(null);
    const r = await send('/api/hmo-claims', 'POST', { hmo: hmoId, invoices: ids });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCreated();
    router.push(`/hmo-claims/${(r.data as { _id: string })._id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
      {groups.map((g) => {
        const ready = g.claims.filter((c) => !c.problem);
        const sel = picked[g.key] ?? new Set(ready.map((c) => c.invoiceId));
        const chosen = ready.filter((c) => sel.has(c.invoiceId));
        const toggle = (id: string) =>
          setPicked((p) => {
            const next = new Set(sel);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { ...p, [g.key]: next };
          });
        return (
          <Panel
            key={g.key}
            title={g.hmo?.name ?? g.provider}
            aside={
              g.hmo ? (
                <button type="button" disabled={!chosen.length || busy !== null} onClick={() => create(g.hmo!._id, chosen.map((c) => c.invoiceId))} className={PRIMARY}>
                  {busy === g.hmo._id ? 'Making…' : `Put ${chosen.length} in a transmittal · ${money(chosen.reduce((s, c) => s + c.amount, 0))}`}
                </button>
              ) : (
                <span className="text-sm text-amber-800">Not on the HMO list; add it there, then pick it on these invoices.</span>
              )
            }
          >
            <ul className="divide-y divide-gray-100">
              {g.claims.map((c) => (
                <li key={c.invoiceId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-3 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Include ${c.patientName}, ${c.invoiceNumber}`}
                    disabled={Boolean(c.problem) || !g.hmo}
                    checked={!c.problem && Boolean(g.hmo) && sel.has(c.invoiceId)}
                    onChange={() => toggle(c.invoiceId)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal disabled:opacity-40"
                  />
                  <div className="min-w-0">
                    <Link href={`/invoices/${c.invoiceId}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {c.patientName}
                    </Link>
                    <p className="mt-0.5 truncate text-gray-500">
                      <span className="font-mono text-xs">{c.invoiceNumber}</span> · {shortDate(c.createdAt)}
                      {c.memberId && <span className="font-mono text-xs"> · member {c.memberId}</span>}
                      {c.loaNumber && <span className="font-mono text-xs"> · LOA {c.loaNumber}</span>}
                    </p>
                    {c.problem && <p className="mt-1 text-xs font-medium text-amber-800">{c.problem}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</p>
                    <p className={`font-mono text-xs tabular-nums ${daysSince(c.createdAt) > 30 ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>{daysSince(c.createdAt)} days</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function Batches({ rows }: { rows: BatchRow[] | null }) {
  const { money } = useMoney();
  if (!rows) return <Skeleton />;
  return (
    <Panel title="Transmittals">
      {rows.length === 0 ? (
        <Empty>No transmittals yet. Make one from the claims to send.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                <th scope="col" className="px-5 py-2.5 font-medium">Transmittal</th>
                <th scope="col" className="px-3 py-2.5 font-medium">HMO</th>
                <th scope="col" className="px-3 py-2.5 font-medium">State</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Claimed</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Received</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Still owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((b) => (
                <tr key={b._id}>
                  <th scope="row" className="px-5 py-2.5 text-left">
                    <Link href={`/hmo-claims/${b._id}`} className={`rounded font-mono font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {b.batchNumber}
                    </Link>
                    <span className="block text-xs font-normal text-gray-500">
                      {b.claims} {b.claims === 1 ? 'claim' : 'claims'} · {b.submittedAt ? `sent ${shortDate(b.submittedAt)}` : `made ${shortDate(b.createdAt)}`}
                    </span>
                  </th>
                  <td className="px-3 py-2.5 text-gray-900">{b.hmoName}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BATCH_STATUS[b.status].badge}`}>{BATCH_STATUS[b.status].label}</span>
                    {b.overdue && <span className="ml-1.5 text-xs font-semibold text-red-700">Past due {b.dueAt && shortDate(b.dueAt)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(b.totalClaimed)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(b.received)}</td>
                  <td className={`px-5 py-2.5 text-right font-mono tabular-nums ${b.outstanding > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{money(b.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HmoList({ rows, onSaved }: { rows: HmoRow[] | null; onSaved: (m: string) => void }) {
  const [editing, setEditing] = useState<{ row: HmoRow | null } | null>(null);
  if (!rows) return <Skeleton />;
  return (
    <>
      <Panel
        title="HMOs, insurers and company accounts"
        aside={
          <button type="button" onClick={() => setEditing({ row: null })} className={OUTLINE}>
            <Svg d="M12 4v16m8-8H4" />
            Add an HMO
          </button>
        }
      >
        {rows.length === 0 ? (
          <Empty>None yet. Add the HMOs the clinic is accredited with, so claims to them can be sent.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((h) => (
              <li key={h._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <button type="button" onClick={() => setEditing({ row: h })} className={`rounded text-left font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {h.name}
                  </button>
                  {!h.active && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">No longer accepted</span>}
                  <p className="mt-0.5 text-gray-500">
                    {HMO_KIND_LABEL[h.kind]} · pays within {h.paymentTermsDays} days · withholds {h.withholdingServicesRate}% on services, {h.withholdingProfessionalRate}% on professional fees
                    {h.requiresLoa ? ' · LOA needed' : ''}
                  </p>
                </div>
                {(h.email || h.phone) && <p className="text-gray-600">{[h.contactName, h.email, h.phone].filter(Boolean).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {editing && (
        <HmoDialog
          row={editing.row}
          rows={rows}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onSaved(m);
          }}
        />
      )}
    </>
  );
}
