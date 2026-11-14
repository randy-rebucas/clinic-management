'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  CircleCheck,
  Coins,
  Copy,
  CreditCard,
  HandCoins,
  ReceiptText,
  Tags,
  Webhook,
} from 'lucide-react';
import type { PlatformConfigView } from '@/lib/platform-config-page';
import type { BillingIssuer, PlatformFees } from '@/lib/platform-config-schema';
import { PAID_PLANS, planLabel, type PlanPricing } from '@/lib/subscription-period';
import { formatSerial, formatTin } from '@/lib/bir';
import { sponsorshipQuotes, termLabel, type SponsorshipPricing } from '@/lib/sponsorship-pricing';
import { CARD, FIELD, FOCUS_RING, H2, ago, php } from './shared';
import { LABEL, Notice, OUTLINE, PRIMARY } from './platform-api';

type Section = 'billing-issuer' | 'paymongo' | 'pricing' | 'fees' | 'sponsorship';
type Errors = Record<string, string>;
type Note = { tone: 'ok' | 'error'; text: string } | null;
type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

const SECTIONS: Array<{ key: Section; id: string; label: string; icon: Icon }> = [
  { key: 'billing-issuer', id: 'cfg-issuer', label: 'BIR issuer', icon: ReceiptText },
  { key: 'paymongo', id: 'cfg-paymongo', label: 'PayMongo', icon: CreditCard },
  { key: 'pricing', id: 'cfg-pricing', label: 'Plan prices', icon: Tags },
  { key: 'fees', id: 'cfg-fees', label: 'Fees', icon: Coins },
  { key: 'sponsorship', id: 'cfg-sponsorship', label: 'Sponsorship', icon: HandCoins },
];

/** Serial ranges with less than this share left are flagged. */
const SERIALS_LOW = 0.1;

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

/** Whether a section is saved in the console (true) or still on env values / built-in defaults. */
function savedHere(view: PlatformConfigView, section: Section): boolean {
  if (section === 'billing-issuer') return !!view.issuer;
  if (section === 'paymongo') return view.paymongo.source === 'console';
  return !!view.updated[section];
}

type HealthCheck = { label: string; value: string; tone: 'ok' | 'warn' | 'bad'; href: string };

function healthChecks(view: PlatformConfigView): HealthCheck[] {
  const s = view.paymongo;
  const range = view.issuer ? view.issuer.serialEnd - view.issuer.serialStart + 1 : 0;
  const left = view.serials?.remaining ?? 0;
  return [
    {
      label: 'Invoicing',
      value: view.issuer ? 'Issuer set' : 'Invoices on hold',
      tone: view.issuer ? 'ok' : 'bad',
      href: '#cfg-issuer',
    },
    {
      label: 'Serial numbers',
      value: !view.issuer ? '—' : `${left.toLocaleString('en-US')} left`,
      tone: !view.issuer ? 'warn' : left === 0 ? 'bad' : range > 0 && left / range < SERIALS_LOW ? 'warn' : 'ok',
      href: '#cfg-issuer',
    },
    {
      label: 'PayMongo',
      value: !s.configured ? 'Not connected' : `${s.mode === 'live' ? 'Live' : 'Test'} mode`,
      tone: !s.configured ? 'bad' : s.mode === 'live' ? 'ok' : 'warn',
      href: '#cfg-paymongo',
    },
    {
      label: 'Webhook',
      value: s.webhookConfigured ? 'Secret set' : 'No secret',
      tone: s.webhookConfigured ? 'ok' : 'warn',
      href: '#cfg-paymongo',
    },
    {
      label: 'Prices and fees',
      value: (['pricing', 'fees', 'sponsorship'] as const).every((k) => savedHere(view, k)) ? 'Set here' : 'Some on defaults',
      tone: (['pricing', 'fees', 'sponsorship'] as const).every((k) => savedHere(view, k)) ? 'ok' : 'warn',
      href: '#cfg-pricing',
    },
  ];
}

const TONE: Record<HealthCheck['tone'], { dot: string; icon: Icon; text: string }> = {
  ok: { dot: 'bg-emerald-500', icon: CircleCheck, text: 'text-emerald-700' },
  warn: { dot: 'bg-amber-400', icon: CircleAlert, text: 'text-amber-700' },
  bad: { dot: 'bg-rose-500', icon: CircleAlert, text: 'text-rose-700' },
};

