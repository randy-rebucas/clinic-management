/**
 * Roles as /admin/roles shows them, and the one place that says what a role is allowed.
 * Client-safe: no model imports.
 *
 * What a person may do is decided in `app/lib/auth-helpers.ts`:
 *   administrator (admin/owner)            → everything
 *   otherwise, allowed when any of these grants it:
 *     - BUILT_IN[role]                      (always on; can't be turned off here)
 *     - Permission documents for the role   (what this page edits)
 *     - Permission documents for the person (extra access of their own)
 * `Role.defaultPermissions` is only the template a new clinic is seeded from; nothing reads it
 * when checking access, so this page never edits it.
 */

export const ROLE_NAMES = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative', 'medical-technologist'] as const;
export type StandardRole = (typeof ROLE_NAMES)[number];
export const isStandardRole = (v: unknown): v is StandardRole => typeof v === 'string' && (ROLE_NAMES as readonly string[]).includes(v);

/** Name, description and sort level a role starts with when it is added to a clinic. */
export const STANDARD_ROLE: Record<StandardRole, { displayName: string; description: string; level: number }> = {
  admin: { displayName: 'Administrator', description: 'Full system access with all permissions', level: 100 },
  doctor: { displayName: 'Doctor', description: 'Clinical staff with access to patient care, visits, and prescriptions', level: 80 },
  nurse: { displayName: 'Nurse', description: 'Clinical staff with access to patient care and lab results', level: 60 },
  receptionist: { displayName: 'Receptionist', description: 'Front desk staff with access to appointments and patient management', level: 40 },
  accountant: { displayName: 'Accountant', description: 'Financial staff with access to billing and invoices', level: 30 },
  'medical-technologist': { displayName: 'Medical technologist', description: 'Laboratory staff who receive lab requests and enter results', level: 50 },
  'medical-representative': { displayName: 'Medical representative', description: 'Pharmaceutical representatives who visit the clinic’s doctors', level: 10 },
};

/**
 * Access every role has no matter what this page says, by action then resource. The access
 * checks in `app/lib/auth-helpers.ts` read this table.
 */
export const BUILT_IN: Record<string, Record<string, string[]>> = {
  doctor: {
    read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals', 'reports', 'medicines', 'services', 'rooms'],
    write: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals'],
    delete: ['prescriptions'],
  },
  nurse: {
    read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'queue', 'medicines', 'rooms'],
    write: ['patients', 'visits', 'queue', 'lab-results'],
    delete: [],
  },
  // Hands the patient their medicines at checkout: sees prescriptions and records what was
  // given, but never changes what the doctor wrote.
  receptionist: {
    read: ['patients', 'appointments', 'queue', 'invoices', 'visits', 'doctors', 'services', 'rooms', 'prescriptions'],
    write: ['patients', 'appointments', 'queue', 'invoices'],
    dispense: ['prescriptions'],
    delete: [],
  },
  accountant: {
    read: ['patients', 'invoices', 'reports', 'visits'],
    write: ['invoices'],
    delete: [],
  },
  // Receives the doctors' lab requests and enters the results; marking them reviewed stays with
  // the doctors (`canReviewLabs` in lib/lab-results.ts).
  'medical-technologist': {
    read: ['patients', 'lab-results'],
    write: [],
    update: ['lab-results'],
    delete: [],
  },
  'medical-representative': {
    read: ['doctors', 'appointments'],
    write: [],
    delete: [],
  },
};

export const isBuiltIn = (role: string, key: string) => {
  const [resource, action] = key.split(':');
  return !!BUILT_IN[role]?.[action]?.includes(resource);
};

export const isAdminRole = (role: string) => role === 'admin' || role === 'owner';

export interface AccessItem {
  /** "resource:action", as the access checks ask for it. */
  key: string;
  label: string;
}

export interface AccessGroup {
  key: string;
  title: string;
  items: AccessItem[];
}

const item = (key: string, label: string): AccessItem => ({ key, label });

/**
 * Every permission the app actually checks, in words. A resource or action nothing checks
 * ("create", medicines:read) is left out, so no box here is a box that does nothing.
 */
