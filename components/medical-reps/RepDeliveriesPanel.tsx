'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg, dayLabel, timeLabel } from '../appointments/shared';

type DeliveryStatus = 'pending' | 'received' | 'rejected' | 'cancelled';

interface StockMatch {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface DeliveryLine {
  productName: string;
  strength?: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  expiryDate?: string;
  receivedQuantity?: number;
  inventoryItemId?: string;
  stockMatches?: StockMatch[];
}

interface Delivery {
  _id: string;
  repName: string;
  repCompany?: string;
  kind: 'sample' | 'delivery';
  lines: DeliveryLine[];
  note?: string;
  status: DeliveryStatus;
  clinicNote?: string;
  respondedAt?: string;
  createdAt: string;
  visit: { date: string; time: string; purpose: string } | null;
}

type View = 'pending' | 'received' | 'closed';
const VIEWS: { key: View; label: string; statuses: DeliveryStatus[] }[] = [
  { key: 'pending', label: 'To confirm', statuses: ['pending'] },
  { key: 'received', label: 'Received', statuses: ['received'] },
  { key: 'closed', label: 'Rejected or cancelled', statuses: ['rejected', 'cancelled'] },
];

/** Status colours from DESIGN.md: pending ochre, done teal, closed gray. */
const STATUS_STYLE: Record<DeliveryStatus, { label: string; className: string }> = {
  pending: { label: 'To confirm', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  received: { label: 'Received', className: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  rejected: { label: 'Rejected', className: 'bg-gray-100 text-gray-700 ring-gray-200' },
  cancelled: { label: 'Cancelled by rep', className: 'bg-white text-gray-600 ring-gray-300 line-through' },
};

const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const QUIET = `rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60 ${FOCUS_RING}`;

const dayOf = (iso: string) => iso.slice(0, 10);
const productLabel = (l: Pick<DeliveryLine, 'productName' | 'strength'>) => [l.productName, l.strength].filter(Boolean).join(' ');
const repLabel = (d: Delivery) => (d.repCompany ? `${d.repName} · ${d.repCompany}` : d.repName);

type LineChoice = { receivedQuantity: string; stock: string };

/** Samples go to doctors, not the shelf, so they start outside stock; deliveries go to the closest match or a new item. */
const defaultChoice = (d: Delivery, l: DeliveryLine): LineChoice => ({
  receivedQuantity: String(l.quantity),
  stock: d.kind === 'sample' ? 'none' : l.stockMatches?.[0]?._id ?? 'new',
});

/**
 * Samples and deliveries reps recorded for this clinic: confirm what arrived (optionally into
 * stock, as a restock from the rep's company) or reject it. The rep is told either way.
 */
export default function RepDeliveriesPanel({ focusDeliveryId }: { focusDeliveryId?: string }) {
  const [view, setView] = useState<View>('pending');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState<{ delivery: Delivery; lines: LineChoice[]; note: string } | null>(null);
  const [rejecting, setRejecting] = useState<{ delivery: Delivery; note: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const requestKey = `${view}:${reloadCount}`;
  const loading = settledKey !== requestKey;
  const reload = () => setReloadCount((n) => n + 1);

  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      try {
        const statuses = VIEWS.find((x) => x.key === view)!.statuses;
        const pages = await Promise.all(
          statuses.map((s) => fetch(`/api/rep-deliveries?status=${s}&limit=100`, { signal: ctrl.signal }).then((r) => r.json()))
        );
        const failed = pages.find((p) => !p.success);
        if (failed) throw new Error(failed.error || 'Could not load rep deliveries');
        const rows: Delivery[] = pages.flatMap((p) => p.data);
        if (view === 'closed') rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setDeliveries(rows);
        setCounts(pages[0].counts ?? {});
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError((e as Error).message || 'Could not load rep deliveries');
      } finally {
        if (!ctrl.signal.aborted) setSettledKey(requestKey);
      }
    }
    void load();
    return () => ctrl.abort();
  }, [view, requestKey]);

  const send = async (delivery: Delivery, body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/rep-deliveries/${delivery._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not update the delivery');
      const problems: { line: number; error: string }[] = data.stockProblems ?? [];
      setNotice(
        problems.length
          ? {
              tone: 'error',
              text: `Received, but some lines didn't go into stock: ${problems
                .map((p) => `${productLabel(delivery.lines[p.line])} (${p.error})`)
                .join('; ')}. Restock those from Inventory.`,
            }
          : { tone: 'ok', text: done }
      );
      setReceiving(null);
      setRejecting(null);
      reload();
    } catch (e) {
      setNotice({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const closedCount = VIEWS[2].statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Rep deliveries" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const n = v.key === 'closed' ? closedCount : counts[v.key] ?? 0;
          const selected = view === v.key;
          return (
            <button
              key={v.key}
              role="tab"
              aria-selected={selected}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                selected ? 'bg-brand-teal-dark text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-gray-400'
              }`}
            >
              {v.label}
              <span className={`rounded px-1.5 font-mono text-xs ${selected ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role="status"
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-3 text-sm font-medium ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep'
          }`}
        >
          <span className="flex items-start gap-2">
            <Svg d={notice.tone === 'error' ? ICON.alert : ICON.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={loading}>
        {error ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button type="button" onClick={() => reload()} className={QUIET}>
              Try again
            </button>
          </div>
        ) : loading && !deliveries.length ? (
          <ul className="divide-y divide-gray-100" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex animate-pulse gap-4 p-4">
                <div className="h-10 w-24 rounded bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-gray-100" />
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                </div>
              </li>
            ))}
          </ul>
        ) : !deliveries.length ? (
          <div className="p-8 text-center">
            <p className="font-semibold text-gray-900">
              {view === 'pending' ? 'Nothing to confirm' : view === 'received' ? 'No deliveries received yet' : 'Nothing rejected or cancelled'}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              When a rep records samples or a delivery after visiting you, it shows up here for you to confirm what arrived.
            </p>
          </div>
        ) : (
          <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
            {deliveries.map((d) => (
              <li key={d._id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${d._id === focusDeliveryId ? 'bg-amber-50/60' : ''}`}>
                <div className="w-full shrink-0 sm:w-36">
                  <p className="font-semibold text-gray-900">{dayLabel(dayOf(d.createdAt), { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  {d.visit && (
                    <p className="text-sm text-gray-600">
                      Visit {dayLabel(dayOf(d.visit.date), { month: 'short', day: 'numeric' })} · <span className="font-mono">{timeLabel(d.visit.time)}</span>
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{repLabel(d)}</p>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">{d.kind === 'sample' ? 'Samples' : 'Delivery'}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[d.status].className}`}>{STATUS_STYLE[d.status].label}</span>
                  </div>
                  <table className="mt-2 w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Lot and expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100 first:border-t-0">
                          <td className="py-1.5 pr-3 font-medium text-gray-900">{productLabel(l)}</td>
                          <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-gray-900">
                            {d.status === 'received' && l.receivedQuantity !== undefined && l.receivedQuantity !== l.quantity ? (
                              <>
                                {l.receivedQuantity} <span className="text-gray-500 line-through">{l.quantity}</span>
                              </>
                            ) : (
                              d.status === 'received' ? l.receivedQuantity ?? l.quantity : l.quantity
                            )}{' '}
                            <span className="font-sans text-gray-600">{l.unit}</span>
                          </td>
                          <td className="py-1.5 text-gray-600">
                            {[l.lotNumber && `Lot ${l.lotNumber}`, l.expiryDate && `exp. ${dayOf(l.expiryDate)}`].filter(Boolean).join(' · ')}
                            {l.inventoryItemId && <span className="ml-2 text-xs font-semibold text-brand-teal-deep">In stock</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.note && <p className="mt-2 text-sm text-gray-900">Rep’s note: {d.note}</p>}
                  {d.clinicNote && <p className="mt-1 text-sm text-gray-600">Your note: {d.clinicNote}</p>}
                </div>
                {d.status === 'pending' && (
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      className={PRIMARY}
                      onClick={() => setReceiving({ delivery: d, lines: d.lines.map((l) => defaultChoice(d, l)), note: '' })}
                    >
                      Confirm receipt
                    </button>
                    <button type="button" disabled={busy} className={QUIET} onClick={() => setRejecting({ delivery: d, note: '' })}>
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)}>
        {receiving && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const { delivery, lines, note } = receiving;
              void send(
                delivery,
                {
                  action: 'receive',
                  note: note.trim() || undefined,
                  lines: lines.map((l) => ({ receivedQuantity: Math.max(0, Math.floor(Number(l.receivedQuantity) || 0)), stock: l.stock })),
                },
                'Delivery received. The rep has been told.'
              );
            }}
          >
            <h2 className="text-lg font-bold text-gray-900">Confirm what arrived from {receiving.delivery.repName}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Correct any quantity you counted differently. Lines you add to stock are recorded as a restock from{' '}
              {receiving.delivery.repCompany || receiving.delivery.repName}.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {receiving.delivery.lines.map((l, i) => {
                const choice = receiving.lines[i];
                const update = (patch: Partial<LineChoice>) =>
                  setReceiving({ ...receiving, lines: receiving.lines.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
                return (
                  <fieldset key={i} className="rounded-md border border-gray-200 p-3">
                    <legend className="px-1 text-sm font-semibold text-gray-900">{productLabel(l)}</legend>
                    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                      <label className="text-sm font-medium text-gray-700">
                        Received ({l.unit})
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          inputMode="numeric"
                          value={choice.receivedQuantity}
                          onChange={(e) => update({ receivedQuantity: e.target.value })}
                          className={`${FIELD} mt-1 font-mono`}
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Stock
                        <select value={choice.stock} onChange={(e) => update({ stock: e.target.value })} className={`${FIELD} mt-1`}>
                          <option value="none">Don’t add to stock</option>
                          {(l.stockMatches ?? []).map((m) => (
                            <option key={m._id} value={m._id}>
                              Add to {m.name} ({m.quantity} {m.unit} now)
                            </option>
                          ))}
                          <option value="new">New stock item: {productLabel(l)}</option>
                        </select>
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Recorded: {l.quantity} {l.unit}
                      {l.lotNumber ? ` · lot ${l.lotNumber}` : ''}
                      {l.expiryDate ? ` · expires ${dayOf(l.expiryDate)}` : ''}
                    </p>
                  </fieldset>
                );
              })}
            </div>
            <label htmlFor="rep-delivery-note" className="mt-4 block text-sm font-medium text-gray-700">
              Note for the rep (optional)
            </label>
            <textarea
              id="rep-delivery-note"
              rows={2}
              maxLength={1000}
              value={receiving.note}
              onChange={(e) => setReceiving({ ...receiving, note: e.target.value })}
              className={`${FIELD} mt-1`}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReceiving(null)} className={QUIET}>
                Not now
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                Confirm receipt
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        {rejecting && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void send(rejecting.delivery, { action: 'reject', note: rejecting.note.trim() || undefined }, 'Delivery rejected. The rep has been told.');
            }}
          >
            <h2 className="text-lg font-bold text-gray-900">Reject {rejecting.delivery.repName}’s delivery?</h2>
            <p className="mt-1 text-sm text-gray-600">Use this when it didn’t arrive or isn’t yours. The rep gets a notification.</p>
            <label htmlFor="rep-delivery-reject" className="mt-4 block text-sm font-medium text-gray-700">
              Reason for the rep (optional)
            </label>
            <textarea
              id="rep-delivery-reject"
              rows={3}
              maxLength={1000}
              value={rejecting.note}
              onChange={(e) => setRejecting({ ...rejecting, note: e.target.value })}
              className={`${FIELD} mt-1`}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} className={QUIET}>
                Keep it
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                Reject
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
