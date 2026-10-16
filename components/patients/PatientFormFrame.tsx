'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FOCUS_RING, ICON, Svg } from '../appointments/shared';

/** Page frame for registering or editing a patient: back link, then the title on the ground. */
export function PatientFormShell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        {children}
      </div>
    </section>
  );
}

export function PatientFormSkeleton({ back, label }: { back: { href: string; label: string }; label: string }) {
  const panel = (fields: number, cols: string) => (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="h-4 w-36 rounded bg-gray-200" />
      </div>
      <div className={`grid gap-4 px-5 py-4 ${cols}`}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-[38px] rounded-md border border-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <PatientFormShell back={back}>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        <div className="space-y-2">
          <div className="h-8 w-52 rounded bg-gray-200" />
          <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
        </div>
        {panel(8, 'sm:grid-cols-2 lg:grid-cols-4')}
        {panel(5, 'sm:grid-cols-2')}
      </div>
      <span className="sr-only" role="status">
        {label}
      </span>
    </PatientFormShell>
  );
}