export const ACCESS: AccessGroup[] = [
  {
    key: 'care',
    title: 'Patients and care',
    items: [
      item('patients:read', 'See patient records'),
      item('patients:write', 'Register patients, add notes and set up their app access'),
      item('patients:update', 'Edit patient details and attach files'),
      item('patients:delete', 'Delete patient records'),
      item('visits:read', 'Read visit notes'),
      item('visits:write', 'Start visit notes'),
      item('visits:update', 'Edit, close and sign visit notes'),
      item('visits:delete', 'Delete visit notes'),
      item('prescriptions:read', 'See prescriptions'),
      item('prescriptions:write', 'Write prescriptions'),
      item('prescriptions:dispense', 'Record medicines handed to the patient'),
      item('prescriptions:update', 'Dispense, change, cancel and close prescriptions'),
      item('prescriptions:delete', 'Delete prescriptions'),
      item('lab-results:read', 'See lab tests and results'),
      item('lab-results:write', 'Order lab tests'),
      item('lab-results:update', 'Enter results, mark them reviewed and tell the patient'),
      item('referrals:read', 'See referrals'),
      item('referrals:write', 'Refer patients'),
      item('referrals:update', 'Accept, decline and close referrals'),
      item('documents:read', 'Open documents'),
      item('documents:write', 'Upload documents'),
      item('documents:update', 'Edit, file and archive documents'),
    ],
  },
  {
    key: 'desk',
    title: 'Front desk',
    items: [
      item('appointments:read', 'See the schedule'),
      item('appointments:write', 'Book appointments and manage the waitlist'),
      item('appointments:update', 'Confirm, move and cancel bookings; send reminders'),
      item('appointments:delete', 'Delete bookings'),
      item('queue:read', 'See the queue'),
      item('queue:write', 'Add patients to the queue'),
      item('queue:update', 'Call patients, check them in and take vitals'),
      item('queue:delete', 'Remove patients from the queue'),
      item('doctors:read', 'See doctors and their hours'),
      item('doctors:write', 'Add doctors'),
      item('doctors:update', 'Edit doctors’ profiles, hours, fees and notes'),
      item('doctors:delete', 'Remove doctors'),
    ],
  },
  {
    key: 'money',
    title: 'Billing and stock',
    items: [
      item('invoices:read', 'See invoices and balances'),
      item('invoices:write', 'Make invoices, take payments and open income reports'),
      item('invoices:update', 'Refund invoices'),
      item('memberships:read', 'See memberships (anyone who sees invoices already can)'),
      item('memberships:write', 'Change membership tiers and end dates, correct points'),
      item('inventory:read', 'See stock'),
      item('inventory:write', 'Add, restock and adjust stock'),
      item('inventory:delete', 'Remove stock items'),
      item('reports:read', 'Open reports (each report also needs its own area)'),
    ],
  },
  {
    key: 'setup',
    title: 'Clinic setup',
    items: [
      item('services:write', 'Add and change services on the price list'),
      item('services:delete', 'Remove services from the price list'),
      item('rooms:write', 'Add rooms, change them and mark them open or closed'),
      item('medicines:write', 'Add and change medicines on the list doctors prescribe from'),
      item('settings:read', 'See how much file storage is used'),
      item('notifications:read', 'Open the notifications page'),
    ],
  },
];

export const ACCESS_ITEMS: AccessItem[] = ACCESS.flatMap((g) => g.items);
export const ACCESS_KEYS = new Set(ACCESS_ITEMS.map((i) => i.key));
export const ACCESS_LABEL: Record<string, string> = Object.fromEntries(ACCESS_ITEMS.map((i) => [i.key, i.label]));
/** Resources this page manages; Permission documents for any other resource are left alone. */
export const ACCESS_RESOURCES = new Set(ACCESS_ITEMS.map((i) => i.key.split(':')[0]));

/** One role as /admin/roles shows it. */
export interface RoleRow {
  _id: string;
  name: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  /** Accounts holding the role that aren't closed. */
  people: number;
  /** Granted by this role's Permission documents, catalogued keys only (built-ins not added). */
  grants: string[];
  /** Fingerprint of the role's Permission documents, sent back on save to catch a concurrent edit. */
  version: string;
}

/** A person whose own Permission documents allow more than their role does. */
export interface PersonalAccess {
  userId: string;
  name: string;
  roleId: string | null;
  keys: string[];
}

export interface RolesPage {
  roles: RoleRow[];
  missing: { name: StandardRole; displayName: string }[];
  personal: PersonalAccess[];
}

/** What the role allows: everything for administrators, otherwise built-in plus granted. */
export function allowedKeys(role: Pick<RoleRow, 'name' | 'grants'>): Set<string> {
  if (isAdminRole(role.name)) return new Set(ACCESS_KEYS);
  const out = new Set(role.grants.filter((k) => ACCESS_KEYS.has(k)));
  for (const k of ACCESS_KEYS) if (isBuiltIn(role.name, k)) out.add(k);
  return out;
}
