'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ageFrom } from './visits/form/PatientSummary';
import { SERIES } from './dashboards/charts';
import PaymentDialog from './invoices/PaymentDialog';
import { DISCOUNT_LABEL, INVOICE_STATE, PF_TYPES, clock, methodLabel, shortDate, useMoney } from './invoices/shared';
import type { InvoiceStatus } from '@/lib/invoices';
import type { InvoiceDetailPermissions } from '@/lib/invoices-page';

interface Item {
  serviceId?: { _id: string; name: string; code?: string; category?: string } | string | null;
  code?: string;
  description?: string;
  category?: string;
  quantity?: number;
  unitPrice: number;
  total: number;
}

interface Payment {
  _id?: string;
  method: string;
  amount: number;
  date: string;
  receiptNo?: string;
  referenceNo?: string;
  processedBy?: { _id: string; name: string } | string | null;
  notes?: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string; phone?: string; dateOfBirth?: string } | null;
  visit?: { _id: string; visitCode: string; date: string; visitType?: string } | null;
  items: Item[];
  subtotal?: number;
  professionalFee?: number;
  professionalFeeType?: string;
  professionalFeeDoctor?: { _id: string; firstName: string; lastName: string } | null;
  professionalFeeNotes?: string;
  discounts: { type: string; reason?: string; idNumber?: string; percentage?: number; amount: number }[];
  tax?: number;
  total?: number;
  taxBreakdown?: {
    regime: 'vat' | 'non_vat';
    grossSales: number;
    vatableSales: number;
    vatAmount: number;
    vatExemptSales: number;
    zeroRatedSales: number;
    lessVat: number;
    statutoryDiscount: number;
  };
  bir?: { serialNo?: string; issuedAt?: string };
  payments: Payment[];
  insurance?: {
    provider?: string;
    policyNumber?: string;
    memberId?: string;
    coverageType?: string;
    coverageAmount?: number;
    claimNumber?: string;
    status?: string;
    notes?: string;
  };
  outstandingBalance?: number;
  totalPaid?: number;
  status: InvoiceStatus;
  createdAt: string;
  createdBy?: { _id: string; name: string } | string | null;
  patientOtherOpen?: { amount: number; count: number };
}

const ICONS = {
  ...ICON,
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  cash: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  undo: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
};

const INSURANCE_STATE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
/** Birth dates are stored at UTC midnight; read them in UTC so they never slip a day. */
const birthDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const nameOf = (v: { name: string } | string | null | undefined) => (v && typeof v === 'object' ? v.name : null);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');

