'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InventoryForm, { type InventoryFormItem } from './InventoryForm';
import { InventoryFormShell } from './InventoryFormClient';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING } from './appointments/shared';

export default function InventoryEditClient({ itemId }: { itemId: string }) {
  const router = useRouter();
  const item = useKeyedFetch<InventoryFormItem & { _id: string }>(`/api/inventory/${itemId}`);
  const back = { href: `/inventory/${itemId}`, label: item.value ? `Back to ${item.value.name}` : 'Back to the item' };

  return (
    <InventoryFormShell back={back}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Edit details</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">{item.value ? item.value.name : 'Loading the item…'}</p>
      </header>
      {item.value ? (
        <InventoryForm key={item.value._id} item={item.value} onCancel={() => router.push(`/inventory/${itemId}`)} />
      ) : item.error ? (
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-gray-900">{/not found/i.test(item.error) ? 'Item not found' : 'This item didn’t load'}</p>
          <p className="mt-1 text-sm text-gray-500">{/not found/i.test(item.error) ? 'It may have been removed.' : `${item.error}. Check your connection and try again.`}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/inventory" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All inventory
            </Link>
            {!/not found/i.test(item.error) && (
              <button type="button" onClick={item.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          <div className="h-48 rounded-lg border border-gray-200 bg-white" />
        </div>
      )}
    </InventoryFormShell>
  );
}
