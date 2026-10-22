'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PlanOffer, SubscriptionPageData, UnfinishedPayment } from '@/lib/subscription-page';
import { RESETS, type UsageKey, type UsageRow } from '@/lib/plan-usage';
import { BLOCKED_WHEN_UNPAID, PAID_PLANS, type BillingCycle } from '@/lib/subscription-period';
import { FigureRow, Icon, Panel, formatCount, type Figure } from '@/components/dashboards/shared';
import { Modal } from '@/components/ui/Modal';
import UsageMeter, { usageAmount } from './UsageMeter';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;
const SECONDARY = `inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-gray-300 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

function money(amount: number, currency: string, cents = false) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

const CYCLE_WORD: Record<BillingCycle, string> = { monthly: 'month', yearly: 'year' };
const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: 'Monthly', yearly: 'Yearly' };

/** Rows of the plan comparison, in the order the meters show them. */
const LIMIT_ROWS: { key: UsageKey; label: string }[] = [
  { key: 'users', label: 'Staff accounts' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'patients', label: 'Patients' },
  { key: 'appointments', label: 'Appointments a month' },
  { key: 'appointmentsToday', label: 'Appointments a day' },
  { key: 'visits', label: 'Visits a month' },
  { key: 'storage', label: 'File storage' },
];

/** Where the clinic's own figures don't fit a plan's limit (at or over it). */
function shortfalls(offer: PlanOffer, usage: UsageRow[] | null) {
  if (!usage) return [];
  return usage.filter((row) => {
    const limit = offer.limits[row.key];
    return limit !== null && row.current >= limit;
  });
}

function shortfallText(row: UsageRow) {
  const when = RESETS[row.key];
  return `${usageAmount(row, row.current)}${when ? ` ${when}` : ''}`;
}

// ---------------------------------------------------------------------------
// Where the plan stands
// ---------------------------------------------------------------------------

type Tone = 'info' | 'amber' | 'red';

const BANNER: Record<Tone, { box: string; icon: string; title: string }> = {
  info: { box: 'border-brand-teal/30 bg-brand-teal-light/60', icon: 'text-brand-teal-dark', title: 'text-brand-teal-deep' },
  amber: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-700', title: 'text-amber-900' },
  red: { box: 'border-red-200 bg-red-50', icon: 'text-red-600', title: 'text-red-800' },
};

function Banner({ tone, title, children }: { tone: Tone; title: string; children?: React.ReactNode }) {
  const t = BANNER[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`motion-panel-in flex items-start gap-3 rounded-lg border px-5 py-4 ${t.box}`}>
      <Icon name={tone === 'info' ? 'clock' : 'alert'} className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${t.title}`}>{title}</p>
        {children && <div className="mt-0.5 text-sm text-gray-700">{children}</div>}
      </div>
    </div>
  );
}

function StateBanner({ plan }: { plan: SubscriptionPageData['plan'] }) {
  const unpaid = `Staff can still open records, but can’t add ${BLOCKED_WHEN_UNPAID} until a plan is paid for.`;
  switch (plan.state) {
    case 'none':
      return <Banner tone="red" title="The clinic has no plan">{unpaid}</Banner>;
    case 'cancelled':
      return (
        <Banner tone="red" title={`The ${plan.label} plan was cancelled`}>
          Its payment was refunded or declined. {unpaid}
        </Banner>
      );
    case 'ended':
      return (
        <Banner tone="red" title={plan.endsOn ? `The ${plan.label} plan ended ${plan.endsOn}` : `The ${plan.label} plan has ended`}>
          {unpaid}
        </Banner>
      );
    case 'trial':
      return (
        <Banner
          tone={plan.daysLeft !== null && plan.daysLeft <= 3 ? 'amber' : 'info'}
          title={plan.daysLeft !== null ? `Trial: ${plural(plan.daysLeft, 'day')} left${plan.endsOn ? `, ends ${plan.endsOn}` : ''}` : 'Trial'}
        >
          Choose a plan before then. The trial days you have left are kept: the paid period starts when the trial ends.
        </Banner>
      );
    case 'active':
      if (plan.daysLeft !== null && plan.daysLeft <= 14) {
        return (
          <Banner tone="amber" title={`The ${plan.label} plan ends in ${plural(plan.daysLeft, 'day')}${plan.endsOn ? ` (${plan.endsOn})` : ''}`}>
            Payments don’t renew on their own. Pay for another {plan.cycle ? CYCLE_WORD[plan.cycle] : 'period'} below to keep going without a gap.
          </Banner>
        );
      }
      return null;
  }
}

