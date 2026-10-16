'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Fetches a `{ success, data }` URL whenever it changes. Loading is derived (request key vs
 * settled key), the previous result is kept for a dimmed refresh, and a superseded request
 * is aborted. Pass null to fetch nothing.
 */
export function useKeyedFetch<T>(url: string | null) {
  const router = useRouter();
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ url: string; value: T; raw: Record<string, unknown>; at: number } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const key = url ? `${url}#${nonce}` : null;

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
        setResult({ url, value: json.data as T, raw: json, at: Date.now() });
        setFailure(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setFailure({ key, message: err instanceof Error ? err.message : 'Request failed' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(key);
      });
    return () => controller.abort();
  }, [url, key, router]);

  return {
    value: result?.value ?? null,
    /** The URL the current value belongs to (it may lag `url` while a new request runs). */
    valueUrl: result?.url ?? null,
    /** The whole response body, for siblings of `data` such as `pagination`. */
    raw: result?.raw ?? null,
    receivedAt: result?.at ?? 0,
    loading: key !== null && settled !== key,
    error: failure && failure.key === key ? failure.message : null,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}
