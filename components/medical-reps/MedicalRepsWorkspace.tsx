'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FOCUS_RING } from '../appointments/shared';
import MedicalRepsManagementClient from '../MedicalRepsManagementClient';
import RepAccessRequestsPanel from './RepAccessRequestsPanel';
import RepDeliveriesPanel from './RepDeliveriesPanel';
import RepVisitsPanel from './RepVisitsPanel';
import RepVisitHoursPanel from './RepVisitHoursPanel';

export type RepsTab = 'visits' | 'deliveries' | 'reps' | 'hours';
const TABS: { key: RepsTab; label: string }[] = [
  { key: 'visits', label: 'Visit requests' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'reps', label: 'Representatives' },
  { key: 'hours', label: 'Visiting hours' },
];

/** /medical-reps: rep visit requests, what reps delivered, the clinic's reps, and the hours reps can book. */
export default function MedicalRepsWorkspace({
  initialTab,
  focusVisitId,
  focusDeliveryId,
  focusRequestId,
}: {
  initialTab: RepsTab;
  focusVisitId?: string;
  focusDeliveryId?: string;
  focusRequestId?: string;
}) {
  const [tab, setTab] = useState<RepsTab>(initialTab);
  // Remounts the list after an access request is approved, so the new rep shows.
  const [repsKey, setRepsKey] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const select = (t: RepsTab) => {
    setTab(t);
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };

  return (
    <section className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Medical representatives</h1>
          <p className="mt-1 text-sm text-gray-600 sm:text-base">
            Reps book visits in your visiting hours from the MyClinicSoft app. You approve each one, check them in when they arrive, and confirm what they deliver.
          </p>
        </header>

        <nav role="tablist" aria-label="Medical representatives" className="flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => select(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                tab === t.key ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div role="tabpanel">
          {tab === 'visits' && <RepVisitsPanel focusVisitId={focusVisitId} />}
          {tab === 'deliveries' && <RepDeliveriesPanel focusDeliveryId={focusDeliveryId} />}
          {tab === 'reps' && (
            <>
              <RepAccessRequestsPanel focusRequestId={focusRequestId} onApproved={() => setRepsKey((k) => k + 1)} />
              <MedicalRepsManagementClient key={repsKey} embedded />
            </>
          )}
          {tab === 'hours' && <RepVisitHoursPanel />}
        </div>
      </div>
    </section>
  );
}
