'use client';

import { useState, type ReactNode } from 'react';
import type { PlatformConfigView } from '@/lib/platform-config-page';
import type { BillingIssuer, PlatformFees } from '@/lib/platform-config-schema';
import { PAID_PLANS, planLabel, type PlanPricing } from '@/lib/subscription-period';
import { formatSerial, formatTin } from '@/lib/bir';
import { FIELD } from '../appointments/shared';
import { CARD, H2, ago, php } from './shared';
import { LABEL, Notice, OUTLINE, PRIMARY } from './platform-api';

type Section = 'billing-issuer' | 'paymongo' | 'pricing' | 'fees';
type Errors = Record<string, string>;
type Note = { tone: 'ok' | 'error'; text: string } | null;

/** PUT one section; returns the refreshed view, or the error and per-field messages. */
async function save(section: Section, values: unknown): Promise<{ ok: true; data: PlatformConfigView } | { ok: false; error: string; fields: Errors }> {
  try {
    const res = await fetch('/api/platform/configuration', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, values }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, error: 'Your platform session ended. Sign in again.', fields: {} };
    if (!res.ok || !json?.success) return { ok: false, error: json?.error || 'That didn’t save.', fields: json?.fieldErrors ?? {} };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: 'The server couldn’t be reached. Nothing was changed.', fields: {} };
  }
}

/** Platform → Configuration: one card per section, each saved on its own. */
export default function PlatformConfigurationForms({ initial }: { initial: PlatformConfigView }) {
  const [view, setView] = useState(initial);
  return (
    <div className="space-y-6">
      {view.fallbacks.length > 0 && (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Not set here yet</p>
          <p className="mt-0.5">
            These still use the server&rsquo;s env values or built-in defaults: {view.fallbacks.join('; ')}.
          </p>
        </div>
      )}
      <IssuerCard view={view} onSaved={setView} />
      <PaymongoCard view={view} onSaved={setView} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PricingCard view={view} onSaved={setView} />
        <FeesCard view={view} onSaved={setView} />
      </div>
    </div>
  );
}

function Card({ id, title, meta, children }: { id: string; title: string; meta: PlatformConfigView['updated'][Section]; children: ReactNode }) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className={H2}>{title}</h2>
        <p className="text-xs text-gray-500">{meta ? `Saved ${ago(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}` : 'Never saved here'}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function useSection(section: Section, onSaved: (v: PlatformConfigView) => void) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [note, setNote] = useState<Note>(null);
  async function submit(values: unknown, ok: string) {
    setBusy(true);
    setNote(null);
    const r = await save(section, values);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fields);
      setNote({ tone: 'error', text: r.error });
      return false;
    }
    setErrors({});
    setNote({ tone: 'ok', text: ok });
    onSaved(r.data);
    return true;
  }
  return { busy, errors, note, submit };
}

const EMPTY_ISSUER: BillingIssuer = {
  sellerName: 'DevCom Digital',
  tradeName: '',
  tin: '',
  branchCode: '00000',
  address: '',
  vatRegime: 'non_vat',
  vatRate: 12,
  permitNumber: '',
  permitIssuedOn: '',
  serialPrefix: '',
  serialStart: 1,
  serialEnd: 1000,
  footerNote: '',
};

function IssuerCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [v, setV] = useState<BillingIssuer>(view.issuer ?? EMPTY_ISSUER);
  const { busy, errors, note, submit } = useSection('billing-issuer', onSaved);
  const set = <K extends keyof BillingIssuer>(k: K, value: BillingIssuer[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const text = (k: keyof BillingIssuer, label: string, opts: { hint?: string; max?: number; placeholder?: string } = {}) => (
    <Field id={`iss-${k}`} label={label} hint={opts.hint} error={errors[k]}>
      <input
        id={`iss-${k}`}
        value={String(v[k] ?? '')}
        maxLength={opts.max ?? 200}
        placeholder={opts.placeholder}
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `iss-${k}-error` : undefined}
        onChange={(e) => set(k, e.target.value as never)}
        className={FIELD}
      />
    </Field>
  );

  return (
    <Card id="cfg-issuer" title="BIR issuer: DevCom Digital" meta={view.updated['billing-issuer']}>
      <p className="mb-4 text-sm text-gray-600">
        Printed as the seller on every subscription sales invoice. Each invoice keeps a copy of these details as they were
        when it was issued.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ ...v, tin: v.tin.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1-$2-$3') }, 'Issuer details saved.');
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {text('sellerName', 'Registered name', { hint: 'As on the Certificate of Registration (Form 2303)' })}
          {text('tradeName', 'Business (trade) name', { hint: 'Optional' })}
          {text('tin', 'TIN', { placeholder: '123-456-789', max: 11 })}
          {text('branchCode', 'Branch code', { hint: '00000 is the head office', max: 5 })}
        </div>
        {text('address', 'Registered address', { max: 500 })}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="iss-vat" label="Tax type" error={errors.vatRegime}>
            <select id="iss-vat" value={v.vatRegime} onChange={(e) => set('vatRegime', e.target.value as BillingIssuer['vatRegime'])} className={FIELD}>
              <option value="non_vat">Non-VAT</option>
              <option value="vat">VAT-registered</option>
            </select>
          </Field>
          {v.vatRegime === 'vat' && (
            <Field id="iss-vatrate" label="VAT rate (%)" error={errors.vatRate}>
              <input id="iss-vatrate" type="number" min={0} max={30} step="any" value={v.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))} className={FIELD} />
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('permitNumber', 'ATP / permit number', { max: 100 })}
          {text('permitIssuedOn', 'Issued on', { placeholder: 'e.g. 2026-01-15', max: 40 })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {text('serialPrefix', 'Serial prefix', { hint: 'Up to 6 letters or digits; blank for none', max: 6 })}
          <Field id="iss-start" label="Range starts at" error={errors.serialStart}>
            <input id="iss-start" type="number" min={1} value={v.serialStart} onChange={(e) => set('serialStart', Number(e.target.value))} className={FIELD} />
          </Field>
          <Field id="iss-end" label="Range ends at" error={errors.serialEnd}>
            <input id="iss-end" type="number" min={1} value={v.serialEnd} onChange={(e) => set('serialEnd', Number(e.target.value))} className={FIELD} />
          </Field>
        </div>
        {view.serials && view.issuer && (
          <p className="text-sm text-gray-600">
            {view.serials.last > 0 ? (
              <>Last issued <span className="font-mono">{formatSerial(view.issuer.serialPrefix, view.serials.last)}</span>; </>
            ) : (
              'None issued yet; '
            )}
            <span className="font-semibold tabular-nums text-gray-900">{view.serials.remaining.toLocaleString('en-US')}</span> left in the range.
          </p>
        )}
        <Field id="iss-footer" label="Invoice footer note" hint="Optional, e.g. “This document is not valid for claim of input tax.”" error={errors.footerNote}>
          <textarea id="iss-footer" rows={2} maxLength={500} value={v.footerNote} onChange={(e) => set('footerNote', e.target.value)} className={FIELD} />
        </Field>
        {v.tin.replace(/\D/g, '').length === 9 && (
          <p className="text-xs text-gray-500">Prints as TIN {formatTin(v.tin.replace(/\D/g, ''), v.branchCode)}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save issuer details'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}

function PaymongoCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<Note>(null);
  const { busy, errors, note, submit } = useSection('paymongo', onSaved);
  const s = view.paymongo;

  async function test() {
    setTesting(true);
    setTestNote(null);
    try {
      const res = await fetch('/api/platform/configuration/paymongo-test', { method: 'POST' });
      const json = await res.json().catch(() => null);
      setTestNote(res.ok && json?.success ? { tone: 'ok', text: `PayMongo accepted the key (${json.data.mode} mode).` } : { tone: 'error', text: json?.error || 'The test failed.' });
    } catch {
      setTestNote({ tone: 'error', text: 'The server couldn’t be reached.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card id="cfg-paymongo" title="PayMongo: platform account" meta={view.updated.paymongo}>
      <p className="mb-3 text-sm text-gray-600">
        Clinics&rsquo; plan subscriptions and the med-rep activation fee are paid into this account. Clinics&rsquo; patient bills
        go to each clinic&rsquo;s own account, never this one.
      </p>
      <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-gray-500">Status</dt>
        <dd className="font-medium text-gray-900">
          {s.configured ? (
            <>
              Connected, {s.mode} mode, key ending <span className="font-mono">…{s.secretLast4}</span>
              {s.source === 'env' && <span className="font-normal text-gray-500"> (from the server&rsquo;s env)</span>}
            </>
          ) : (
            'Not connected: plans can’t be paid for online'
          )}
        </dd>
        <dt className="text-gray-500">Webhook</dt>
        <dd className="text-gray-900">
          {s.webhookConfigured ? 'Secret set' : 'No secret: payments are confirmed only when the payer returns'} ·{' '}
          <span className="break-all font-mono text-xs">{view.paymongoWebhookUrl}</span>
          <span className="block text-xs text-gray-500">Register this URL in PayMongo for checkout_session.payment.paid and payment.refunded.</span>
        </dd>
      </dl>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await submit({ secretKey, webhookSecret }, 'PayMongo keys saved.')) {
            setSecretKey('');
            setWebhookSecret('');
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pm-sk" label="Secret key" hint="sk_live_… or sk_test_…; blank keeps the current one" error={errors.secretKey}>
            <input id="pm-sk" type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={FIELD} />
          </Field>
          <Field id="pm-wh" label="Webhook secret" hint="whsk_…; blank keeps the current one" error={errors.webhookSecret}>
            <input id="pm-wh" type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className={FIELD} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || (!secretKey && !webhookSecret)} className={PRIMARY}>{busy ? 'Checking…' : 'Save keys'}</button>
          <button type="button" disabled={testing || !s.configured} onClick={test} className={OUTLINE}>{testing ? 'Testing…' : 'Test connection'}</button>
          {s.source === 'console' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Remove the keys saved here? The server’s env values (if any) will be used instead.')) void submit({ clear: true }, 'Keys removed.');
              }}
              className={OUTLINE}
            >
              Remove saved keys
            </button>
          )}
          <Notice notice={note ?? testNote} />
        </div>
      </form>
    </Card>
  );
}

function PricingCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [p, setP] = useState<PlanPricing>(view.pricing);
  const { busy, errors, note, submit } = useSection('pricing', onSaved);
  return (
    <Card id="cfg-pricing" title="Plan prices" meta={view.updated.pricing}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm('Change plan prices? New checkouts and the public pricing page use them; payments already started keep their amount.')) {
            void submit(p, 'Prices saved.');
          }
        }}
      >
        {PAID_PLANS.map((plan) => (
          <Field key={plan} id={`price-${plan}`} label={`${planLabel(plan)}, per month (₱)`} error={errors[`monthly.${plan}`]}>
            <input
              id={`price-${plan}`}
              type="number"
              min={20}
              step="any"
              value={p.monthly[plan]}
              onChange={(e) => setP((prev) => ({ ...prev, monthly: { ...prev.monthly, [plan]: Number(e.target.value) } }))}
              className={FIELD}
            />
          </Field>
        ))}
        <Field id="price-yearly" label="A yearly plan costs (months)" hint={`${12 - p.yearlyMonths} month${12 - p.yearlyMonths === 1 ? '' : 's'} free`} error={errors.yearlyMonths}>
          <input id="price-yearly" type="number" min={1} max={12} value={p.yearlyMonths} onChange={(e) => setP((prev) => ({ ...prev, yearlyMonths: Number(e.target.value) }))} className={FIELD} />
        </Field>
        <p className="text-xs text-gray-500">
          Basic yearly: {php(p.monthly.basic * p.yearlyMonths)} · Professional yearly: {php(p.monthly.professional * p.yearlyMonths)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save prices'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}

function FeesCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [f, setF] = useState<PlatformFees>(view.fees);
  const { busy, errors, note, submit } = useSection('fees', onSaved);
  const num = (k: keyof PlatformFees, label: string, hint?: string) => (
    <Field id={`fee-${k}`} label={label} hint={hint} error={errors[k]}>
      <input id={`fee-${k}`} type="number" min={0} step="any" value={f[k]} onChange={(e) => setF((prev) => ({ ...prev, [k]: Number(e.target.value) }))} className={FIELD} />
    </Field>
  );
  return (
    <Card id="cfg-fees" title="Fees" meta={view.updated.fees}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(f, 'Fees saved.');
        }}
      >
        {num('medrepActivationFee', 'Med-rep activation fee (₱)', '0 = reps are activated by hand; otherwise at least ₱20')}
        {num('voucherFaceValue', 'eMCR voucher: patient price (₱)', 'Default for new voucher batches')}
        {num('voucherWholesalePrice', 'eMCR voucher: clinic pays (₱)', `Clinic keeps ${php(Math.max(0, f.voucherFaceValue - f.voucherWholesalePrice))} per code`)}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save fees'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}
