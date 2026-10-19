'use client';

import { useEffect, useId } from 'react';
import Link from 'next/link';
import { Modal } from '../ui/Modal';
import { FOCUS_RING } from '../appointments/shared';
import { useKeyedFetch } from '../hooks/useKeyedFetch';

type CheckInQr = { enabled: boolean; qrImage: string | null; expiresAt: string | null };

/**
 * The clinic's self check-in QR, full size, for a reception tablet. Patients with an appointment
 * today scan it in the eMCR app. The code rotates every few minutes; this refetches on its own.
 */
export default function CheckInQrModal({ onClose }: { onClose: () => void }) {
  const ids = useId();
  const qr = useKeyedFetch<CheckInQr>('/api/queue/check-in-qr');
  const { reload } = qr;
  const expiresAt = qr.value?.expiresAt ?? null;

  // Swap in the next code a moment after this one rotates.
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(reload, Math.max(5_000, new Date(expiresAt).getTime() - Date.now() + 1_000));
    return () => clearTimeout(timer);
  }, [expiresAt, reload]);

  const value = qr.value;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} className="max-w-md" labelledBy={`${ids}-title`}>
      <div className="border-b border-gray-200 px-6 py-5">
        <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
          Self check-in QR
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">
          Patients with an appointment today scan this in the eMCR app when they arrive. They join the queue already checked in.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-6">
        {qr.error && !value ? (
          <div role="alert" className="flex flex-col items-center gap-3 text-center text-sm text-red-800">
            <p>{qr.error}</p>
            <button type="button" onClick={reload} className={`rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Try again
            </button>
          </div>
        ) : !value ? (
          <div className="h-72 w-72 animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none" aria-label="Loading" />
        ) : value.enabled && value.qrImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data URL */}
            <img src={value.qrImage} alt="Clinic check-in QR code" className="h-72 w-72 rounded-lg border border-gray-200" />
            <p className="text-center text-sm text-gray-500">The code changes every 5 minutes, so a photo of it stops working. Leave this open on the tablet.</p>
          </>
        ) : (
          <p className="text-center text-sm text-gray-700">
            App check-in is off for this clinic. Turn on “Let patients check themselves in from the app” in{' '}
            <Link href="/admin/settings#queue" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Settings → Queue
            </Link>
            .
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-gray-200 px-6 py-4">
        <button type="button" onClick={onClose} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Close
        </button>
      </div>
    </Modal>
  );
}
