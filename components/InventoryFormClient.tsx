'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InventoryForm from './InventoryForm';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';

export default function InventoryFormClient() {
  const router = useRouter();
  return (
    <InventoryFormShell back={{ href: '/inventory', label: 'All inventory' }}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Add item</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">A medicine or supply the clinic keeps in stock.</p>
      </header>
      <InventoryForm onCancel={() => router.push('/inventory')} />
    </InventoryFormShell>
  );
}

export function InventoryFormShell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        {children}
      </div>
    </section>
  );
}
