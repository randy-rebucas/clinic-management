'use client';

import { useEffect, useId, useState } from 'react';
import SignaturePad from '../SignaturePad';
import { DANGER_BUTTON, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, Section, dateLabel, readJson } from './shared';

type Stored = { image: string | null; updatedAt: string | null };
type Mode = 'view' | 'draw';

/** Longest edge of an uploaded signature after downscaling; keeps the stored image small. */
const MAX_EDGE = 800;

/**
 * Downscale an uploaded photo/scan of a signature to a PNG data URL, so a phone photo
 * does not exceed the 200 KB limit. Transparent pixels stay transparent.
 */
function fileToSignature(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

export default function SignatureSection({ doctorName }: { doctorName: string }) {
  const fileId = useId();
  const [stored, setStored] = useState<Stored | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/account/signature')
      .then(readJson)
      .then((body) => {
        if (alive) setStored(body.success ? (body.data as Stored) : { image: null, updatedAt: null });
      })
      .catch(() => alive && setStored({ image: null, updatedAt: null }));
    return () => {
      alive = false;
    };
  }, []);

  async function send(method: 'PUT' | 'DELETE', image?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account/signature', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'PUT' ? JSON.stringify({ image }) : undefined,
      });
      const body = await readJson(res);
      if (!res.ok || !body.success) {
        setNotice({ tone: 'error', text: body.error || 'Could not save your signature. Try again.' });
        return;
      }
      setStored(body.data as Stored);
      setMode('view');
      setNotice({ tone: 'success', text: method === 'PUT' ? 'Signature saved.' : 'Signature removed.' });
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setNotice({ tone: 'error', text: 'Choose a PNG, JPEG or WebP image.' });
      return;
    }
    try {
      await send('PUT', await fileToSignature(file));
    } catch {
      setNotice({ tone: 'error', text: 'That image could not be read. Try another file.' });
    }
  }

  return (
    <Section
      id="signature"
      title="Signature"
      description="Printed above your name on prescriptions, medical certificates, lab requests and referral letters you issue. Only you can change it."
    >
      <div className="flex flex-col gap-4 p-5">
        {mode === 'draw' ? (
          <SignaturePad providerName={doctorName} onCancel={() => setMode('view')} onSave={(data) => send('PUT', data)} />
        ) : stored === null ? (
          <div className="h-24 animate-pulse rounded-md bg-gray-100" aria-label="Loading signature" />
        ) : stored.image ? (
          <figure className="flex flex-col gap-2">
            <div className="flex h-28 items-center justify-center rounded-md border border-gray-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
              <img src={stored.image} alt={`Signature of ${doctorName}`} className="max-h-full max-w-full object-contain" />
            </div>
            <figcaption className="text-sm text-gray-500">Saved {dateLabel(stored.updatedAt, true)}</figcaption>
          </figure>
        ) : (
          <p className="text-sm text-gray-700">
            No signature on file. Documents print with a blank line for you to sign by hand.
          </p>
        )}

        {mode === 'view' && stored !== null && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => setMode('draw')}>
              {stored.image ? 'Draw again' : 'Draw signature'}
            </button>
            <label htmlFor={fileId} className={`${SECONDARY_BUTTON} cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
              Upload image
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={upload}
            />
            {stored.image && (
              <button type="button" className={DANGER_BUTTON} disabled={busy} onClick={() => send('DELETE')}>
                Remove
              </button>
            )}
          </div>
        )}

        <div aria-live="polite">{notice && <Notice tone={notice.tone}>{notice.text}</Notice>}</div>
      </div>
    </Section>
  );
}