export default function InvoiceDetailClient({
  invoiceId,
  permissions,
  justCreated,
}: {
  invoiceId: string;
  permissions: InvoiceDetailPermissions;
  justCreated: boolean;
}) {
  const router = useRouter();
  const { money } = useMoney();
  const inv = useKeyedFetch<Invoice>(`/api/invoices/${invoiceId}`);
  const [paying, setPaying] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; receipt: boolean } | null>(justCreated ? { text: 'created', receipt: false } : null);
  const [actionError, setActionError] = useState<string | null>(null);

  const p = inv.value;

  useEffect(() => {
    if (!notice || notice.receipt) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const markRefunded = async () => {
    setConfirmRefund(false);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'refunded' }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setActionError(formatApiError(json, 'The invoice could not be marked refunded'));
        return;
      }
      // The PUT answer carries less than this page shows; read the record again.
      inv.reload();
      setNotice({ text: 'Invoice marked refunded. It no longer counts as owed or collected.', receipt: false });
    } catch {
      setActionError('The server couldn’t be reached. Nothing changed; try again.');
    } finally {
      setBusy(false);
    }
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!p && inv.error) {
    const missing = /not found|invalid invoice id/i.test(inv.error);
    const denied = /permission|forbidden|not allowed/i.test(inv.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Invoice not found' : denied ? 'You can’t open this invoice' : 'This invoice didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may have been archived, or it belongs to another clinic.' : denied ? 'Ask a clinic admin if you need access to billing.' : `${inv.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/invoices" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All invoices
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={inv.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
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
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-80 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading invoice…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const st = INVOICE_STATE[p.status] ?? INVOICE_STATE.unpaid;
  const refunded = p.status === 'refunded';
  const total = p.total ?? 0;
  const paid = p.totalPaid ?? p.payments.reduce((s, x) => s + (x.amount || 0), 0);
  const balance = refunded ? 0 : (p.outstandingBalance ?? Math.max(0, total - paid));
  const open = !refunded && balance > 0.005;
  const who = p.patient ? `${p.patient.firstName} ${p.patient.lastName}`.trim() : 'Patient record unavailable';
  const createdBy = nameOf(p.createdBy);
  const discountTotal = p.discounts.reduce((s, d) => s + (d.amount || 0), 0);
  const pfType = PF_TYPES.find((t) => t.value === p.professionalFeeType)?.label;
  const pfDoctor = p.professionalFeeDoctor ? `Dr. ${p.professionalFeeDoctor.firstName} ${p.professionalFeeDoctor.lastName}` : null;
  const share = total > 0 ? Math.min(1, paid / total) : paid > 0 ? 1 : 0;
  const payments = [...p.payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const other = p.patientOtherOpen;

  const tb = p.taxBreakdown;
  const serial = p.bir?.serialNo;
  const receiptLink = (className: string, label = tb ? (serial ? 'Reprint sales invoice' : 'Issue sales invoice') : 'Print receipt') => (
    <a href={`/api/invoices/${p._id}/receipt`} target="_blank" rel="noopener noreferrer" className={className}>
      <Svg d={ICONS.print} />
      {label}
    </a>
  );

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${refunded ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-900'}`}>{who}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            <span className="font-mono text-sm text-gray-500">{p.invoiceNumber}</span>
            {serial && (
              <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700" title="BIR sales invoice serial">
                SI {serial}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            Billed {longDate(p.createdAt)} at <span className="font-mono">{clock(p.createdAt)}</span>
            {createdBy && ` by ${createdBy}`}
            {p.visit && (
              <>
                {' · for visit '}
                {permissions.canSeeVisit ? (
                  <Link href={`/visits/${p.visit._id}`} className={`rounded font-mono font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {p.visit.visitCode}
                  </Link>
                ) : (
                  <span className="font-mono">{p.visit.visitCode}</span>
                )}
                {p.visit.date && <span> of {shortDate(p.visit.date)}</span>}
              </>
            )}
          </p>
        </div>

        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          {!refunded &&
            paid > 0 &&
            receiptLink(
              `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`
            )}
          {permissions.canPay && open && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setActionError(null);
                setPaying(true);
              }}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait ${FOCUS_RING}`}
            >
              <Svg d={ICONS.cash} />
              Record payment
            </button>
          )}
          {permissions.canRefund && !refunded && (
            <button
              type="button"
              onClick={() => setConfirmRefund(true)}
              disabled={busy}
              aria-label={`Mark invoice ${p.invoiceNumber} refunded`}
              title="Mark refunded"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.undo} />
            </button>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ? (notice.text === 'created' ? `Invoice ${p.invoiceNumber} created.` : notice.text) : ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="font-medium">
              {notice.text === 'created'
                ? `Invoice ${p.invoiceNumber} created for ${money(total)}.${open && permissions.canPay ? ' Record the payment when the patient pays.' : ''}`
                : notice.text}
            </p>
            {notice.receipt && receiptLink(`inline-flex items-center gap-1.5 rounded font-semibold text-green-900 underline underline-offset-2 hover:text-green-950 ${FOCUS_RING}`)}
          </div>
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

      <div className={`grid items-start gap-6 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ${inv.loading ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            id="inv-charges"
            title="Charges"
            aside={
              <span className="text-sm text-gray-500">
                <span className="font-mono tabular-nums text-gray-900">{p.items.length}</span> {p.items.length === 1 ? 'item' : 'items'}
              </span>
            }
          >
            {p.items.length > 0 && (
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_4rem_7.5rem_7.5rem] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-xs font-medium text-gray-500 sm:grid">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Amount</span>
              </div>
            )}
            {p.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">No services on this invoice.</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {p.items.map((item, i) => {
                  const svc = typeof item.serviceId === 'object' && item.serviceId ? item.serviceId : null;
                  const name = item.description || svc?.name || 'Service';
                  const code = item.code || svc?.code;
                  const category = item.category || svc?.category;
                  const qty = item.quantity || 1;
                  return (
                    <li
                      key={i}
                      className="motion-row-in grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_4rem_7.5rem_7.5rem] sm:items-baseline"
                      style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">{name}</span>
                        {(code || category) && (
                          <span className="block text-sm text-gray-500">
                            {code && <span className="font-mono text-xs">{code}</span>}
                            {code && category && ' · '}
                            {category && capital(category)}
                          </span>
                        )}
                      </span>
                      <span className="col-start-1 font-mono text-sm tabular-nums text-gray-500 sm:col-start-auto sm:text-right sm:text-gray-900">
                        <span className="sm:hidden">
                          {qty} × {money(item.unitPrice)}
                        </span>
                        <span className="hidden sm:inline">{qty}</span>
                      </span>
                      <span className="hidden font-mono text-sm tabular-nums text-gray-900 sm:block sm:text-right">{money(item.unitPrice)}</span>
                      <span className="col-start-2 row-start-1 font-mono text-sm font-medium tabular-nums text-gray-900 sm:col-start-auto sm:row-start-auto sm:text-right">{money(item.total)}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <dl className="border-t border-gray-200 px-5 py-4 text-sm">
              <Line label="Services" value={money(p.subtotal ?? p.items.reduce((s, x) => s + (x.total || 0), 0))} />
              {p.discounts.map((d, i) => (
                <Line
                  key={i}
                  label={
                    <>
                      {DISCOUNT_LABEL[d.type] ?? 'Discount'} discount
                      {d.percentage ? <span className="font-mono"> {d.percentage}%</span> : null}
                      {d.idNumber ? (
                        <span className="text-gray-500"> · ID <span className="font-mono">{d.idNumber}</span></span>
                      ) : (
                        d.reason && d.reason !== `${DISCOUNT_LABEL[d.type]} Discount` && <span className="text-gray-500"> · {d.reason}</span>
                      )}
                    </>
                  }
                  value={`−${money(d.amount)}`}
                />
              ))}
              {(p.professionalFee ?? 0) > 0 && (
                <Line
                  label={
                    <>
                      Professional fee
                      {(pfDoctor || pfType) && <span className="text-gray-500"> · {[pfDoctor, pfType?.toLowerCase()].filter(Boolean).join(', ')}</span>}
                      {p.professionalFeeNotes && <span className="block text-gray-500">{p.professionalFeeNotes}</span>}
                    </>
                  }
                  value={money(p.professionalFee ?? 0)}
                />
              )}
              {tb && tb.lessVat > 0 && <Line label="Less VAT (VAT-exempt sale)" value={`−${money(tb.lessVat)}`} />}
              {tb
                ? // VAT added on top of the prices (VAT-exclusive pricing); included VAT shows in the breakdown below.
                  total > tb.grossSales - discountTotal - tb.lessVat + 0.005 && <Line label="VAT" value={money(tb.vatAmount)} />
                : (p.tax ?? 0) > 0 && <Line label="Tax" value={money(p.tax ?? 0)} />}
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-gray-200 pt-3">
                <dt className="font-semibold text-gray-900">Total</dt>
                <dd className="font-mono text-base font-semibold tabular-nums text-gray-900">{money(total)}</dd>
              </div>
              {tb?.regime === 'vat' && (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-dashed border-gray-200 pt-2 text-xs text-gray-500 sm:grid-cols-4">
                  <span>
                    VATable <span className="block font-mono tabular-nums text-gray-900">{money(tb.vatableSales)}</span>
                  </span>
                  <span>
                    VAT <span className="block font-mono tabular-nums text-gray-900">{money(tb.vatAmount)}</span>
                  </span>
                  <span>
                    VAT-exempt <span className="block font-mono tabular-nums text-gray-900">{money(tb.vatExemptSales)}</span>
                  </span>
                  <span>
                    Zero-rated <span className="block font-mono tabular-nums text-gray-900">{money(tb.zeroRatedSales)}</span>
                  </span>
                </div>
              )}
              {discountTotal > 0 && (
                <p className="mt-1 text-right text-xs text-gray-500">
                  {tb?.statutoryDiscount
                    ? 'The senior citizen or PWD discount covers the professional fee too.'
                    : 'Discounts apply to services only, not the professional fee.'}
                </p>
              )}
            </dl>
          </Panel>

          <Panel
            id="inv-payments"
            title="Payments"
            aside={
              payments.length > 0 ? (
                <span className="text-sm text-gray-500">
                  <span className="font-mono tabular-nums text-gray-900">{payments.length}</span> {payments.length === 1 ? 'payment' : 'payments'}
                </span>
              ) : null
            }
          >
            {payments.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p className="text-sm text-gray-500">{refunded ? 'Nothing was paid before it was refunded.' : 'No payment recorded yet.'}</p>
                {permissions.canPay && open && (
                  <button type="button" onClick={() => setPaying(true)} className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Record payment
                  </button>
                )}
              </div>
            ) : (
              <ol className="divide-y divide-gray-100">
                {payments.map((x, i) => {
                  const by = nameOf(x.processedBy);
                  return (
                    <li key={x._id ?? i} className="motion-row-in px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold text-gray-900">{methodLabel(x.method)}</span>
                        <span className={`font-mono font-medium tabular-nums ${refunded ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{money(x.amount)}</span>
                      </p>
                      <p className="mt-0.5 text-gray-500">
                        <span className="font-mono text-xs">
                          {shortDate(x.date)}, {clock(x.date)}
                        </span>
                        {by && ` · taken by ${by}`}
                        {x.referenceNo && (
                          <>
                            {' · '}
                            <span className="font-mono text-xs">Ref {x.referenceNo}</span>
                          </>
                        )}
                        {x.receiptNo && (
                          <>
                            {' · '}
                            <span className="font-mono text-xs">OR {x.receiptNo}</span>
                          </>
                        )}
                      </p>
                      {x.notes && <p className="mt-1 whitespace-pre-wrap text-gray-600">{x.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="inv-balance" title={refunded ? 'Refunded' : open ? 'Still to pay' : 'Paid in full'}>
            <div className="px-5 py-4">
              {refunded ? (
                <p className="text-sm text-gray-600">
                  {paid > 0 ? (
                    <>
                      <span className="font-mono text-gray-900">{money(paid)}</span> was paid and returned to the patient. Nothing is owed.
                    </>
                  ) : (
                    'Closed without payment. Nothing is owed.'
                  )}
                </p>
              ) : (
                <>
                  <p className={`font-mono text-3xl font-semibold tabular-nums ${open ? 'text-red-700' : 'text-gray-900'}`}>{money(open ? balance : total)}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-mono text-gray-900">{money(paid)}</span> of <span className="font-mono text-gray-900">{money(total)}</span> paid
                  </p>
                  <div
                    role="meter"
                    aria-label={`${money(paid)} of ${money(total)} paid`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(total, 0.01)}
                    aria-valuenow={Math.min(paid, total)}
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"
                  >
                    <div className="motion-bar-grow h-full rounded-full" style={{ width: `${share * 100}%`, background: SERIES.teal }} />
                  </div>
                </>
              )}
              {other && other.count > 0 && (
                <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-700">
                  {p.patient?.firstName ?? 'This patient'} also owes <span className="font-mono font-semibold text-gray-900">{money(other.amount)}</span> on{' '}
                  {other.count === 1 ? 'another invoice' : `${other.count} other invoices`}.{' '}
                  <Link
                    href={`/invoices?status=open&search=${encodeURIComponent(p.patient?.patientCode || who)}`}
                    className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}
                  >
                    See {other.count === 1 ? 'it' : 'them'}
                  </Link>
                </p>
              )}
            </div>
          </Panel>

          <Panel id="inv-patient" title="Patient">
            {p.patient ? (
              <dl className="divide-y divide-gray-100">
                <Field label="Name">
                  {permissions.canSeePatient ? (
                    <Link href={`/patients/${p.patient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                  {p.patient.patientCode && <span className="ml-2 font-mono text-xs text-gray-500">{p.patient.patientCode}</span>}
                </Field>
                {p.patient.dateOfBirth && (
                  <Field label="Born">
                    <span className="font-mono">{birthDate(p.patient.dateOfBirth)}</span>
                    {ageFrom(p.patient.dateOfBirth) && <span className="text-gray-500"> · {ageFrom(p.patient.dateOfBirth)}</span>}
                  </Field>
                )}
                {p.patient.phone && (
                  <Field label="Phone">
                    <span className="font-mono">{p.patient.phone}</span>
                  </Field>
                )}
              </dl>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">The patient record isn’t available at this clinic.</p>
            )}
          </Panel>

          {p.insurance?.provider && (
            <Panel
              id="inv-insurance"
              title="Insurance or HMO"
              aside={
                p.insurance.status ? (
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${INSURANCE_STATE[p.insurance.status] ?? 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
                    Claim {p.insurance.status}
                  </span>
                ) : null
              }
            >
              <dl className="divide-y divide-gray-100">
                <Field label="Provider">{p.insurance.provider}</Field>
                {p.insurance.coverageType && <Field label="Coverage">{p.insurance.coverageType === 'co-pay' ? 'Co-pay' : capital(p.insurance.coverageType)}</Field>}
                {(p.insurance.coverageAmount ?? 0) > 0 && (
                  <Field label="Covers">
                    <span className="font-mono">{money(p.insurance.coverageAmount ?? 0)}</span>
                  </Field>
                )}
                {p.insurance.memberId && (
                  <Field label="Member ID">
                    <span className="font-mono">{p.insurance.memberId}</span>
                  </Field>
                )}
                {p.insurance.policyNumber && (
                  <Field label="Policy">
                    <span className="font-mono">{p.insurance.policyNumber}</span>
                  </Field>
                )}
                {p.insurance.claimNumber && (
                  <Field label="Claim">
                    <span className="font-mono">{p.insurance.claimNumber}</span>
                  </Field>
                )}
                {p.insurance.notes && <Field label="Notes">{p.insurance.notes}</Field>}
              </dl>
            </Panel>
          )}
        </aside>
      </div>

      {paying && (
        <PaymentDialog
          invoiceId={p._id}
          invoiceNumber={p.invoiceNumber}
          balance={balance}
          money={money}
          onClose={() => setPaying(false)}
          onDone={(amount, left) => {
            setPaying(false);
            inv.reload();
            setNotice({
              text: left > 0.005 ? `Payment of ${money(amount)} recorded. ${money(left)} is still to pay.` : `Payment of ${money(amount)} recorded. The invoice is paid in full.`,
              receipt: true,
            });
          }}
        />
      )}

      {confirmRefund &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setConfirmRefund(false)}
            title="Mark this invoice refunded?"
            description={
              paid > 0
                ? `${who}, ${p.invoiceNumber}. Do this only once the ${money(paid)} paid has gone back to the patient. The invoice then stops counting as collected or owed, takes no more payments, and its receipt can no longer be printed. This can’t be undone.`
                : `${who}, ${p.invoiceNumber}. Nothing has been paid on it. Marking it refunded closes it: its ${money(total)} stops counting as owed and it takes no payments. Use this for an invoice raised by mistake. This can’t be undone.`
            }
          >
            <button type="button" onClick={() => setConfirmRefund(false)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep invoice
            </button>
            <button type="button" onClick={markRefunded} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Mark refunded
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/invoices" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All invoices
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

function Line({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="min-w-0 text-gray-700">{label}</dt>
      <dd className="shrink-0 font-mono tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}
