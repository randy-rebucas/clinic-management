'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/dashboards/shared';
import { planLabel } from '@/lib/subscription-period';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const SECONDARY = `inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900 ${FOCUS_RING}`;

/** Mirrors the confirm route's `code`: retry = unknown or still applying; declined = nothing taken; problem = needs a person. */
type Phase =
  | { kind: 'confirming' }
  | { kind: 'paid'; plan: string; paidUntil: string | null }
  | { kind: 'retry'; message: string }
  | { kind: 'declined' }
  | { kind: 'problem'; message: string };

const formatDay = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const gateway = 'PayMongo';

/**
 * Where PayMongo sends the payer after paying (/admin/subscription/success?token=<order id>).
 * Confirms the order once (the confirm route is idempotent and tenant-checked, so "Try again"
 * and finishing an earlier payment from the subscription page are safe), and says plainly
 * whether money was taken.
 */
export default function SubscriptionReturnClient({ orderId }: { orderId: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'confirming' });
  const started = useRef<string | null>(null);

  const capture = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/subscription/paymongo-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        const sub = body.subscription ?? {};
        setPhase({ kind: 'paid', plan: planLabel(sub.plan), paidUntil: sub.expiresAt ? formatDay(sub.expiresAt) : null });
      } else if (body.code === 'declined') {
        setPhase({ kind: 'declined' });
      } else if (body.code === 'problem') {
        setPhase({ kind: 'problem', message: body.error || 'This payment couldn’t be applied.' });
      } else {
        setPhase({ kind: 'retry', message: body.error || `${gateway} didn’t answer in time.` });
      }
    } catch {
      setPhase({ kind: 'retry', message: `The connection dropped before ${gateway} answered.` });
    }
  }, []);

  useEffect(() => {
    // Once per order id, also under StrictMode's double effect run.
    if (!orderId || started.current === orderId) return;
    started.current = orderId;
    void capture(orderId);
  }, [orderId, capture]);

  const tryAgain = () => {
    if (!orderId) return;
    setPhase({ kind: 'confirming' });
    void capture(orderId);
  };

  if (!orderId) {
    return (
      <Shell icon="document" tone="gray" title="There’s no payment to confirm">
        <p>This page is where {gateway} sends you back after paying. Open it from {gateway}, or choose a plan on the subscription page.</p>
        <Actions>
          <Link href="/admin/subscription" className={PRIMARY}>
            Back to subscription
          </Link>
        </Actions>
      </Shell>
    );
  }

  switch (phase.kind) {
    case 'confirming':
      return (
        <Shell icon="refresh" tone="teal" title={`Confirming your payment with ${gateway}`} busy>
          <p>This usually takes a few seconds. Please keep this page open.</p>
        </Shell>
      );
    case 'paid':
      return (
        <Shell icon="shield" tone="teal" title={`${phase.plan} plan paid`}>
          <p>
            {phase.paidUntil ? (
              <>
                The clinic is paid up until <span className="font-semibold text-gray-900">{phase.paidUntil}</span>.
              </>
            ) : (
              'The payment has been applied to the clinic’s plan.'
            )}{' '}
            The payment is listed on the subscription page with its {gateway} reference.
          </p>
          <Actions>
            <Link href="/admin/subscription" className={PRIMARY}>
              Back to subscription
            </Link>
            <Link href="/dashboard" className={SECONDARY}>
              Go to the dashboard
            </Link>
          </Actions>
        </Shell>
      );
    case 'retry':
      return (
        <Shell icon="refresh" tone="amber" title="The payment isn’t confirmed yet">
          <p>{phase.message}</p>
          <p className="mt-2 font-medium text-gray-900">
            Don’t pay again: {gateway} may already have taken this payment. Trying again finishes this same payment and can’t charge twice.
          </p>
          <Actions>
            <button type="button" onClick={tryAgain} className={PRIMARY}>
              Try again
            </button>
            <Link href="/admin/subscription" className={SECONDARY}>
              Back to subscription
            </Link>
          </Actions>
          <Reference orderId={orderId} gateway={gateway} />
        </Shell>
      );
    case 'declined':
      return (
        <Shell icon="alert" tone="red" title={`${gateway} didn’t take this payment`}>
          <p>Nothing was charged for it, and the plan hasn’t changed. You can choose a plan and pay again.</p>
          <Actions>
            <Link href="/admin/subscription" className={PRIMARY}>
              Back to plans
            </Link>
          </Actions>
          <Reference orderId={orderId} gateway={gateway} />
        </Shell>
      );
    case 'problem':
      return (
        <Shell icon="alert" tone="red" title="This payment needs a person to look at it">
          <p>{phase.message}</p>
          <p className="mt-2">Don’t pay again. Contact support with the {gateway} reference below.</p>
          <Actions>
            <Link href="/admin/subscription" className={SECONDARY}>
              Back to subscription
            </Link>
          </Actions>
          <Reference orderId={orderId} gateway={gateway} />
        </Shell>
      );
  }
}

const TONE = {
  teal: 'bg-brand-teal-light text-brand-teal-dark',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  gray: 'bg-gray-100 text-gray-600',
} as const;

function Shell({
  icon,
  tone,
  title,
  busy,
  children,
}: {
  icon: 'clock' | 'shield' | 'refresh' | 'alert' | 'document';
  tone: keyof typeof TONE;
  title: string;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-4 sm:pt-10">
      <section
        role={tone === 'red' ? 'alert' : 'status'}
        aria-busy={busy || undefined}
        className="motion-panel-in rounded-lg border border-gray-200 bg-white px-6 py-7"
      >
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${TONE[tone]}`}>
          <Icon name={icon} className={`h-5 w-5 ${busy ? 'motion-safe:animate-spin [animation-duration:2s]' : ''}`} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-gray-600">{children}</div>
      </section>
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap gap-3">{children}</div>;
}

function Reference({ orderId, gateway }: { orderId: string; gateway: string }) {
  return (
    <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">
      {gateway} reference <span className="font-mono text-gray-700">{orderId}</span>
    </p>
  );
}
