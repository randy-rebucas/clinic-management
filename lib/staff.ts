/**
 * Staff profiles (nurses, receptionists, accountants) as /admin/staff shows them, with the
 * state of each one's login account. Doctors have their own pages.
 * Client-safe: no model imports.
 */

import { userState, type UserState, type UserStatus } from './users';

export const STAFF_TYPES = ['nurse', 'receptionist', 'accountant'] as const;
export type StaffType = (typeof STAFF_TYPES)[number];

export const STAFF_TYPE: Record<StaffType, { label: string; plural: string; profileField: string }> = {
  nurse: { label: 'Nurse', plural: 'Nurses', profileField: 'nurseProfile' },
  receptionist: { label: 'Receptionist', plural: 'Receptionists', profileField: 'receptionistProfile' },
  accountant: { label: 'Accountant', plural: 'Accountants', profileField: 'accountantProfile' },
};

export const isStaffType = (v: unknown): v is StaffType => typeof v === 'string' && (STAFF_TYPES as readonly string[]).includes(v);

/** Employment status on the profile. Sign-in access is the account's own status. */
export const STAFF_STATUSES = ['active', 'on-leave', 'inactive'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const STAFF_STATUS: Record<StaffStatus, { label: string; hint: string }> = {
  active: { label: 'Active', hint: 'Working at the clinic' },
  'on-leave': { label: 'On leave', hint: 'Away for now, coming back' },
  inactive: { label: 'Inactive', hint: 'No longer works here' },
};

export const isStaffStatus = (v: unknown): v is StaffStatus => typeof v === 'string' && (STAFF_STATUSES as readonly string[]).includes(v);

/** The login account linked to a profile, as GET /api/staff returns it. */
export interface StaffAccount {
  userId: string;
  status: UserStatus;
  mustSetPassword: boolean;
  inviteExpiresAt: string | null;
  lastLogin: string | null;
}

export interface StaffRow {
  _id: string;
  staffType: StaffType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string | null;
  employeeId: string | null;
  department: string | null;
  specialization: string | null;
  licenseNumber: string | null;
  certification: string | null;
  address: string | null;
  hireDate: string | null;
  status: StaffStatus;
  createdAt: string;
  account: StaffAccount | null;
}

/** Fields the add/edit form sends. Blank optional fields are cleared on save. */
export const STAFF_TEXT_FIELDS = ['title', 'employeeId', 'department', 'specialization', 'licenseNumber', 'certification', 'address'] as const;

/** Which optional work fields each job has (the models don't share them). */
export const TYPE_FIELDS: Record<StaffType, readonly (typeof STAFF_TEXT_FIELDS)[number][]> = {
  nurse: ['title', 'specialization', 'licenseNumber'],
  receptionist: [],
  accountant: ['certification', 'licenseNumber'],
};

export type AccountState = UserState | 'none';

export function accountState(row: Pick<StaffRow, 'account'>, now: number = Date.now()): AccountState {
  return row.account ? userState(row.account, now) : 'none';
}

/** Someone marked as no longer working here whose account still lets them in. */
export const leftButCanSignIn = (row: Pick<StaffRow, 'status' | 'account'>) =>
  row.status === 'inactive' && row.account?.status === 'active';

/** The roster's "Signing in" filter. */
export const STAFF_SHOWS = ['left-can-sign-in', 'invited', 'invite-expired', 'suspended', 'none'] as const;
export type StaffShow = (typeof STAFF_SHOWS)[number];

export const STAFF_SHOW_LABEL: Record<StaffShow, string> = {
  'left-can-sign-in': 'Inactive, but can still sign in',
  invited: 'Invite waiting',
  'invite-expired': 'Invite ran out',
  suspended: 'Sign-in suspended or closed',
  none: 'No sign-in account',
};

export const isStaffShow = (v: unknown): v is StaffShow => typeof v === 'string' && (STAFF_SHOWS as readonly string[]).includes(v);

export function matchesShow(row: StaffRow, show: StaffShow, now: number = Date.now()): boolean {
  const state = accountState(row, now);
  switch (show) {
    case 'left-can-sign-in':
      return leftButCanSignIn(row);
    case 'suspended':
      return state === 'suspended' || state === 'inactive';
    default:
      return state === show;
  }
}

export const staffName = (r: Pick<StaffRow, 'firstName' | 'lastName'>) => `${r.firstName} ${r.lastName}`.trim();

/** "RN · Pediatrics", "CPA", the department when nothing more specific is on file. */
export function workLine(r: StaffRow): string {
  const parts =
    r.staffType === 'nurse' ? [r.title, r.specialization] : r.staffType === 'accountant' ? [r.certification] : [];
  const specific = parts.filter(Boolean) as string[];
  if (r.department) specific.push(r.department);
  return specific.join(' · ');
}
