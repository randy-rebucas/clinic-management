'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Icon, icons, SUPPORT_EMAIL } from '@/components/PublicPage';

/**
 * Landing after registration. PayMongo returns here with `paid=1` on success and without it on
 * cancel; registrations without online payment arrive without it too. Accounts start inactive
 * and are activated by the PayMongo confirmation or by our team — never by this page.
 */
function SuccessContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const paid = searchParams.get('paid') === '1';
  const reference = id ? `MR-${id.slice(-8).toUpperCase()}` : null;

  const steps = paid
    ? [
        { done: true, text: 'Registration received' },
        { done: true, text: 'Payment sent through PayMongo' },
        { done: false, text: 'Account activates once PayMongo confirms the payment' },
      ]
    : [
        { done: true, text: 'Registration received — check your email for a confirmation' },
        { done: false, text: 'Our team verifies your details and the activation fee' },
        { done: false, text: 'Your account is activated and clinics can see your profile' },
      ];

  const mailSubject = encodeURIComponent(`Medical rep registration${reference ? ` ${reference}` : ''}`);

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto max-w-xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-[0_20px_50px_rgb(15,23,42,0.08)]">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
            <Icon d={icons.check} className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {paid ? 'Payment received' : 'Registration received'}
          </h1>
          <p className="text-gray-600 mt-2 leading-relaxed">
            {paid
              ? 'Thank you! Your medical representative account will be active as soon as PayMongo confirms the payment — usually within a few minutes.'
              : 'Thanks for registering. Your account is pending activation; we’ll be in touch about the next step.'}
          </p>

          <ol className="mt-6 space-y-3 border-t border-gray-100 pt-6">
            {steps.map((s) => (
              <li key={s.text} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    s.done ? 'bg-brand-teal text-white' : 'border border-gray-300 bg-white'
                  }`}
                >
                  {s.done && <Icon d={icons.check} className="w-3 h-3" />}
                </span>
                <span className={s.done ? 'text-gray-900' : 'text-gray-500'}>{s.text}</span>
              </li>
            ))}
          </ol>

          {!paid && (
            <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Started paying online but didn&apos;t finish? Your registration is saved — email us with your reference
              and we&apos;ll help you complete activation.
            </p>
          )}

          {reference && (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-md bg-gray-50 px-4 py-3 text-sm">
              <span className="text-gray-500">Reference</span>
              <span className="font-mono font-semibold text-gray-900 tabular-nums">{reference}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center rounded-md bg-brand-teal px-5 py-2.5 font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-dark"
            >
              Back to home
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${mailSubject}`}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 px-5 py-2.5 font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900"
            >
              <Icon d={icons.mail} className="w-4 h-4 text-brand-teal-dark" />
              Email support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <SuccessContent />
    </Suspense>
  );
}
