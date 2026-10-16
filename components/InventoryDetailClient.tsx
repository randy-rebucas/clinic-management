'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { useMoney } from './invoices/shared';
import StockBar from './inventory/StockBar';
import StockChart from './inventory/StockChart';
import { AdjustDialog, RestockDialog, type StockItem } from './inventory/StockDialogs';
import { MOVEMENT_LABEL, STOCK_STATE, categoryLabel, clock, daysLeft, qty, reasonLabel, shortDate } from './inventory/shared';
import { daysUntil, type AdjustReason, type MovementType, type StockStatus } from '@/lib/inventory';
import type { InventoryPermissions } from '@/lib/inventory-page';

interface Item extends StockItem {
  sku?: string;
  location?: string;
  notes?: string;
  status: StockStatus;
  lastRestocked?: string;
  lastRestockedBy?: { _id: string; name: string } | null;
  medicineId?: { _id: string; name: string; genericName?: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Movement {
  _id: string;
  type: MovementType;
  change: number;
  quantityAfter: number;
  reasonCode?: AdjustReason;
  reason?: string;
  unitCost?: number;
  supplier?: string;
  reference?: string;
  batchExpiry?: string;
  prescription?: string;
  prescriptionCode?: string;
  performedBy?: { _id: string; name: string } | null;
  createdAt: string;
}

interface History {
  today: string;
  movements: Movement[];
  total: number;
  days: { date: string; quantity: number | null }[];
  used30: number;
}

type Dialog = { kind: 'restock' } | { kind: 'adjust'; mode?: 'out' | 'in' | 'count'; reason?: AdjustReason; amount?: number } | null;

const ICONS = {
  ...ICON,
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  restock: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  adjust: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

export default function InventoryDetailClient({
  itemId,
  permissions,
  openDialog,
  saved,
}: {
  itemId: string;
  permissions: InventoryPermissions;
  openDialog?: 'restock' | 'adjust';
  saved?: 'created' | 'edited' | null;
}) {
  const router = useRouter();
  const { money } = useMoney();
  const res = useKeyedFetch<Item>(`/api/inventory/${itemId}`);
  const hist = useKeyedFetch<History>(`/api/inventory/${itemId}/movements`);
  const [dialog, setDialog] = useState<Dialog>(openDialog && permissions.canWrite ? { kind: openDialog } : null);
  const [notice, setNotice] = useState<string | null>(saved === 'created' ? 'Item added.' : saved === 'edited' ? 'Changes saved.' : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const p = res.value;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const closeDialog = () => {
    setDialog(null);
    // The restock/adjust addresses open a dialog; closing it settles on the item's own address.
    if (openDialog) router.replace(`/inventory/${itemId}`);
  };

  const remove = async () => {
    setConfirmDelete(false);
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/inventory/${itemId}`, { method: 'DELETE' });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) {
        setActionError(formatApiError(json, 'The item could not be removed'));
        setBusy(false);
        return;
      }
      router.push('/inventory');
    } catch {
      setActionError('The server couldn’t be reached. Nothing changed; try again.');
      setBusy(false);
    }
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!p && res.error) {
    const missing = /not found/i.test(res.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing ? ICONS.box : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Item not found' : 'This item didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{missing ? 'It may have been removed, or it belongs to another clinic.' : `${res.error}. Check your connection and try again.`}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/inventory" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All inventory
            </Link>
            {!missing && (
              <button type="button" onClick={res.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!p) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-24 rounded-lg border border-gray-200 bg-white" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading item…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const st = STOCK_STATE[p.status] ?? STOCK_STATE['in-stock'];
  const until = p.expiryDate ? daysUntil(p.expiryDate) : null;
  const expiredWithStock = until !== null && until < 0 && p.quantity > 0;
  const used30 = hist.value?.used30 ?? 0;
  const left = daysLeft(p.quantity, used30);
  const reorderNeeded = p.status === 'low-stock' || p.status === 'out-of-stock';
  const subtitle = [categoryLabel(p.category), p.location && `kept in ${p.location}`, p.supplier && `from ${p.supplier}`].filter(Boolean).join(' · ');

  const done = (message: string) => {
    closeDialog();
    setNotice(message);
    res.reload();
    hist.reload();
  };

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{p.name}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            {p.sku && <span className="font-mono text-sm text-gray-500">{p.sku}</span>}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">{subtitle}</p>
        </div>
        {permissions.canWrite && (
          <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
            <Link href={`/inventory/${p._id}/edit`} className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.edit} />
              Edit details
            </Link>
            <button type="button" onClick={() => setDialog({ kind: 'adjust' })} className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.adjust} />
              Adjust or count
            </button>
            <button type="button" onClick={() => setDialog({ kind: 'restock' })} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.restock} />
              Restock
            </button>
            {permissions.canDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                aria-label={`Remove ${p.name} from inventory`}
                title="Remove item"
                className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.trash} />
              </button>
            )}
          </div>
        )}
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {expiredWithStock && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-mono font-semibold">{qty(p.quantity)}</span> {p.unit} expired on {shortDate(p.expiryDate!)}. Don’t dispense them; take them off stock.
            </span>
          </p>
          {permissions.canWrite && (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'adjust', mode: 'out', reason: 'expired', amount: p.quantity })}
              className={`shrink-0 rounded-md border border-red-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-red-800 hover:border-red-700 ${FOCUS_RING}`}
            >
              Take them off
            </button>
          )}
        </div>
      )}

      {/* Summary strip */}
      <section aria-label="Stock summary" className={`overflow-hidden rounded-lg border border-gray-200 bg-white transition-opacity ${res.loading ? 'opacity-60' : ''}`}>
        <dl className="grid -mr-px -mb-px grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Cell label="On hand">
            <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">
              {qty(p.quantity)} <span className="font-sans text-base font-normal text-gray-500">{p.unit}</span>
            </p>
            <StockBar quantity={p.quantity} reorderLevel={p.reorderLevel} status={p.status} className="mt-2" />
            <p className={`mt-1 text-sm ${reorderNeeded ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
              Reorder at <span className="font-mono">{qty(p.reorderLevel)}</span>
              {reorderNeeded && p.reorderQuantity > 0 && (
                <>
                  {' · order '}
                  <span className="font-mono">{qty(p.reorderQuantity)}</span>
                </>
              )}
            </p>
          </Cell>
          <Cell label="Lasts">
            {left !== null ? (
              <>
                <p className={`font-mono text-2xl font-semibold tabular-nums ${left < 7 ? 'text-red-700' : 'text-gray-900'}`}>
                  {left} <span className="font-sans text-base font-normal text-gray-500">{left === 1 ? 'day' : 'days'}</span>
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  at <span className="font-mono">{qty(Math.round((used30 / 30) * 10) / 10)}</span> {p.unit} a day, the last 30 days’ use
                </p>
              </>
            ) : (
              <p className="pt-1 text-sm text-gray-500">{hist.value ? 'No use recorded in the last 30 days.' : '…'}</p>
            )}
          </Cell>
          <Cell label="Expires">
            {p.expiryDate ? (
              <>
                <p className={`font-mono text-2xl font-semibold tabular-nums ${until !== null && until < 0 ? 'text-red-700' : 'text-gray-900'}`}>{shortDate(p.expiryDate)}</p>
                <p className={`mt-1 text-sm ${until !== null && until < 0 ? 'font-medium text-red-700' : until !== null && until <= 30 ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
                  {until === null ? '' : until < 0 ? `Expired ${-until} ${-until === 1 ? 'day' : 'days'} ago` : until === 0 ? 'Expires today' : `In ${until} ${until === 1 ? 'day' : 'days'}`}
                  {left !== null && until !== null && until > 0 && left > until && p.quantity > 0 && ' · stock outlasts it'}
                </p>
              </>
            ) : (
              <p className="pt-1 text-sm text-gray-500">No expiry date</p>
            )}
          </Cell>
          <Cell label="Value at cost">
            <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{money(p.quantity * p.unitCost)}</p>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-mono">{money(p.unitCost)}</span> per {p.unit.replace(/s$/, '') || 'unit'}
            </p>
          </Cell>
        </dl>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="stk-chart" title="Stock, last 60 days">
            {hist.value ? (
              hist.value.days.length > 0 ? (
                <StockChart days={hist.value.days} today={hist.value.today} reorderLevel={p.reorderLevel} unit={p.unit} />
              ) : (
                <p className="px-5 py-4 text-sm text-gray-500">No stock changes recorded yet. The chart starts with the next restock, adjustment or dispense.</p>
              )
            ) : hist.error ? (
              <p className="px-5 py-4 text-sm text-gray-500">
                The history didn&apos;t load ({hist.error}).{' '}
                <button type="button" onClick={hist.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  Try again
                </button>
              </p>
            ) : (
              <div className="m-5 h-40 animate-pulse rounded bg-gray-50" aria-hidden="true" />
            )}
          </Panel>

          <Panel
            id="stk-history"
            title="History"
            aside={
              hist.value && hist.value.total > 0 ? (
                <span className="text-sm text-gray-500">
                  {hist.value.total > hist.value.movements.length ? (
                    <>
                      Newest <span className="font-mono text-gray-900">{hist.value.movements.length}</span> of <span className="font-mono">{hist.value.total}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-gray-900">{hist.value.total}</span> {hist.value.total === 1 ? 'change' : 'changes'}
                    </>
                  )}
                </span>
              ) : null
            }
          >
            {!hist.value ? (
              <div className="m-5 h-24 animate-pulse rounded bg-gray-50" aria-hidden="true" />
            ) : hist.value.movements.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">Nothing recorded yet. Restocks, adjustments, counts and dispensing will appear here.</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {hist.value.movements.map((m, i) => (
                  <MovementRow key={m._id} m={m} unit={p.unit} money={money} index={i} />
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="stk-details" title="Details">
            <dl className="divide-y divide-gray-100">
              <Field label="Category">{categoryLabel(p.category)}</Field>
              {p.sku && (
                <Field label="SKU">
                  <span className="font-mono">{p.sku}</span>
                </Field>
              )}
              <Field label="Counted in">{p.unit}</Field>
              <Field label="Reorder">
                at <span className="font-mono">{qty(p.reorderLevel)}</span>, order <span className="font-mono">{qty(p.reorderQuantity)}</span>
              </Field>
              {p.location && <Field label="Kept in">{p.location}</Field>}
              {p.supplier && <Field label="Supplier">{p.supplier}</Field>}
              {p.medicineId && (
                <Field label="Medicine">
                  {p.medicineId.name}
                  {p.medicineId.genericName && p.medicineId.genericName !== p.medicineId.name && <span className="text-gray-500"> ({p.medicineId.genericName})</span>}
                </Field>
              )}
              {p.lastRestocked && (
                <Field label="Restocked">
                  <span className="font-mono">{shortDate(p.lastRestocked)}</span>
                  {p.lastRestockedBy?.name && <span className="text-gray-500"> by {p.lastRestockedBy.name}</span>}
                </Field>
              )}
            </dl>
            {p.category === 'medicine' && (
              <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
                {p.medicineId
                  ? 'Dispensing a prescription for this medicine takes it off this stock.'
                  : `Dispensing takes stock off this item when the prescribed medicine is named exactly “${p.name}”.`}
              </p>
            )}
          </Panel>

          {p.notes && (
            <Panel id="stk-notes" title="Notes">
              <p className="max-w-prose whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-700">{p.notes}</p>
            </Panel>
          )}
        </aside>
      </div>

      {dialog?.kind === 'restock' && <RestockDialog item={p} onClose={closeDialog} onDone={done} />}
      {dialog?.kind === 'adjust' && (
        <AdjustDialog item={p} initial={dialog.mode ? { mode: dialog.mode, reason: dialog.reason, amount: dialog.amount } : undefined} onClose={closeDialog} onDone={done} />
      )}

      {confirmDelete &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setConfirmDelete(false)}
            title={`Remove ${p.name}?`}
            description={`It leaves the inventory list and stock alerts, and dispensing will no longer take stock off it. Its history is kept for the audit trail. This can’t be undone; to stop stocking it for now, count it to 0 instead.`}
          >
            <button type="button" onClick={() => setConfirmDelete(false)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep item
            </button>
            <button type="button" onClick={remove} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Remove item
            </button>
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function MovementRow({ m, unit, money, index }: { m: Movement; unit: string; money: (v: number) => string; index: number }) {
  const out = m.change < 0;
  const detail: ReactNode[] = [];
  const why = reasonLabel(m.reasonCode);
  if (why) detail.push(why);
  if (m.type === 'dispense' && m.prescriptionCode) {
    detail.push(
      m.prescription ? (
        <Link key="rx" href={`/prescriptions/${m.prescription}`} className={`rounded font-mono text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          {m.prescriptionCode}
        </Link>
      ) : (
        <span key="rx" className="font-mono text-xs">
          {m.prescriptionCode}
        </span>
      )
    );
  }
  if (m.supplier) detail.push(`from ${m.supplier}`);
  if (m.unitCost !== undefined && m.unitCost > 0 && m.type === 'restock') detail.push(<span key="c">at <span className="font-mono">{money(m.unitCost)}</span> each</span>);
  if (m.reference) detail.push(<span key="r" className="font-mono text-xs">Ref {m.reference}</span>);
  if (m.batchExpiry) detail.push(<span key="e">expires <span className="font-mono">{shortDate(m.batchExpiry)}</span></span>);

  return (
    <li className="motion-row-in grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(index * 25, 240)}ms` }}>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">{MOVEMENT_LABEL[m.type] ?? m.type}</p>
        {detail.length > 0 && (
          <p className="mt-0.5 text-gray-600">
            {detail.map((d, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {d}
              </span>
            ))}
          </p>
        )}
        {m.reason && <p className="mt-0.5 text-gray-600">{m.reason}</p>}
        <p className="mt-0.5 text-gray-500">
          <span className="font-mono text-xs">
            {shortDate(m.createdAt)}, {clock(m.createdAt)}
          </span>
          {m.performedBy?.name && ` · ${m.performedBy.name}`}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-mono font-semibold tabular-nums ${out ? 'text-gray-900' : 'text-emerald-800'}`}>
          {out ? '−' : '+'}
          {qty(Math.abs(m.change))}
        </p>
        <p className="font-mono text-xs tabular-nums text-gray-500">
          {qty(m.quantityAfter)} {unit} after
        </p>
      </div>
    </li>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/inventory" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All inventory
    </Link>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r border-b border-gray-200 p-5">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}
