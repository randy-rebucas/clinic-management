'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ADD_BUTTON, FieldError, Label, REMOVE_BUTTON, Section } from './visits/form/parts';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import { ageFrom } from './visits/form/PatientSummary';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { useSetting } from './SettingsContext';
import { formatApiError } from './utils/apiError';
import { DISCOUNT_LABEL, PF_TYPES, shortDate, useMoney } from './invoices/shared';
import { computeInvoiceTotals, isStatutoryDiscount, roundMoney, statutoryDiscountProblem, type DiscountType, type VatClass } from '@/lib/invoice-totals';
import { VAT_CLASS_LABEL, taxProfileOf } from '@/lib/bir';
import { TIER, type MembershipTier } from '@/lib/memberships';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Service {
  _id: string;
  name: string;
  code?: string;
  category?: string;
  unitPrice: number;
  unit?: string;
  vatClass?: VatClass;
}

interface HmoOption {
  _id: string;
  name: string;
  requiresLoa: boolean;
}

interface FormContext {
  services: Service[];
  doctors: { _id: string; firstName: string; lastName: string }[];
}

interface PatientContext {
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    dateOfBirth?: string;
    discountEligibility?: {
      pwd?: { eligible?: boolean; idNumber?: string };
      senior?: { eligible?: boolean; idNumber?: string };
      membership?: { eligible?: boolean; membershipType?: string; discountPercentage?: number };
    };
  };
  /** Loyalty membership; `discountPercentage` is null unless it is in date. */
  membership: { _id: string; membershipNumber: string; tier: string; state: string; discountPercentage: number | null; points: number } | null;
  openInvoices: { _id: string; invoiceNumber: string; createdAt: string; outstandingBalance?: number }[];
  openBalance: number;
  lastInsurance: { hmo: string | null; provider: string; memberId: string; policyNumber: string } | null;
  visits: { _id: string; visitCode: string; date: string; visitType?: string; status?: string; doctor: string | null; invoice: { _id: string; invoiceNumber: string } | null }[];
}

interface ItemRow {
  _key: string;
  serviceId?: string;
  code: string;
  category: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatClass: VatClass;
}

interface DiscountRow {
  _key: string;
  type: DiscountType;
  mode: 'percent' | 'amount';
  value: string;
  reason: string;
  /** OSCA or PWD ID, for senior citizen and PWD discounts. */
  idNumber: string;
}

type PfType = '' | 'consultation' | 'procedure' | 'reading' | 'other';

const ITEM_COLS = 'sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_7rem_2.25rem]';
const DISCOUNT_COLS = 'sm:grid-cols-[9rem_10.5rem_6.5rem_minmax(0,1fr)_2.25rem]';

let seq = 0;
const key = () => `r${++seq}`;
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const isSixty = (dob?: string) => {
  if (!dob) return false;
  const b = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age--;
  return age >= 60;
};

/**
 * Write an invoice: who it is for (and which visit), the services from the price list, a
 * doctor's professional fee, discounts, and an insurer or HMO. The bill beside the form is worked
 * out with the same arithmetic the server uses, so the total shown is the total saved.
 */
