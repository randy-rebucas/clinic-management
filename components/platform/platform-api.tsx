import { formatApiError } from '../utils/apiError';
import { FOCUS_RING } from '../appointments/shared';

/** Fetch helper and button styles for the platform console's client components. */

export const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
export const PRIMARY = `rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
export const LABEL = 'mb-1.5 block text-sm font-medium text-gray-700';

export type CallResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function callPlatform<T = unknown>(url: string, method: string, body?: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, error: 'Your platform session ended. Sign in again.' };
    if (!res.ok || !json?.success) return { ok: false, error: formatApiError(json, 'That didn’t go through') };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, error: 'The server couldn’t be reached. Nothing was changed.' };
  }
}

export function Notice({ notice }: { notice: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!notice) return null;
  return (
    <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
      {notice.text}
    </p>
  );
}