/** Platform → Configuration: a health summary, then one card per section, each saved on its own. */
export default function PlatformConfigurationForms({ initial }: { initial: PlatformConfigView }) {
  const [view, setView] = useState(initial);
  const checks = healthChecks(view);

  return (
    <div className="space-y-5">
      <section aria-label="Setup health" className={`${CARD} grid grid-cols-2 divide-gray-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x`}>
        {checks.map((c) => {
          const t = TONE[c.tone];
          return (
            <a key={c.label} href={c.href} className={`group px-4 py-3 hover:bg-gray-50 ${FOCUS_RING}`}>
              <span className="block text-xs text-gray-500">{c.label}</span>
              <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${t.text}`}>
                <t.icon aria-hidden="true" className="size-4 shrink-0" />
                {c.value}
              </span>
            </a>
          );
        })}
      </section>

      {view.fallbacks.length > 0 && (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Not set here yet</p>
            <p className="mt-0.5">These still use the server&rsquo;s env values or built-in defaults: {view.fallbacks.join('; ')}.</p>
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6">
        <nav aria-label="Configuration sections" className="hidden lg:block">
          <ul className="sticky top-6 space-y-0.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <a href={`#${s.id}`} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-gray-700 hover:bg-white hover:text-gray-900 ${FOCUS_RING}`}>
                  <s.icon aria-hidden="true" className="size-4 text-gray-400" />
                  <span className="flex-1">{s.label}</span>
                  <span
                    className={`size-2 rounded-full ${savedHere(view, s.key) ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    title={savedHere(view, s.key) ? 'Set here' : 'On env values or defaults'}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{savedHere(view, s.key) ? '(set here)' : '(on defaults)'}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <IssuerCard view={view} onSaved={setView} />
          <PaymongoCard view={view} onSaved={setView} />
          <PricingCard view={view} onSaved={setView} />
          <FeesCard view={view} onSaved={setView} />
          <SponsorshipCard view={view} onSaved={setView} />
        </div>
      </div>
    </div>
  );
}

function Card({ section, title, view, dirty, children }: {
  section: Section;
  title: string;
  view: PlatformConfigView;
  dirty?: boolean;
  children: ReactNode;
}) {
  const s = SECTIONS.find((x) => x.key === section)!;
  const meta = view.updated[section];
  const here = savedHere(view, section);
  return (
    <section id={s.id} className={`${CARD} scroll-mt-6 p-5`} aria-labelledby={`${s.id}-title`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
            <s.icon aria-hidden="true" className="size-4" />
          </span>
          <h2 id={`${s.id}-title`} className={H2}>{title}</h2>
          {dirty && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Unsaved changes</span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${here ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {meta ? `Saved ${ago(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}${here ? '' : ' · partly on env or defaults'}` : here ? 'Set here' : 'Never saved here'}
        </p>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</legend>
      {children}
    </fieldset>
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
  const { busy, errors, note, submit } = useSection('billing-issuer', (d) => {
    onSaved(d);
    if (d.issuer) setV(d.issuer);
  });
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
  const range = view.issuer ? view.issuer.serialEnd - view.issuer.serialStart + 1 : 0;
  const used = view.serials && range > 0 ? range - view.serials.remaining : 0;
  const usedPct = range > 0 ? Math.min(100, (used / range) * 100) : 0;
  const low = view.serials && range > 0 && view.serials.remaining / range < SERIALS_LOW;

  return (
    <Card section="billing-issuer" title="BIR issuer: DevCom Digital" view={view} dirty={!same(v, view.issuer ?? EMPTY_ISSUER)}>
      <p className="mb-4 text-sm text-gray-600">
        Printed as the seller on every subscription sales invoice. Each invoice keeps a copy of these details as they were
        when it was issued.
      </p>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ ...v, tin: v.tin.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1-$2-$3') }, 'Issuer details saved.');
        }}
      >
        <Group title="Registration">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('sellerName', 'Registered name', { hint: 'As on the Certificate of Registration (Form 2303)' })}
            {text('tradeName', 'Business (trade) name', { hint: 'Optional' })}
            {text('tin', 'TIN', { placeholder: '123-456-789', max: 11 })}
            {text('branchCode', 'Branch code', { hint: '00000 is the head office', max: 5 })}
          </div>
          {text('address', 'Registered address', { max: 500 })}
          {v.tin.replace(/\D/g, '').length === 9 && (
            <p className="text-xs text-gray-500">Prints as TIN {formatTin(v.tin.replace(/\D/g, ''), v.branchCode)}</p>
          )}
        </Group>

        <Group title="Tax">
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
        </Group>

        <Group title="Invoice serials">
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
            <div className="rounded-md bg-gray-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-600">
                  {view.serials.last > 0 ? (
                    <>Last issued <span className="font-mono text-gray-900">{formatSerial(view.issuer.serialPrefix, view.serials.last)}</span></>
                  ) : (
                    'None issued yet'
                  )}
                </span>
                <span className={low ? 'font-semibold text-amber-700' : 'text-gray-600'}>
                  <span className="font-semibold tabular-nums text-gray-900">{view.serials.remaining.toLocaleString('en-US')}</span> of{' '}
                  {range.toLocaleString('en-US')} left{low ? ': ask BIR for a new range soon' : ''}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-200" role="img" aria-label={`${used} of ${range} serial numbers used`}>
                {used > 0 && <div className={`h-full rounded-full ${low ? 'bg-amber-500' : 'bg-brand-teal-dark'}`} style={{ width: `${Math.max(usedPct, 1)}%` }} />}
              </div>
            </div>
          )}
          <Field id="iss-footer" label="Invoice footer note" hint="Optional, e.g. “This document is not valid for claim of input tax.”" error={errors.footerNote}>
            <textarea id="iss-footer" rows={2} maxLength={500} value={v.footerNote} onChange={(e) => set('footerNote', e.target.value)} className={FIELD} />
          </Field>
        </Group>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save issuer details'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}

function StatusBadge({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const cls =
    tone === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : tone === 'warn' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-rose-50 text-rose-800 ring-rose-200';
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{children}</span>;
}

function PaymongoCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<Note>(null);
  const [copied, setCopied] = useState(false);
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

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(view.paymongoWebhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setTestNote({ tone: 'error', text: 'Couldn’t copy. Select the URL and copy it by hand.' });
    }
  }

  return (
    <Card section="paymongo" title="PayMongo: platform account" view={view} dirty={!!secretKey || !!webhookSecret}>
      <p className="mb-4 text-sm text-gray-600">
        Clinics&rsquo; plan subscriptions and the med-rep activation fee are paid into this account. Clinics&rsquo; patient bills
        go to each clinic&rsquo;s own account, never this one.
      </p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="flex items-center gap-2 text-xs text-gray-500"><CreditCard aria-hidden="true" className="size-3.5" /> Account</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {s.configured ? (
              <>
                <StatusBadge tone={s.mode === 'live' ? 'ok' : 'warn'}>{s.mode === 'live' ? 'Live' : 'Test mode'}</StatusBadge>
                <span className="text-sm text-gray-900">Key ending <span className="font-mono">…{s.secretLast4}</span></span>
              </>
            ) : (
              <StatusBadge tone="bad">Not connected</StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {!s.configured ? 'Plans can’t be paid for online.' : s.source === 'env' ? 'From the server’s env.' : 'Saved here.'}
            {s.configured && s.mode === 'test' ? ' Test keys take no real money.' : ''}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="flex items-center gap-2 text-xs text-gray-500"><Webhook aria-hidden="true" className="size-3.5" /> Webhook</p>
          <div className="mt-1.5">
            <StatusBadge tone={s.webhookConfigured ? 'ok' : 'warn'}>{s.webhookConfigured ? 'Secret set' : 'No secret'}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {s.webhookConfigured ? 'Payments confirm even if the payer never returns.' : 'Payments are confirmed only when the payer returns.'}
          </p>
        </div>
      </div>

      <div className="mb-5">
        <p className={LABEL}>Webhook URL</p>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800">{view.paymongoWebhookUrl}</code>
          <button type="button" onClick={copyUrl} className={`${OUTLINE} inline-flex shrink-0 items-center gap-1.5`}>
            {copied ? <Check aria-hidden="true" className="size-4 text-emerald-600" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Register it in PayMongo for checkout_session.payment.paid and payment.refunded.</p>
      </div>

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
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
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
  const { busy, errors, note, submit } = useSection('pricing', (d) => {
    onSaved(d);
    setP(d.pricing);
  });
  const free = 12 - p.yearlyMonths;
  return (
    <Card section="pricing" title="Plan prices" view={view} dirty={!same(p, view.pricing)}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm('Change plan prices? New checkouts and the public pricing page use them; payments already started keep their amount.')) {
            void submit(p, 'Prices saved.');
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PAID_PLANS.map((plan) => (
            <Field key={plan} id={`price-${plan}`} label={`${planLabel(plan)} / month (₱)`} error={errors[`monthly.${plan}`]}>
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
          <Field id="price-yearly" label="Yearly costs (months)" hint={`${free} month${free === 1 ? '' : 's'} free`} error={errors.yearlyMonths}>
            <input id="price-yearly" type="number" min={1} max={12} value={p.yearlyMonths} onChange={(e) => setP((prev) => ({ ...prev, yearlyMonths: Number(e.target.value) }))} className={FIELD} />
          </Field>
        </div>

        <div className="relative overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">What each plan costs with these prices</caption>
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Plan</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Monthly</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Yearly</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Yearly saves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {PAID_PLANS.map((plan) => (
                <tr key={plan}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900">{planLabel(plan)}</th>
                  <td className="px-3 py-2 text-right text-gray-700">{php(p.monthly[plan])}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{php(p.monthly[plan] * p.yearlyMonths)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{free > 0 ? php(p.monthly[plan] * free) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save prices'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}

function FeesCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [f, setF] = useState<PlatformFees>(view.fees);
  const { busy, errors, note, submit } = useSection('fees', (d) => {
    onSaved(d);
    setF(d.fees);
  });
  const num = (k: keyof PlatformFees, label: string, hint?: string) => (
    <Field id={`fee-${k}`} label={label} hint={hint} error={errors[k]}>
      <input id={`fee-${k}`} type="number" min={0} step="any" value={f[k]} onChange={(e) => setF((prev) => ({ ...prev, [k]: Number(e.target.value) }))} className={FIELD} />
    </Field>
  );
  return (
    <Card section="fees" title="Fees" view={view} dirty={!same(f, view.fees)}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(f, 'Fees saved.');
        }}
      >
        <Group title="Medical reps">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('medrepActivationFee', 'Activation fee (₱)', '0 = reps are activated by hand; otherwise at least ₱20')}
            {num('medrepMonthlyFee', 'Subscription, per month (₱)', '0 = booking clinic visits is free. Yearly uses the plan list’s months per year')}
            {num('medrepSeatMonthlyFee', 'Team plan, per seat per month (₱)', '0 = company team plans aren’t sold online')}
            {num('medrepProMonthlyFee', 'Pro, per month (₱)', '0 = Pro isn’t sold. Booking plus the AI assistant; must cost more than the subscription')}
          </div>
        </Group>
        <Group title="Rep AI assistant">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('repAiFreeActions', 'Actions a month without Pro', 'A taste of the AI assistant; 0 = none')}
            {num('repAiProActions', 'Actions a month on Pro', 'Fair-use cap per rep')}
          </div>
        </Group>
        <Group title="eMCR vouchers">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('voucherFaceValue', 'Patient price (₱)', 'Default for new voucher batches')}
            {num('voucherWholesalePrice', 'Clinic pays (₱)', `Clinic keeps ${php(Math.max(0, f.voucherFaceValue - f.voucherWholesalePrice))} per code`)}
          </div>
        </Group>
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save fees'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}

function SponsorshipCard({ view, onSaved }: { view: PlatformConfigView; onSaved: (v: PlatformConfigView) => void }) {
  const [s, setS] = useState<SponsorshipPricing>(view.sponsorship);
  const { busy, errors, note, submit } = useSection('sponsorship', (d) => {
    onSaved(d);
    setS(d.sponsorship);
  });
  const setOff = (k: '3' | '6' | '12', v: number) => setS((prev) => ({ ...prev, discounts: { ...prev.discounts, [k]: v } }));
  return (
    <Card section="sponsorship" title="Clinic sponsorship (paid by a medical rep)" view={view} dirty={!same(s, view.sponsorship)}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm('Change sponsorship prices? New sponsorship checkouts use them; payments already started keep their amount.')) {
            void submit(s, 'Sponsorship prices saved.');
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field id="sp-monthly" label="Per month (₱)" hint="Gets the Professional plan" error={errors.monthly}>
            <input id="sp-monthly" type="number" min={20} step="any" value={s.monthly} onChange={(e) => setS((prev) => ({ ...prev, monthly: Number(e.target.value) }))} className={FIELD} />
          </Field>
          {(['3', '6', '12'] as const).map((k) => (
            <Field key={k} id={`sp-off-${k}`} label={`${termLabel(Number(k))}: discount (%)`} error={errors[`discounts.${k}`]}>
              <input id={`sp-off-${k}`} type="number" min={0} max={50} step="any" value={s.discounts[k]} onChange={(e) => setOff(k, Number(e.target.value))} className={FIELD} />
            </Field>
          ))}
        </div>

        <div className="relative overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">What a rep pays for each sponsorship term with these prices</caption>
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Term</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Rep pays</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Per month</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Saves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {sponsorshipQuotes(s).map((q) => (
                <tr key={q.months}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-900">{termLabel(q.months)}</th>
                  <td className="px-3 py-2 text-right text-gray-900">{php(q.amount)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{php(q.perMonth)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {q.fullPrice > q.amount ? `${php(q.fullPrice - q.amount)} (${q.percentOff}%)` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : 'Save sponsorship prices'}</button>
          <Notice notice={note} />
        </div>
      </form>
    </Card>
  );
}
