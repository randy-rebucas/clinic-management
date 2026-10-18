'use client';

import { useRouter } from 'next/navigation';
import { formatApiError } from '../utils/apiError';
import { USER_STATE, type UserRow, type UserState } from '@/lib/users';

export const ROLE_LABEL = (role: UserRow['role']) =>
  role ? role.displayName || role.name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'No role';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const DAY = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 9:41 AM", "Yesterday, 3:12 PM", "12 days ago", "Mar 3, 2025". */
export function lastSeen(iso: string | null): string {
  if (!iso) return 'Never';
  const at = new Date(iso);
  const now = new Date();
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay(at, now)) return `Today, ${time}`;
  if (sameDay(at, new Date(now.getTime() - DAY))) return `Yesterday, ${time}`;
  const days = Math.floor((now.getTime() - at.getTime()) / DAY);
  if (days < 45) return `${days} days ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The invite's own line under the state: when it runs out, or when it did. */
export function inviteLine(user: Pick<UserRow, 'inviteExpiresAt'>, state: UserState): string | null {
  if (!user.inviteExpiresAt) return null;
  const at = new Date(user.inviteExpiresAt);
  const hours = Math.round((at.getTime() - Date.now()) / (60 * 60 * 1000));
  if (state === 'invited') return hours <= 24 ? `Link works for ${Math.max(1, hours)} more ${hours === 1 ? 'hour' : 'hours'}` : `Link works until ${shortDate(user.inviteExpiresAt)}`;
  if (state === 'invite-expired') return `Link ran out ${shortDate(user.inviteExpiresAt)}`;
  return null;
}

const BADGE: Record<UserState, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  invited: 'bg-white text-gray-700 ring-gray-300',
  'invite-expired': 'bg-amber-50 text-amber-800 ring-amber-200',
  suspended: 'bg-gray-100 text-gray-700 ring-gray-200',
  inactive: 'bg-white text-gray-500 ring-gray-200',
};

export function StateBadge({ state }: { state: UserState }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE[state]}`}>{USER_STATE[state].label}</span>
  );
}

export type Send = (url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

/** One request helper: 401 goes to login, failures come back as words. */
export function useSend(fallback: string): Send {
  const router = useRouter();
  return async (url, method, body) => {
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return { ok: false, error: 'Signed out.' };
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return { ok: false, error: formatApiError(json, fallback) };
      return { ok: true, data: json.data };
    } catch {
      return { ok: false, error: 'The server couldn’t be reached. Nothing was changed; try again.' };
    }
  };
}