export default function InvoiceForm({
  initialPatient,
  initialVisitId,
  onCancel,
}: {
  initialPatient: PatientOption | null;
  initialVisitId?: string;
  onCancel: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const { money } = useMoney();
  const birSettings = useSetting<unknown>('birSettings', null);
  const taxProfile = useMemo(() => taxProfileOf(birSettings), [birSettings]);
  // Under BIR invoicing VAT replaces the flat tax rate, and no tax is typed by hand.
  const flatRate = Number(useSetting('billingSettings.taxRate', 0)) || 0;
  const taxRate = taxProfile ? 0 : flatRate;

  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [visitId, setVisitId] = useState(initialVisitId ?? '');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [pfAmount, setPfAmount] = useState('');
  const [pfType, setPfType] = useState<PfType>('');
  const [pfDoctor, setPfDoctor] = useState('');
  const [pfNotes, setPfNotes] = useState('');
  const [tax, setTax] = useState('');
  const [insuranceOn, setInsuranceOn] = useState(false);
  const blankInsurance = { hmoId: '', provider: '', memberId: '', policyNumber: '', coverageType: '' as '' | 'full' | 'partial' | 'co-pay', coverageAmount: '', loaNumber: '', loaDate: '' };
  const [insurance, setInsurance] = useState(blankInsurance);
  const hmoList = useKeyedFetch<HmoOption[]>('/api/hmos?active=true');
  const hmos = hmoList.value ?? [];
  const chosenHmo = hmos.find((h) => h._id === insurance.hmoId) ?? null;
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const focusRow = useRef<string | null>(null);

  const ctx = useKeyedFetch<FormContext>('/api/invoices/form-context');
  const pctx = useKeyedFetch<PatientContext>(patient ? `/api/invoices/patient-context?patientId=${patient._id}` : null);
  const pc = pctx.value && pctx.value.patient._id === patient?._id ? pctx.value : null;
  const services = ctx.value?.services ?? [];
  const doctors = ctx.value?.doctors ?? [];

  const dirty = Boolean(patient && patient._id !== initialPatient?._id) || items.length > 0 || discounts.length > 0 || pfAmount !== '' || insuranceOn;
  useUnsavedChanges(dirty && !busy, 'This invoice is not saved yet. Leave anyway?');

  // --- Problems --------------------------------------------------------------

  const itemProblems = useMemo(() => {
    const out: Record<string, { field: 'd' | 'q' | 'p'; text: string }> = {};
    for (const r of items) {
      const q = num(r.quantity);
      const pr = num(r.unitPrice);
      if (!r.description.trim()) out[r._key] = { field: 'd', text: 'Describe the charge, or remove this row.' };
      else if (!Number.isFinite(q) || q <= 0) out[r._key] = { field: 'q', text: 'Quantity must be more than 0.' };
      else if (!Number.isFinite(pr) || pr < 0) out[r._key] = { field: 'p', text: 'Enter a price of 0 or more.' };
    }
    return out;
  }, [items]);

  const discountProblems = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of discounts) {
      const v = num(d.value);
      if (!Number.isFinite(v) || v <= 0) out[d._key] = d.mode === 'percent' ? 'Enter the percentage.' : 'Enter the amount.';
      else if (d.mode === 'percent' && v > 100) out[d._key] = 'A percentage can’t be over 100.';
      else if (taxProfile && isStatutoryDiscount(d.type) && !d.idNumber.trim()) out[d._key] = `Enter the ${d.type === 'senior' ? 'OSCA' : 'PWD'} ID number; BIR invoices need it.`;
    }
    const combined = taxProfile ? statutoryDiscountProblem(discounts) : null;
    const first = discounts.find((d) => isStatutoryDiscount(d.type));
    if (combined && first && !out[first._key]) out[first._key] = combined;
    return out;
  }, [discounts, taxProfile]);

  const pfValue = pfAmount.trim() === '' ? 0 : num(pfAmount);
  const pfProblem = !Number.isFinite(pfValue) || pfValue < 0 ? 'Enter an amount of 0 or more.' : null;
  const taxValue = taxRate > 0 || taxProfile || tax.trim() === '' ? 0 : num(tax);
  const taxProblem = !Number.isFinite(taxValue) || taxValue < 0 ? 'Enter an amount of 0 or more.' : null;
  const coverValue = insurance.coverageAmount.trim() === '' ? 0 : num(insurance.coverageAmount);
  const insuranceProblem = insuranceOn && !insurance.hmoId && !insurance.provider.trim() ? 'Name the insurer or HMO, or remove it.' : insuranceOn && (!Number.isFinite(coverValue) || coverValue < 0) ? 'Enter a covered amount of 0 or more.' : null;
  const patientProblem = patient ? null : 'Choose the patient to bill.';
  const noCharges = items.length === 0 && !(pfValue > 0);

  const problemCount =
    (patientProblem ? 1 : 0) +
    (noCharges ? 1 : 0) +
    Object.keys(itemProblems).length +
    Object.keys(discountProblems).length +
    (pfProblem ? 1 : 0) +
    (taxProblem ? 1 : 0) +
    (insuranceProblem ? 1 : 0);

  // --- Totals (same function as the API) -----------------------------------------

  const totals = computeInvoiceTotals({
    items: items.map((r) => ({ quantity: Math.max(0, num(r.quantity) || 0), unitPrice: Math.max(0, num(r.unitPrice) || 0), vatClass: r.vatClass })),
    discounts: discounts.map((d) => {
      const v = Math.max(0, num(d.value) || 0);
      return d.mode === 'percent' ? { type: d.type, percentage: Math.min(100, v) } : { type: d.type, amount: v };
    }),
    professionalFee: pfProblem ? 0 : pfValue,
    tax: taxProblem ? 0 : taxValue,
    taxRate,
    taxProfile,
  });
  const breakdown = totals.breakdown;
  const statutoryOn = discounts.some((d) => isStatutoryDiscount(d.type));

  // --- Rows ---------------------------------------------------------------------

  const updateItem = (k: string, patch: Partial<ItemRow>) => setItems((rs) => rs.map((r) => (r._key === k ? { ...r, ...patch } : r)));
  const addService = (s: Service) => {
    // The same service again raises the quantity instead of adding a second row.
    const existing = items.find((r) => r.serviceId === s._id);
    if (existing) {
      updateItem(existing._key, { quantity: String((num(existing.quantity) || 0) + 1) });
      return;
    }
    setItems((rs) => [...rs, { _key: key(), serviceId: s._id, code: s.code ?? '', category: s.category ?? '', description: s.name, quantity: '1', unitPrice: String(s.unitPrice ?? 0), vatClass: s.vatClass ?? 'vatable' }]);
  };
  const addCustom = () => {
    const row: ItemRow = { _key: key(), code: '', category: '', description: '', quantity: '1', unitPrice: '', vatClass: 'vatable' };
    focusRow.current = row._key;
    setItems((rs) => [...rs, row]);
  };

  const elig = pc?.patient.discountEligibility;
  const seniorAge = isSixty(pc?.patient.dateOfBirth);
  const quick: { type: DiscountType; label: string; percent: number; reason: string; idNumber?: string }[] = [];
  if (elig?.senior?.eligible || seniorAge) quick.push({ type: 'senior', label: 'Senior citizen 20%', percent: 20, reason: elig?.senior?.idNumber ? `Senior citizen ID ${elig.senior.idNumber}` : 'Senior citizen', idNumber: elig?.senior?.idNumber });
  if (elig?.pwd?.eligible) quick.push({ type: 'pwd', label: 'PWD 20%', percent: 20, reason: elig.pwd.idNumber ? `PWD ID ${elig.pwd.idNumber}` : 'PWD', idNumber: elig.pwd.idNumber });
  const member = pc?.membership;
  if (member?.discountPercentage) {
    const tier = TIER[member.tier as MembershipTier]?.label ?? 'Member';
    quick.push({ type: 'membership', label: `${tier} member ${member.discountPercentage}%`, percent: member.discountPercentage, reason: `${tier} member ${member.membershipNumber}` });
  } else if (elig?.membership?.eligible && (elig.membership.discountPercentage ?? 0) > 0)
    quick.push({ type: 'membership', label: `${elig.membership.membershipType ? `${elig.membership.membershipType} member` : 'Member'} ${elig.membership.discountPercentage}%`, percent: elig.membership.discountPercentage!, reason: elig.membership.membershipType ?? 'Membership' });
  const hasDiscount = (t: DiscountType) => discounts.some((d) => d.type === t);

  const visits = pc?.visits ?? [];
  const chosenVisit = visits.find((v) => v._id === visitId);

  // --- Submit -------------------------------------------------------------------

  const focusFirstProblem = () =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-invoice-form] [aria-invalid="true"], [data-invoice-form] [data-invalid="true"] input');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0 || !patient) {
      focusFirstProblem();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: patient._id,
          ...(visitId ? { visit: visitId } : {}),
          items: items.map((r) => ({
            ...(r.serviceId ? { serviceId: r.serviceId } : {}),
            ...(r.code.trim() ? { code: r.code.trim() } : {}),
            ...(r.category.trim() ? { category: r.category.trim() } : {}),
            ...(taxProfile ? { vatClass: r.vatClass } : {}),
            description: r.description.trim(),
            quantity: num(r.quantity),
            unitPrice: roundMoney(num(r.unitPrice)),
          })),
          ...(pfValue > 0
            ? {
                professionalFee: roundMoney(pfValue),
                ...(pfType ? { professionalFeeType: pfType } : {}),
                ...(pfDoctor ? { professionalFeeDoctor: pfDoctor } : {}),
                ...(pfNotes.trim() ? { professionalFeeNotes: pfNotes.trim() } : {}),
              }
            : {}),
          discounts: discounts.map((d) => ({
            type: d.type,
            ...(d.reason.trim() ? { reason: d.reason.trim() } : {}),
            ...(isStatutoryDiscount(d.type) && d.idNumber.trim() ? { idNumber: d.idNumber.trim() } : {}),
            ...(d.mode === 'percent' ? { percentage: num(d.value) } : { amount: roundMoney(num(d.value)) }),
          })),
          ...(taxRate > 0 || taxProfile ? {} : { tax: roundMoney(taxValue) }),
          ...(insuranceOn
            ? {
                insurance: {
                  provider: chosenHmo ? chosenHmo.name : insurance.provider.trim(),
                  ...(chosenHmo ? { hmo: chosenHmo._id } : {}),
                  ...(insurance.loaNumber.trim() ? { loaNumber: insurance.loaNumber.trim() } : {}),
                  ...(insurance.loaDate ? { loaDate: insurance.loaDate } : {}),
                  ...(insurance.memberId.trim() ? { memberId: insurance.memberId.trim() } : {}),
                  ...(insurance.policyNumber.trim() ? { policyNumber: insurance.policyNumber.trim() } : {}),
                  ...(insurance.coverageType ? { coverageType: insurance.coverageType } : {}),
                  ...(coverValue > 0 ? { coverageAmount: roundMoney(coverValue) } : {}),
                  status: 'pending',
                },
              }
            : {}),
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFailure(formatApiError(json, 'The invoice could not be saved'));
        setBusy(false);
        return;
      }
      // Straight to the invoice, where the payment is taken.
      router.push(`/invoices/${json.data._id}?created=1`);
    } catch {
      setFailure('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
    }
  };

  const status = busy
    ? 'Saving the invoice…'
    : attempted && problemCount > 0
      ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing before the invoice can be saved.`
      : noCharges
        ? 'Add what the patient is being billed for.'
        : `Saving bills ${patient ? `${patient.firstName} ${patient.lastName}` : 'the patient'} ${money(totals.total)}. The payment is recorded on the next page.`;

  return (
    <form data-invoice-form onSubmit={submit} noValidate autoComplete="off" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {failure && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <p>{failure}</p>
            <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}

        {/* Patient and visit */}
        <Section id={`${ids}-who`} title="Patient">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div data-invalid={attempted && patientProblem ? 'true' : undefined}>
              <PatientSearch
                value={patient}
                onChange={(p) => {
                  setPatient(p);
                  setVisitId('');
                  setDiscounts((ds) => ds.filter((d) => d.type === 'promotional' || d.type === 'other'));
                }}
                autoFocus={!initialPatient}
              />
              {attempted && patientProblem && <FieldError id={`${ids}-patient-err`}>{patientProblem}</FieldError>}
            </div>
            {patient && visits.length > 0 && (
              <div>
                <Label htmlFor={`${ids}-visit`} optional>
                  For visit
                </Label>
                <select id={`${ids}-visit`} value={visitId} onChange={(e) => setVisitId(e.target.value)} className={FIELD}>
                  <option value="">Not linked to a visit</option>
                  {visits.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.visitCode} · {shortDate(v.date)}
                      {v.doctor ? ` · ${v.doctor}` : ''}
                      {v.invoice ? ` · billed (${v.invoice.invoiceNumber})` : ''}
                    </option>
                  ))}
                  {visitId && !chosenVisit && <option value={visitId}>The visit you came from</option>}
                </select>
                {chosenVisit?.invoice ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
                    <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      This visit already has invoice{' '}
                      <Link href={`/invoices/${chosenVisit.invoice._id}`} target="_blank" className={`rounded font-mono font-semibold underline underline-offset-2 ${FOCUS_RING}`}>
                        {chosenVisit.invoice.invoiceNumber}
                      </Link>
                      . Bill it again only for charges not on that one.
                    </span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-500">Linked invoices show on the visit under “From this visit”.</p>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* Services */}
        <Section
          id={`${ids}-items`}
          title="Services"
          hint="Pick from the clinic’s price list; prices can be changed for this invoice."
          aside={
            items.length > 0 ? (
              <span className="text-sm text-gray-500">
                <span className="font-mono tabular-nums text-gray-900">{money(totals.subtotal)}</span>
              </span>
            ) : null
          }
        >
          <div className="border-b border-gray-100 px-5 py-3">
            <ServicePicker services={services} loading={ctx.loading && !ctx.value} failed={Boolean(ctx.error)} money={money} onPick={addService} />
          </div>
          {items.length > 0 && (
            <div aria-hidden="true" className={`hidden gap-3 px-5 pt-3 text-xs font-medium text-gray-500 sm:grid ${ITEM_COLS}`}>
              <span>Charge</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
            </div>
          )}
          <ul className="divide-y divide-gray-100 sm:divide-y-0">
            {items.map((r, i) => {
              const rid = `${ids}-i${r._key}`;
              const err = attempted || r.description.trim() ? itemProblems[r._key] : undefined;
              const bad = (f: 'd' | 'q' | 'p') => err?.field === f;
              const label = r.description.trim() || `charge ${i + 1}`;
              return (
                <li key={r._key} className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${ITEM_COLS}`}>
                  <div className="min-w-0">
                    <RowLabel htmlFor={`${rid}-d`}>Charge</RowLabel>
                    <input
                      ref={(el) => {
                        if (el && focusRow.current === r._key) {
                          focusRow.current = null;
                          el.focus();
                        }
                      }}
                      id={`${rid}-d`}
                      value={r.description}
                      onChange={(e) => updateItem(r._key, { description: e.target.value })}
                      placeholder="e.g. Wound dressing"
                      maxLength={1000}
                      aria-invalid={bad('d')}
                      aria-describedby={bad('d') ? `${rid}-err` : undefined}
                      className={`${FIELD} ${bad('d') ? 'border-red-400' : ''}`}
                    />
                    {(r.code || r.category || taxProfile?.regime === 'vat') && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-gray-500">
                        {r.code && <span className="font-mono">{r.code}</span>}
                        {r.code && r.category && ' · '}
                        {r.category}
                        {taxProfile?.regime === 'vat' && (
                          <>
                            {(r.code || r.category) && ' · '}
                            <label htmlFor={`${rid}-vat`} className="sr-only">
                              VAT treatment
                            </label>
                            <select
                              id={`${rid}-vat`}
                              value={r.vatClass}
                              onChange={(e) => updateItem(r._key, { vatClass: e.target.value as VatClass })}
                              className={`rounded border-0 bg-transparent py-0 pl-0 pr-5 text-xs text-gray-600 ${FOCUS_RING}`}
                            >
                              {(Object.keys(VAT_CLASS_LABEL) as VatClass[]).map((c) => (
                                <option key={c} value={c}>
                                  {VAT_CLASS_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-q`}>Quantity</RowLabel>
                    <input
                      id={`${rid}-q`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="1"
                      value={r.quantity}
                      onChange={(e) => updateItem(r._key, { quantity: e.target.value })}
                      aria-invalid={bad('q')}
                      aria-describedby={bad('q') ? `${rid}-err` : undefined}
                      className={`${FIELD} text-right font-mono tabular-nums ${bad('q') ? 'border-red-400' : ''}`}
                    />
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-p`}>Unit price</RowLabel>
                    <input
                      id={`${rid}-p`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={r.unitPrice}
                      onChange={(e) => updateItem(r._key, { unitPrice: e.target.value })}
                      placeholder="0.00"
                      aria-invalid={bad('p')}
                      aria-describedby={bad('p') ? `${rid}-err` : undefined}
                      className={`${FIELD} text-right font-mono tabular-nums ${bad('p') ? 'border-red-400' : ''}`}
                    />
                  </div>
                  <p className="self-center text-right font-mono text-sm font-medium tabular-nums text-gray-900">
                    <span className="font-sans font-normal text-gray-500 sm:hidden">Amount </span>
                    {money(totals.items[i]?.total ?? 0)}
                  </p>
                  <button type="button" onClick={() => setItems((rs) => rs.filter((x) => x._key !== r._key))} aria-label={`Remove ${label}`} title={`Remove ${label}`} className={`${REMOVE_BUTTON} justify-self-end sm:mt-0.5 sm:justify-self-auto`}>
                    <Svg d={ICON.x} />
                  </button>
                  {err && (
                    <div className="sm:col-span-full sm:-mt-1">
                      <FieldError id={`${rid}-err`}>{err.text}</FieldError>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-4">
            <button type="button" onClick={addCustom} className={ADD_BUTTON}>
              <Svg d="M12 4v16m8-8H4" />
              Add a charge not on the price list
            </button>
            {attempted && noCharges && <FieldError id={`${ids}-none`}>Add at least one service, or a professional fee.</FieldError>}
          </div>
        </Section>

        {/* Professional fee */}
        <Section
          id={`${ids}-pf`}
          title="Professional fee"
          hint={
            taxProfile
              ? 'The doctor’s own fee, billed apart from the clinic’s services. Only a senior citizen or PWD discount reduces it, as the law requires.'
              : 'The doctor’s own fee, billed apart from the clinic’s services. Discounts don’t reduce it.'
          }
        >
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${ids}-pf-amount`} optional>
                Amount
              </Label>
              <input
                id={`${ids}-pf-amount`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={pfAmount}
                onChange={(e) => setPfAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={Boolean(attempted && pfProblem)}
                className={`${FIELD} text-right font-mono tabular-nums sm:max-w-[12rem] ${attempted && pfProblem ? 'border-red-400' : ''}`}
              />
              {attempted && pfProblem && <FieldError id={`${ids}-pf-err`}>{pfProblem}</FieldError>}
            </div>
            <div>
              <Label htmlFor={`${ids}-pf-doctor`} optional>
                Doctor
              </Label>
              <select id={`${ids}-pf-doctor`} value={pfDoctor} onChange={(e) => setPfDoctor(e.target.value)} disabled={!ctx.value} className={FIELD}>
                <option value="">{ctx.value ? 'Not named' : ctx.error ? 'Doctor list unavailable' : 'Loading doctors…'}</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.firstName} {d.lastName}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">
                For <span className="font-normal text-gray-500">(optional)</span>
              </legend>
              <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
                {PF_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input
                      type="radio"
                      name={`${ids}-pf-type`}
                      value={t.value}
                      checked={pfType === t.value}
                      onChange={() => setPfType(t.value)}
                      onClick={() => pfType === t.value && setPfType('')}
                      className="sr-only"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Label htmlFor={`${ids}-pf-notes`} optional>
                Note
              </Label>
              <input id={`${ids}-pf-notes`} value={pfNotes} onChange={(e) => setPfNotes(e.target.value)} maxLength={2000} placeholder="e.g. ECG reading" className={FIELD} />
            </div>
          </div>
        </Section>

        {/* Discounts */}
        <Section
          id={`${ids}-disc`}
          title="Discounts"
          hint="Taken off the services, in the order listed. Together they never exceed the services total."
          aside={
            totals.discounts.length > 0 ? (
              <span className="font-mono text-sm tabular-nums text-gray-900">−{money(totals.discounts.reduce((s, d) => s + d.amount, 0))}</span>
            ) : null
          }
        >
          {(quick.length > 0 || patient) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
              {quick.length > 0 ? (
                <>
                  <span className="text-sm text-gray-500">This patient qualifies for:</span>
                  {quick.map((q) => {
                    const on = hasDiscount(q.type);
                    return (
                      <button
                        key={q.type}
                        type="button"
                        disabled={on}
                        onClick={() => setDiscounts((ds) => [...ds, { _key: key(), type: q.type, mode: 'percent', value: String(q.percent), reason: q.reason, idNumber: q.idNumber ?? '' }])}
                        aria-label={on ? `${q.label} is applied` : `Apply ${q.label}`}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${on ? 'cursor-default border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep' : `border-gray-300 bg-white text-gray-700 hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`}`}
                      >
                        <Svg d={on ? ICON.check : 'M12 4v16m8-8H4'} className="h-3.5 w-3.5" />
                        {q.label}
                      </button>
                    );
                  })}
                  {seniorAge && !elig?.senior?.eligible && <span className="w-full text-xs text-gray-500">Senior citizen by age; check their ID before applying.</span>}
                </>
              ) : (
                pc && <span className="text-sm text-gray-500">No senior, PWD or membership discount on file for this patient.</span>
              )}
              {member && !member.discountPercentage && (
                <span className="w-full text-xs text-amber-800">
                  Membership <span className="font-mono">{member.membershipNumber}</span> is {member.state === 'expired' ? 'expired' : member.state}, so it gives no discount.{' '}
                  <Link href={`/memberships/${member._id}`} target="_blank" className={`rounded font-semibold underline hover:text-amber-900 ${FOCUS_RING}`}>
                    Open the membership
                  </Link>
                </span>
              )}
            </div>
          )}
          {discounts.length > 0 && (
            <div aria-hidden="true" className={`hidden gap-3 px-5 pt-3 text-xs font-medium text-gray-500 sm:grid ${DISCOUNT_COLS}`}>
              <span>Kind</span>
              <span>Taken as</span>
              <span className="text-right">Value</span>
              <span>Reason or ID</span>
            </div>
          )}
          <ul className="divide-y divide-gray-100 sm:divide-y-0">
            {discounts.map((d, i) => {
              const rid = `${ids}-d${d._key}`;
              const err = attempted || d.value.trim() ? discountProblems[d._key] : undefined;
              const applied = totals.discounts[i]?.amount ?? 0;
              const update = (patch: Partial<DiscountRow>) => setDiscounts((ds) => ds.map((x) => (x._key === d._key ? { ...x, ...patch } : x)));
              return (
                <li key={d._key} className={`motion-row-in grid gap-3 px-5 py-3 sm:items-start sm:py-2 ${DISCOUNT_COLS}`}>
                  <div>
                    <RowLabel htmlFor={`${rid}-t`}>Kind</RowLabel>
                    <select id={`${rid}-t`} value={d.type} onChange={(e) => update({ type: e.target.value as DiscountType })} className={FIELD}>
                      {Object.entries(DISCOUNT_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-m`}>Taken as</RowLabel>
                    <select id={`${rid}-m`} value={d.mode} onChange={(e) => update({ mode: e.target.value as DiscountRow['mode'] })} className={FIELD}>
                      <option value="percent">% of services</option>
                      <option value="amount">Fixed amount</option>
                    </select>
                  </div>
                  <div>
                    <RowLabel htmlFor={`${rid}-v`}>Value</RowLabel>
                    <input
                      id={`${rid}-v`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={d.mode === 'percent' ? 100 : undefined}
                      step={d.mode === 'percent' ? '1' : '0.01'}
                      value={d.value}
                      onChange={(e) => update({ value: e.target.value })}
                      aria-invalid={Boolean(err)}
                      aria-describedby={err ? `${rid}-err` : `${rid}-hint`}
                      className={`${FIELD} text-right font-mono tabular-nums ${err ? 'border-red-400' : ''}`}
                    />
                  </div>
                  <div>
                    {isStatutoryDiscount(d.type) && taxProfile ? (
                      <>
                        <RowLabel htmlFor={`${rid}-id`}>{d.type === 'senior' ? 'OSCA ID' : 'PWD ID'}</RowLabel>
                        <input
                          id={`${rid}-id`}
                          value={d.idNumber}
                          onChange={(e) => update({ idNumber: e.target.value })}
                          maxLength={200}
                          placeholder={d.type === 'senior' ? 'OSCA ID number' : 'PWD ID number'}
                          aria-label={d.type === 'senior' ? 'OSCA ID number' : 'PWD ID number'}
                          className={`${FIELD} font-mono`}
                        />
                      </>
                    ) : (
                      <>
                        <RowLabel htmlFor={`${rid}-r`}>Reason or ID</RowLabel>
                        <input id={`${rid}-r`} value={d.reason} onChange={(e) => update({ reason: e.target.value })} maxLength={200} placeholder={d.type === 'promotional' ? 'e.g. October check-up promo' : 'Optional'} className={FIELD} />
                      </>
                    )}
                  </div>
                  <button type="button" onClick={() => setDiscounts((ds) => ds.filter((x) => x._key !== d._key))} aria-label={`Remove ${DISCOUNT_LABEL[d.type]} discount`} title="Remove discount" className={`${REMOVE_BUTTON} justify-self-end sm:mt-0.5 sm:justify-self-auto`}>
                    <Svg d={ICON.x} />
                  </button>
                  <div className="sm:col-span-full sm:-mt-1">
                    {err ? (
                      <FieldError id={`${rid}-err`}>{err}</FieldError>
                    ) : (
                      <p id={`${rid}-hint`} className="text-xs text-gray-500">
                        Takes <span className="font-mono text-gray-900">{money(applied)}</span> off
                        {taxProfile && isStatutoryDiscount(d.type)
                          ? taxProfile.regime === 'vat'
                            ? ' the services and professional fee net of VAT; the sale is VAT-exempt'
                            : ' the services and professional fee'
                          : d.mode === 'amount' && num(d.value) > applied + 0.005 && ' (all that is left of the services)'}
                        .
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-4">
            <button type="button" onClick={() => setDiscounts((ds) => [...ds, { _key: key(), type: 'promotional', mode: 'percent', value: '', reason: '', idNumber: '' }])} className={ADD_BUTTON}>
              <Svg d="M12 4v16m8-8H4" />
              Add a discount
            </button>
          </div>
        </Section>

        {/* Tax and insurer */}
        <Section id={`${ids}-more`} title={taxRate > 0 || taxProfile ? 'Insurance or HMO' : 'Tax, insurance or HMO'}>
          <div className="grid gap-4 px-5 py-4">
            {taxRate === 0 && !taxProfile && (
              <div className="sm:max-w-[12rem]">
                <Label htmlFor={`${ids}-tax`} optional>
                  Tax
                </Label>
                <input
                  id={`${ids}-tax`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(attempted && taxProblem)}
                  className={`${FIELD} text-right font-mono tabular-nums ${attempted && taxProblem ? 'border-red-400' : ''}`}
                />
                {attempted && taxProblem ? <FieldError id={`${ids}-tax-err`}>{taxProblem}</FieldError> : <p className="mt-1.5 text-xs text-gray-500">No tax rate is set in Settings, so enter it here if any.</p>}
              </div>
            )}

            {!insuranceOn ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setInsuranceOn(true);
                    // Start from the card the patient used last time.
                    const last = pc?.lastInsurance;
                    if (last) {
                      const known = last.hmo && hmos.some((h) => h._id === last.hmo) ? last.hmo : '';
                      setInsurance({ ...blankInsurance, hmoId: known, provider: known ? '' : last.provider, memberId: last.memberId, policyNumber: last.policyNumber });
                    } else if (hmos.length) setInsurance({ ...blankInsurance, hmoId: hmos[0]._id });
                  }}
                  className={ADD_BUTTON}
                >
                  <Svg d="M12 4v16m8-8H4" />
                  An insurer or HMO covers part of this
                </button>
              </div>
            ) : (
              <div className="grid gap-4 rounded-md border border-gray-200 p-4 sm:grid-cols-2" data-invalid={attempted && insuranceProblem ? 'true' : undefined}>
                <div className="flex items-start justify-between gap-3 sm:col-span-2">
                  <p className="text-sm font-semibold text-gray-900">Insurer or HMO</p>
                  <button
                    type="button"
                    onClick={() => {
                      setInsuranceOn(false);
                      setInsurance(blankInsurance);
                    }}
                    className={`rounded text-sm font-semibold text-gray-600 hover:text-red-700 ${FOCUS_RING}`}
                  >
                    Remove
                  </button>
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-h`}>Name</Label>
                  {hmos.length > 0 && (
                    <select
                      id={`${ids}-ins-h`}
                      value={insurance.hmoId}
                      onChange={(e) => setInsurance((s) => ({ ...s, hmoId: e.target.value }))}
                      className={`${FIELD} ${insurance.hmoId ? '' : 'mb-2'}`}
                    >
                      {hmos.map((h) => (
                        <option key={h._id} value={h._id}>
                          {h.name}
                        </option>
                      ))}
                      <option value="">Not on the list…</option>
                    </select>
                  )}
                  {!insurance.hmoId && (
                    <input
                      id={hmos.length ? `${ids}-ins-p` : `${ids}-ins-h`}
                      value={insurance.provider}
                      onChange={(e) => setInsurance((s) => ({ ...s, provider: e.target.value }))}
                      maxLength={200}
                      placeholder="e.g. Maxicare, Intellicare"
                      aria-label={hmos.length ? 'Insurer or HMO name' : undefined}
                      aria-invalid={Boolean(attempted && insuranceProblem && !insurance.provider.trim())}
                      className={`${FIELD} ${attempted && insuranceProblem && !insurance.provider.trim() ? 'border-red-400' : ''}`}
                    />
                  )}
                  {!insurance.hmoId && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      Only HMOs on the{' '}
                      <Link href="/hmo-claims?tab=hmos" target="_blank" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                        HMO list
                      </Link>{' '}
                      can be sent in a transmittal.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-m`} optional>
                    Member ID
                  </Label>
                  <input id={`${ids}-ins-m`} value={insurance.memberId} onChange={(e) => setInsurance((s) => ({ ...s, memberId: e.target.value }))} maxLength={200} className={`${FIELD} font-mono`} />
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-c`} optional>
                    Coverage
                  </Label>
                  <select id={`${ids}-ins-c`} value={insurance.coverageType} onChange={(e) => setInsurance((s) => ({ ...s, coverageType: e.target.value as typeof s.coverageType }))} className={FIELD}>
                    <option value="">Not stated</option>
                    <option value="full">Full</option>
                    <option value="partial">Partial</option>
                    <option value="co-pay">Co-pay</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-a`} optional>
                    Amount covered
                  </Label>
                  <input
                    id={`${ids}-ins-a`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={insurance.coverageAmount}
                    onChange={(e) => setInsurance((s) => ({ ...s, coverageAmount: e.target.value }))}
                    placeholder="0.00"
                    className={`${FIELD} text-right font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-loa`} optional={!chosenHmo?.requiresLoa}>
                    LOA number
                  </Label>
                  <input
                    id={`${ids}-ins-loa`}
                    value={insurance.loaNumber}
                    onChange={(e) => setInsurance((s) => ({ ...s, loaNumber: e.target.value }))}
                    maxLength={200}
                    placeholder="Approval code"
                    className={`${FIELD} font-mono`}
                  />
                  {chosenHmo?.requiresLoa && !insurance.loaNumber.trim() && (
                    <p className="mt-1.5 text-xs text-amber-800">{chosenHmo.name} needs it before the claim can be sent. You can add it later.</p>
                  )}
                </div>
                <div>
                  <Label htmlFor={`${ids}-ins-load`} optional>
                    LOA date
                  </Label>
                  <input id={`${ids}-ins-load`} type="date" value={insurance.loaDate} onChange={(e) => setInsurance((s) => ({ ...s, loaDate: e.target.value }))} className={`${FIELD} font-mono`} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`${ids}-ins-n`} optional>
                    Policy number
                  </Label>
                  <input id={`${ids}-ins-n`} value={insurance.policyNumber} onChange={(e) => setInsurance((s) => ({ ...s, policyNumber: e.target.value }))} maxLength={200} className={`${FIELD} font-mono sm:max-w-sm`} />
                </div>
                <p className="text-xs text-gray-500 sm:col-span-2">
                  The claim starts as pending and waits under HMO claims to be sent in a transmittal; the HMO’s payment is recorded there.
                </p>
                {attempted && insuranceProblem && (
                  <div className="sm:col-span-2">
                    <FieldError id={`${ids}-ins-err`}>{insuranceProblem}</FieldError>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${attempted && problemCount > 0 && !busy ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
            {status}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard this invoice?')) return;
                onCancel();
              }}
              disabled={busy}
              className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : 'Create invoice'}
            </button>
          </div>
        </div>
      </div>

      {/* The bill, worked out as you go */}
      <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20">
        <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby={`${ids}-bill`}>
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 id={`${ids}-bill`} className="text-base font-bold tracking-tight text-gray-900">
              Bill
            </h2>
          </div>
          <dl className="px-5 py-4 text-sm">
            <BillLine label="Services" value={money(totals.subtotal)} muted={items.length === 0} />
            {breakdown && statutoryOn ? (
              <>
                {totals.professionalFee > 0 && <BillLine label="Professional fee" value={money(totals.professionalFee)} />}
                {breakdown.lessVat > 0 && <BillLine label="Less VAT (VAT-exempt sale)" value={`−${money(breakdown.lessVat)}`} />}
                {totals.discounts.map((d, i) =>
                  d.amount > 0 ? <BillLine key={i} label={`${DISCOUNT_LABEL[d.type]} discount`} value={`−${money(d.amount)}`} /> : null
                )}
              </>
            ) : (
              <>
                {totals.discounts.map((d, i) =>
                  d.amount > 0 ? <BillLine key={i} label={`${DISCOUNT_LABEL[d.type]} discount`} value={`−${money(d.amount)}`} /> : null
                )}
                {totals.professionalFee > 0 && <BillLine label="Professional fee" value={money(totals.professionalFee)} />}
              </>
            )}
            {breakdown?.regime === 'vat' && !taxProfile?.pricesIncludeVat && totals.tax > 0 && (
              <BillLine
                label={
                  <>
                    VAT<span className="font-mono text-gray-500"> {taxProfile?.vatRate}%</span>
                  </>
                }
                value={money(totals.tax)}
              />
            )}
            {!breakdown && (taxRate > 0 || totals.tax > 0) && (
              <BillLine
                label={
                  <>
                    Tax{taxRate > 0 && <span className="font-mono text-gray-500"> {taxRate}%</span>}
                  </>
                }
                value={money(totals.tax)}
              />
            )}
            <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-gray-200 pt-3">
              <dt className="font-semibold text-gray-900">Total</dt>
              <dd className="font-mono text-2xl font-semibold tabular-nums text-gray-900" aria-live="polite">
                {money(totals.total)}
              </dd>
            </div>
            {breakdown?.regime === 'vat' && totals.total > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-dashed border-gray-200 pt-2 text-xs text-gray-500">
                <span>VATable sales</span>
                <span className="text-right font-mono tabular-nums">{money(breakdown.vatableSales)}</span>
                <span>VAT{taxProfile?.pricesIncludeVat ? ' (included)' : ''}</span>
                <span className="text-right font-mono tabular-nums">{money(breakdown.vatAmount)}</span>
                <span>VAT-exempt sales</span>
                <span className="text-right font-mono tabular-nums">{money(breakdown.vatExemptSales)}</span>
                <span>Zero-rated sales</span>
                <span className="text-right font-mono tabular-nums">{money(breakdown.zeroRatedSales)}</span>
              </div>
            )}
            {insuranceOn && coverValue > 0 && Number.isFinite(coverValue) && (
              <p className="mt-2 text-xs text-gray-500">
                <span className="font-mono">{money(Math.min(coverValue, totals.total))}</span> expected from {chosenHmo?.name || insurance.provider.trim() || 'the insurer'}; the patient pays the rest.
              </p>
            )}
          </dl>
        </section>

        {patient && pc && (
          <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby={`${ids}-acct`}>
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id={`${ids}-acct`} className="text-base font-bold tracking-tight text-gray-900">
                {pc.patient.firstName}’s account
              </h2>
              {pc.patient.dateOfBirth && <p className="mt-0.5 text-sm text-gray-500">{ageFrom(pc.patient.dateOfBirth)}</p>}
            </div>
            {pc.openInvoices.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">Nothing owed on earlier invoices.</p>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm text-amber-800">
                  Already owes <span className="font-mono font-semibold">{money(pc.openBalance)}</span> on {pc.openInvoices.length === 1 ? 'an earlier invoice' : `${pc.openInvoices.length} earlier invoices`}.
                </p>
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {pc.openInvoices.slice(0, 5).map((o) => (
                    <li key={o._id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <Link href={`/invoices/${o._id}`} target="_blank" className={`rounded font-mono text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        {o.invoiceNumber}
                      </Link>
                      <span className="text-xs text-gray-500">{shortDate(o.createdAt)}</span>
                      <span className="font-mono tabular-nums text-gray-900">{money(o.outstandingBalance ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {!patient && (
          <div className="rounded-lg border border-dashed border-gray-300 px-5 py-6 text-center text-sm text-gray-500">
            Choose the patient to see what they already owe and the discounts they qualify for.
          </div>
        )}
      </aside>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Price-list combobox: type to filter by name, code or category; Enter or a click adds the charge. */
function ServicePicker({
  services,
  loading,
  failed,
  money,
  onPick,
}: {
  services: Service[];
  loading: boolean;
  failed: boolean;
  money: (v: number) => string;
  onPick: (s: Service) => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = q
    ? services.filter((s) => s.name.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const show = open && q !== '';
  const listId = `${ids}-list`;

  const pick = (s: Service) => {
    onPick(s);
    setQuery('');
    setHighlight(0);
  };

  return (
    <div className="relative sm:max-w-md">
      <label htmlFor={`${ids}-in`} className="mb-1.5 block text-sm font-medium text-gray-700">
        Add from the price list
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Svg d={ICON.search} />
        </span>
        <input
          id={`${ids}-in`}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && matches[highlight] ? `${ids}-o${highlight}` : undefined}
          value={query}
          disabled={failed}
          placeholder={failed ? 'The price list didn’t load; add charges by hand' : loading ? 'Loading the price list…' : 'Service name, code or category'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(matches.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[highlight]) pick(matches[highlight]);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className={`${FIELD} pl-9`}
        />
      </div>
      {show && (
        <div className="motion-panel-in absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
          {matches.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Matching services">
              {matches.map((s, i) => (
                <li
                  key={s._id}
                  id={`${ids}-o${i}`}
                  role="option"
                  aria-selected={highlight === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 ${highlight === i ? 'bg-brand-teal-light/60' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{s.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {s.code && <span className="font-mono">{s.code}</span>}
                      {s.code && s.category && ' · '}
                      {s.category}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-gray-900">
                    {money(s.unitPrice ?? 0)}
                    {s.unit && <span className="font-sans text-xs text-gray-500"> / {s.unit}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} className="px-3 py-3 text-sm text-gray-500">
              Nothing on the price list matches “{query.trim()}”. Use “Add a charge not on the price list” below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RowLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 sm:sr-only">
      {children}
    </label>
  );
}

function BillLine({ label, value, muted }: { label: ReactNode; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="min-w-0 text-gray-700">{label}</dt>
      <dd className={`shrink-0 font-mono tabular-nums ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</dd>
    </div>
  );
}
