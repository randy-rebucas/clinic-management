/**
 * Staff login accounts as /admin/users shows them. One derived state per account, so the
 * list, its filters, the insights and the overview all say the same thing.
 * Client-safe: no model imports.
 */

import { IDLE_DAYS } from './admin-overview.shared';

export const USER_STATUSES = ['active', 'suspended', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** What an account can do right now, in the order the list explains them. */
export const USER_STATES = ['active', 'invited', 'invite-expired', 'suspended', 'inactive'] as const;
export type UserState = (typeof USER_STATES)[number];

export const USER_STATE: Record<UserState, { label: string; hint: string }> = {
  active: { label: 'Can sign in', hint: 'Signs in with their own password' },
  invited: { label: 'Invite waiting', hint: 'Hasn’t set a password yet' },
  'invite-expired': { label: 'Invite ran out', hint: 'Can’t sign in until invited again' },
  suspended: { label: 'Suspended', hint: 'Sign-in paused; reactivate to restore it' },
  inactive: { label: 'Closed', hint: 'No longer has access' },
};

export interface UserStateInput {
  status?: string;
  mustSetPassword?: boolean;
  inviteExpiresAt?: string | Date | null;
}

export function userState(u: UserStateInput, now: number = Date.now()): UserState {
  if (u.status === 'inactive') return 'inactive';
  if (u.status === 'suspended') return 'suspended';
  if (u.mustSetPassword) {
    const ends = u.inviteExpiresAt ? new Date(u.inviteExpiresAt).getTime() : null;
    return ends !== null && ends < now ? 'invite-expired' : 'invited';
  }
  return 'active';
}

/** The list's "Show" filter: a state, or one of the two security questions. */
export const USER_SHOWS = [...USER_STATES, 'idle', 'no-two-step'] as const;
export type UserShow = (typeof USER_SHOWS)[number];

export const USER_SHOW_LABEL: Record<UserShow, string> = {
  ...Object.fromEntries(USER_STATES.map((s) => [s, USER_STATE[s].label])) as Record<UserState, string>,
  idle: `Not used in ${IDLE_DAYS} days`,
  'no-two-step': 'Without two-step verification',
};

export const isUserShow = (v: unknown): v is UserShow => typeof v === 'string' && (USER_SHOWS as readonly string[]).includes(v);

/** Mongo conditions for a "Show" choice (added to the tenant filter). */
export function userShowFilter(show: UserShow, now: Date = new Date()): Record<string, unknown> {
  const idleBefore = new Date(now.getTime() - IDLE_DAYS * 24 * 60 * 60 * 1000);
  switch (show) {
    case 'active':
      return { status: 'active', mustSetPassword: { $ne: true } };
    case 'invited':
      return { status: 'active', mustSetPassword: true, $or: [{ inviteExpiresAt: { $gte: now } }, { inviteExpiresAt: null }] };
    case 'invite-expired':
      return { status: 'active', mustSetPassword: true, inviteExpiresAt: { $lt: now } };
    case 'suspended':
      return { status: 'suspended' };
    case 'inactive':
      return { status: 'inactive' };
    case 'idle':
      return {
        status: 'active',
        mustSetPassword: { $ne: true },
        $or: [{ lastLogin: { $lt: idleBefore } }, { lastLogin: null, createdAt: { $lt: idleBefore } }],
      };
    case 'no-two-step':
      return { status: { $ne: 'inactive' }, mustSetPassword: { $ne: true }, totpEnabled: { $ne: true } };
  }
}

export const USER_SORTS = ['name', 'last-sign-in', 'newest'] as const;
export type UserSort = (typeof USER_SORTS)[number];
export const USER_SORT_LABEL: Record<UserSort, string> = {
  name: 'By name',
  'last-sign-in': 'Signed in longest ago first',
  newest: 'Newest accounts first',
};
export const isUserSort = (v: unknown): v is UserSort => typeof v === 'string' && (USER_SORTS as readonly string[]).includes(v);

/** Which staff profile an account belongs to, and where that profile is managed. */
export const PROFILE_LINKS = {
  doctorProfile: { label: 'Doctor profile', href: (id: string) => `/doctors/${id}` },
  nurseProfile: { label: 'Staff profile', href: () => '/admin/staff' },
  receptionistProfile: { label: 'Staff profile', href: () => '/admin/staff' },
  accountantProfile: { label: 'Staff profile', href: () => '/admin/staff' },
  adminProfile: { label: 'Admin profile', href: () => '/admin/staff' },
  medicalRepresentativeProfile: { label: 'Medical rep profile', href: () => '/medical-reps' },
} as const;
export type ProfileKey = keyof typeof PROFILE_LINKS;
export const PROFILE_KEYS = Object.keys(PROFILE_LINKS) as ProfileKey[];

/** One account row, as GET /api/users returns it. */
export interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: { _id: string; name: string; displayName?: string } | null;
  status: UserStatus;
  mustSetPassword: boolean;
  inviteExpiresAt: string | null;
  totpEnabled: boolean;
  lastLogin: string | null;
  createdAt: string;
  profile: { key: ProfileKey; id: string } | null;
}

export interface RoleOption {
  _id: string;
  name: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  count: number;
}

export interface UserInsights {
  byState: Record<UserState, number>;
  roles: RoleOption[];
  twoStep: { on: number; total: number; adminsWithout: number };
  idle: number;
  signedInWeek: number;
}
