'use client';

import Link from 'next/link';
import { FOCUS_RING } from '../appointments/shared';
import { DEFAULT_TIMEZONE } from '@/lib/tz';

export { FIELD, FOCUS_RING } from '../appointments/shared';

export const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`;
export const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`;
export const DANGER_BUTTON = `inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`;

export type FieldErrors = Record<string, string[] | undefined>;

/** Fired on window with `detail: { name }` after the user renames themselves, so the header follows. */
export const ACCOUNT_UPDATED_EVENT = 'account:updated';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
}

/**
 * Fixed locale and clinic time zone: these pages are server-rendered, so formatting with the
 * browser's locale or zone would differ from the server's HTML and break hydration.
 */
export function dateLabel(iso: string | null, withTime = false) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: DEFAULT_TIMEZONE }
    : { month: 'long', day: 'numeric', year: 'numeric', timeZone: DEFAULT_TIMEZONE });
}

/** Title row shared by /profile and /settings, with a switch between the two. */
export function AccountHeader({ title, subtitle, current }: { title: string; subtitle: string; current: 'profile' | 'settings' }) {
  const tabs = [
    { key: 'profile', href: '/profile', label: 'Profile' },
    { key: 'settings', href: '/settings', label: 'Sign-in & security' },
  ] as const;
  return (
    <header className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">{subtitle}</p>
      </div>
      <nav aria-label="Your account" className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`relative px-3 py-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                active ? 'text-brand-teal-deep' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-teal-dark" />}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** A settings section: what it is on the left, the controls on the right. */
export function Section({ id, title, description, children }: { id?: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8 py-8 first:pt-2 border-b border-gray-200 last:border-b-0">
      <div>
        <h2 id={headingId} className="text-base font-bold tracking-tight text-gray-900">{title}</h2>
        {description && <div className="text-sm text-gray-600 mt-1">{description}</div>}
      </div>
      <div className="min-w-0 rounded-lg border border-gray-200 bg-white">{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
      {children}
      {errors?.length ? (
        <ul id={`${id}-error`} className="text-sm text-red-700 space-y-0.5">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** aria props tying an input to its hint or error text. */
export function describe(id: string, errors?: string[], hasHint = false) {
  const invalid = !!errors?.length;
  return {
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}

export function Notice({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`motion-panel-in rounded-md px-3 py-2 text-sm ${
        tone === 'error' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-brand-teal-light text-brand-teal-deep ring-1 ring-brand-teal/30'
      }`}
    >
      {children}
    </p>
  );
}

export async function readJson(res: Response): Promise<{ success?: boolean; error?: string; fieldErrors?: FieldErrors; data?: any }> {
  try {
    return await res.json();
  } catch {
    return { success: false, error: res.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : 'Something went wrong. Try again.' };
  }
}