function PeriodBar({ plan }: { plan: SubscriptionPageData['plan'] }) {
  if (plan.elapsed === null || !plan.startedOn || !plan.endsOn) return null;
  const pct = Math.round(plan.elapsed * 100);
  const start = plan.state === 'trial' ? `Trial began ${plan.startedOn}` : `Paid ${plan.startedOn}`;
  return (
    <div className="border-t border-gray-100 px-5 pt-4 pb-5">
      <div
        role="meter"
        aria-label="This period"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% of the period used${plan.daysLeft !== null ? `, ${plural(plan.daysLeft, 'day')} left` : ''}`}
        className="relative h-2 rounded-full bg-gray-100"
      >
        <div
          className="motion-bar-grow h-full rounded-full"
          style={{ width: `${Math.max(1, pct)}%`, background: plan.daysLeft !== null && plan.daysLeft <= 14 ? '#D97706' : '#0E9594' }}
        />
        <span
          aria-hidden="true"
          className="motion-line-in absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-gray-900"
          style={{ left: `${Math.max(1, pct)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-gray-500">
        <span>{start}</span>
        <span className="font-semibold text-gray-700">Today</span>
        <span>Ends {plan.endsOn}</span>
      </div>
    </div>
  );
}

function PeriodPanel({ data }: { data: SubscriptionPageData }) {
  const { plan, payments } = data;
  const last = payments.find((p) => p.status === 'completed');
  const ended = plan.state === 'ended' || plan.state === 'cancelled' || plan.state === 'none';
  const figures: Figure[] = [
    {
      label: 'Plan',
      value: plan.label,
      detail: plan.state === 'trial' ? 'Free trial' : plan.cycle ? `Paid ${plan.cycle}` : undefined,
    },
    {
      label: plan.state === 'trial' ? 'Trial ends' : ended ? 'Ended' : 'Paid until',
      value: plan.endsOn ?? '—',
      status: ended ? 'danger' : undefined,
    },
    {
      label: 'Days left',
      value: plan.daysLeft !== null && !ended ? formatCount(plan.daysLeft) : '—',
      status: ended ? 'danger' : plan.daysLeft !== null && plan.daysLeft <= 14 ? 'warning' : undefined,
    },
    {
      label: 'Last payment',
      value: last ? money(last.amount, last.currency) : '—',
      detail: last ? last.paidOn : 'None yet',
    },
  ];
  return (
    <Panel title="This period" subtitle="Payments are one-off and don’t renew on their own.">
      <FigureRow figures={figures} />
      <PeriodBar plan={plan} />
    </Panel>
  );
}

function UsagePanel({ data }: { data: SubscriptionPageData }) {
  return (
    <Panel title="What the clinic uses" subtitle={`Against the ${data.plan.label} plan’s limits`}>
      {data.usage ? (
        <ul className="divide-y divide-gray-100 py-2">
          {data.usage.map((row, i) => (
            <UsageMeter key={row.key} row={row} index={i} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-gray-500">Usage couldn’t be counted just now. Reload the page to try again.</p>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Payments started but not finished
// ---------------------------------------------------------------------------

function Unfinished({ items }: { items: UnfinishedPayment[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="unfinished-title" className="motion-panel-in overflow-hidden rounded-lg border border-amber-200 bg-white">
      <div className="border-b border-amber-200 bg-amber-50 px-5 py-3.5">
        <h2 id="unfinished-title" className="text-base font-bold tracking-tight text-amber-900">
          {items.length === 1 ? 'A payment wasn’t finished' : `${items.length} payments weren’t finished`}
        </h2>
        <p className="mt-0.5 text-sm text-amber-900/80">Finish one before paying again, or the clinic may pay twice.</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((o) => (
          <li key={o.orderId} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {o.plan}, {o.cycle} · <span className="font-mono tabular-nums">{money(o.amount, o.currency, true)}</span>
                <span className="font-normal text-gray-500"> · started {o.startedAt}</span>
              </p>
              <p className="mt-0.5 text-sm text-gray-600">
                {o.status === 'processing'
                  ? 'The payment may already have been taken; it hasn’t been applied to the plan yet.'
                  : 'If you paid, finish it here. If you didn’t, it lapses on its own and nothing is charged.'}
              </p>
            </div>
            <Link
              href={`/admin/subscription/success?token=${encodeURIComponent(o.orderId)}`}
              className={`${SECONDARY} shrink-0 self-start sm:self-auto`}
            >
              {o.status === 'processing' ? 'Apply it now' : 'Finish payment'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

interface Choice {
  offer: PlanOffer;
  cycle: BillingCycle;
}

function actionFor(offer: PlanOffer, data: SubscriptionPageData, cycle: BillingCycle) {
  const { plan } = data;
  const isCurrent = plan.key === offer.plan;
  const inDate = plan.state === 'active';
  if (isCurrent && inDate) return { label: `Pay for another ${CYCLE_WORD[cycle]}`, primary: false };
  if (isCurrent) return { label: `Pay for ${offer.label}`, primary: true };
  const from = PAID_PLANS.indexOf(plan.key as (typeof PAID_PLANS)[number]);
  if (inDate && from >= 0) {
    return PAID_PLANS.indexOf(offer.plan) > from
      ? { label: `Move up to ${offer.label}`, primary: false }
      : { label: `Change to ${offer.label}`, primary: false };
  }
  return { label: `Choose ${offer.label}`, primary: false };
}

function PlanColumn({
  offer,
  data,
  cycle,
  onChoose,
  index,
}: {
  offer: PlanOffer;
  data: SubscriptionPageData;
  cycle: BillingCycle;
  onChoose: (c: Choice) => void;
  index: number;
}) {
  const isCurrent = data.plan.key === offer.plan;
  const price = offer[cycle];
  const action = actionFor(offer, data, cycle);
  const usageByKey = new Map((data.usage ?? []).map((r) => [r.key, r]));
  const titleId = `plan-${offer.plan}`;

  return (
    <section
      aria-labelledby={titleId}
      className={`motion-row-in flex flex-col rounded-lg bg-white ${isCurrent ? 'border-2 border-brand-teal-dark' : 'border border-gray-200'}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-lg font-bold tracking-tight text-gray-900">
            {offer.label}
          </h3>
          {isCurrent && (
            <span className="rounded-full bg-brand-teal-light px-2.5 py-0.5 text-xs font-semibold text-brand-teal-deep">
              {data.plan.state === 'active' ? 'Your plan' : 'Your last plan'}
            </span>
          )}
        </div>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-semibold tabular-nums text-gray-900">{money(price.amount, price.currency)}</span>
          <span className="text-sm text-gray-500">a {CYCLE_WORD[cycle]}</span>
        </p>
        <p className="mt-1 h-5 text-sm text-gray-600">
          {cycle === 'yearly' && offer.yearly.monthsSaved > 0
            ? `${plural(offer.yearly.monthsSaved, 'month')} free against paying monthly`
            : cycle === 'monthly'
            ? `or ${money(offer.yearly.amount, offer.yearly.currency)} a year`
            : null}
        </p>
      </div>

      <dl className="flex-1 border-t border-gray-100 px-5 py-2">
        {LIMIT_ROWS.map(({ key, label }) => {
          const limit = offer.limits[key];
          const row = usageByKey.get(key);
          const short = row && limit !== null && row.current >= limit;
          return (
            <div key={key} className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 text-sm last:border-b-0">
              <dt className="text-gray-600">{label}</dt>
              <dd className="text-right">
                <span className={`font-mono tabular-nums ${short ? 'font-semibold text-red-700' : 'text-gray-900'}`}>
                  {limit === null ? 'No limit' : key === 'storage' ? `${formatCount(limit)} GB` : formatCount(limit)}
                </span>
                {short && row && <span className="block text-xs text-red-700">You have {shortfallText(row)}</span>}
              </dd>
            </div>
          );
        })}
        <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <dt className="text-gray-600">Support</dt>
          <dd className="text-gray-900">{offer.support}</dd>
        </div>
      </dl>

      <div className="border-t border-gray-100 px-5 py-4">
        <p className="mb-3 text-xs text-gray-500">
          Paid today: until <span className="font-medium text-gray-700">{price.paidUntil}</span>
        </p>
        <button
          type="button"
          disabled={!data.gatewayReady}
          onClick={() => onChoose({ offer, cycle })}
          className={`${action.primary ? PRIMARY : SECONDARY} w-full`}
        >
          {action.label}
        </button>
      </div>
    </section>
  );
}

function CycleSwitch({ value, onChange, saved }: { value: BillingCycle; onChange: (c: BillingCycle) => void; saved: number }) {
  return (
    <div role="group" aria-label="Billing" className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
      {(['monthly', 'yearly'] as const).map((c) => {
        const on = c === value;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c)}
            className={`rounded px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${FOCUS_RING} ${
              on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {CYCLE_LABEL[c]}
            {c === 'yearly' && saved > 0 && <span className={on ? 'text-white/85' : 'text-gray-500'}>{`, ${plural(saved, 'month')} free`}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm, then go to the payment page
// ---------------------------------------------------------------------------

function ConfirmDialog({ choice, data, onClose }: { choice: Choice | null; data: SubscriptionPageData; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!choice) return null;
  const { offer, cycle } = choice;
  const price = offer[cycle];
  const { plan } = data;
  const inDate = plan.state === 'active' || plan.state === 'trial';
  const switching = plan.state === 'active' && plan.key !== offer.plan;
  const short = shortfalls(offer, data.usage);

  const notes: string[] = [];
  if (switching && plan.daysLeft) {
    notes.push(
      `${offer.label} applies as soon as ${data.gatewayName} confirms the payment, including the ${plural(plan.daysLeft, 'day')} left on ${plan.label}. The new ${CYCLE_WORD[cycle]} is added after ${plan.endsOn}.`
    );
  } else if (inDate && plan.endsOn) {
    notes.push(`Days already ${plan.state === 'trial' ? 'left on the trial' : 'paid for'} are kept: the new ${CYCLE_WORD[cycle]} starts after ${plan.endsOn}.`);
  } else {
    notes.push(`${offer.label} starts as soon as ${data.gatewayName} confirms the payment.`);
  }
  for (const row of short) {
    const limit = offer.limits[row.key] as number;
    notes.push(
      `${row.label}: the clinic has ${shortfallText(row)}, and ${offer.label} allows ${usageAmount(row, limit)}. Nothing is removed, but ${row.blocks}.`
    );
  }

  const close = () => {
    if (sending) return;
    setError(null);
    onClose();
  };

  async function pay() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/subscription/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: offer.plan, billingCycle: cycle }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.approvalUrl) throw new Error(body.error || `${data.gatewayName} couldn’t start the payment. Nothing was charged.`);
      window.location.assign(body.approvalUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${data.gatewayName} couldn’t start the payment. Nothing was charged.`);
      setSending(false);
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && close()} labelledBy="pay-title" closeOnBackdrop={!sending} closeOnEscape={!sending}>
      <div className="p-6">
        <h2 id="pay-title" className="text-lg font-bold tracking-tight text-gray-900">
          Pay for {offer.label}, {cycle}
        </h2>
        <dl className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
          <div className="flex justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-gray-600">Amount</dt>
            <dd className="font-mono font-semibold tabular-nums text-gray-900">
              {money(price.amount, price.currency, true)} {price.currency}
            </dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-gray-600">Paid until</dt>
            <dd className="font-medium text-gray-900">{price.paidUntil}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          {notes.map((n, i) => (
            <li key={i} className={`flex gap-2 ${i > 0 ? 'text-red-800' : ''}`}>
              <span aria-hidden="true" className={`mt-2 h-1 w-1 shrink-0 rounded-full ${i > 0 ? 'bg-red-600' : 'bg-gray-400'}`} />
              {n}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-gray-600">You’ll pay on {data.gatewayName}’s page{data.gatewayName === 'PayMongo' ? ' (GCash, Maya, card or QR Ph)' : ''}, then come back here while the payment is confirmed.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={close} disabled={sending} className={GHOST}>
            Not now
          </button>
          <button type="button" onClick={pay} disabled={sending} className={PRIMARY} aria-busy={sending}>
            {sending ? `Opening ${data.gatewayName}…` : `Continue to ${data.gatewayName}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payments made
// ---------------------------------------------------------------------------

const PAYMENT_STATE: Record<SubscriptionPageData['payments'][number]['status'], { label: string; cls: string }> = {
  completed: { label: 'Paid', cls: 'bg-brand-teal-light text-brand-teal-deep' },
  refunded: { label: 'Refunded', cls: 'border border-gray-300 text-gray-600' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
};

function Payments({ payments }: { payments: SubscriptionPageData['payments'] }) {
  return (
    <Panel title="Payments" subtitle={payments.length ? `${plural(payments.length, 'payment')}, newest first` : undefined}>
      {payments.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">
          No payments yet. Each payment is listed here with its payment reference.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {payments.map((p, i) => {
            const s = PAYMENT_STATE[p.status];
            return (
              <li
                key={p.id}
                className="motion-row-in grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 text-sm sm:grid-cols-[8rem_1fr_7rem_6rem_minmax(0,12rem)]"
                style={{ animationDelay: `${Math.min(240, i * 40)}ms` }}
              >
                <span className="text-gray-600">{p.paidOn}</span>
                <span className="font-medium text-gray-900 max-sm:col-start-1 max-sm:row-start-2">
                  {p.plan} · {CYCLE_LABEL[p.cycle]}
                </span>
                <span className={`text-right font-mono tabular-nums text-gray-900 max-sm:col-start-2 max-sm:row-start-1 ${p.status === 'refunded' ? 'line-through text-gray-500' : ''}`}>
                  {money(p.amount, p.currency, true)}
                </span>
                <span className="max-sm:col-start-2 max-sm:row-start-2 max-sm:justify-self-end">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                </span>
                <span className="truncate font-mono text-xs text-gray-500 max-sm:col-span-2" title={p.reference}>
                  {p.reference}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export default function SubscriptionClient({ data, canceled }: { data: SubscriptionPageData; canceled: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>(data.plan.cycle ?? 'monthly');
  const [choice, setChoice] = useState<Choice | null>(null);
  const saved = Math.max(0, ...data.offers.map((o) => o.yearly.monthsSaved));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Subscription</h1>
        <p className="mt-1 text-sm text-gray-600 sm:text-base">
          {data.clinicName} · {data.plan.label} plan
        </p>
      </div>

      {canceled && (
        <Banner tone="info" title="You left the payment page before paying">
          Nothing was charged. Choose a plan again whenever you’re ready.
        </Banner>
      )}
      <Unfinished items={data.unfinished} />
      <StateBanner plan={data.plan} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PeriodPanel data={data} />
        </div>
        <div className="lg:col-span-2">
          <UsagePanel data={data} />
        </div>
      </div>

      <section aria-labelledby="plans-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="plans-title" className="text-xl font-bold tracking-tight text-gray-900">
              Plans
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Plans differ in how much the clinic can hold. Red figures are ones the clinic already reaches.
            </p>
          </div>
          <CycleSwitch value={cycle} onChange={setCycle} saved={saved} />
        </div>
        {!data.gatewayReady && (
          <Banner tone="amber" title="Online payment isn’t set up yet">
            Plans can’t be paid for here until the platform’s PayMongo account is connected. Contact support to
            subscribe in the meantime.
          </Banner>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.offers.map((offer, i) => (
            <PlanColumn key={offer.plan} offer={offer} data={data} cycle={cycle} onChoose={setChoice} index={i} />
          ))}
        </div>
      </section>

      <Payments payments={data.payments} />

      <ConfirmDialog key={choice ? `${choice.offer.plan}-${choice.cycle}` : 'none'} choice={choice} data={data} onClose={() => setChoice(null)} />
    </div>
  );
}
