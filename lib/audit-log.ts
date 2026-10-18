/**
 * How /admin/audit-logs reads an audit entry: the kinds it groups actions into, the words
 * for each record type, the sentence a row says, and where the record lives. Shared by the
 * list API, the insights and export routes, and the page.
 */

export const AUDIT_ACTIONS = [
  'create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'print', 'download', 'view',
  'access_denied', 'password_change', 'permission_change', 'backup', 'restore', 'data_export', 'data_deletion',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_RESOURCES = [
  'patient', 'visit', 'appointment', 'prescription', 'lab_result', 'invoice', 'document', 'user', 'doctor',
  'room', 'service', 'notification', 'referral', 'membership', 'staff', 'medicine', 'settings', 'system',
] as const;
export type AuditResource = (typeof AUDIT_RESOURCES)[number];

/** Kinds of entry, as the questions people bring to the log. */
export const AUDIT_KINDS = ['opened', 'changed', 'printed', 'sign-in', 'access', 'system'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export const KIND_ACTIONS: Record<AuditKind, AuditAction[]> = {
  opened: ['read', 'view'],
  changed: ['create', 'update', 'delete'],
  printed: ['print', 'download', 'export', 'data_export'],
  'sign-in': ['login', 'logout', 'password_change'],
  access: ['permission_change', 'access_denied'],
  system: ['backup', 'restore', 'data_deletion'],
};

export const KIND_LABEL: Record<AuditKind, string> = {
  opened: 'Records opened',
  changed: 'Records added, changed or removed',
  printed: 'Printed, downloaded or exported',
  'sign-in': 'Sign-ins and passwords',
  access: 'Permissions and refused access',
  system: 'Backups and data deletion',
};

export function kindOf(action: string): AuditKind {
  return (AUDIT_KINDS.find((k) => (KIND_ACTIONS[k] as string[]).includes(action)) ?? 'system') as AuditKind;
}

/** Narrower views of the list. */
export const AUDIT_SHOWS = ['patient', 'refused', 'failed-sign-in', 'failed'] as const;
export type AuditShow = (typeof AUDIT_SHOWS)[number];

export const SHOW_LABEL: Record<AuditShow, string> = {
  patient: 'About a patient',
  refused: 'Refused access',
  'failed-sign-in': 'Sign-ins that failed',
  failed: 'Didn’t go through',
};

export const isAuditKind = (v: unknown): v is AuditKind => typeof v === 'string' && (AUDIT_KINDS as readonly string[]).includes(v);
export const isAuditShow = (v: unknown): v is AuditShow => typeof v === 'string' && (AUDIT_SHOWS as readonly string[]).includes(v);
export const isAuditResource = (v: unknown): v is AuditResource =>
  typeof v === 'string' && (AUDIT_RESOURCES as readonly string[]).includes(v);

/** "a patient record", used inside sentences. */
const NOUN: Record<AuditResource, string> = {
  patient: 'a patient record',
  visit: 'a visit note',
  appointment: 'an appointment',
  prescription: 'a prescription',
  lab_result: 'a lab result',
  invoice: 'an invoice',
  document: 'a document',
  user: 'a sign-in account',
  doctor: 'a doctor’s profile',
  room: 'a room',
  service: 'a service on the price list',
  notification: 'a notification',
  referral: 'a referral',
  membership: 'a membership',
  staff: 'a staff profile',
  medicine: 'a medicine on the list',
  settings: 'the clinic settings',
  system: 'the system',
};

/** "Patient records", for menus and CSV. */
export const RESOURCE_LABEL: Record<AuditResource, string> = {
  patient: 'Patient records',
  visit: 'Visit notes',
  appointment: 'Appointments',
  prescription: 'Prescriptions',
  lab_result: 'Lab results',
  invoice: 'Invoices',
  document: 'Documents',
  user: 'Sign-in accounts',
  doctor: 'Doctors',
  room: 'Rooms',
  service: 'Services',
  notification: 'Notifications',
  referral: 'Referrals',
  membership: 'Memberships',
  staff: 'Staff',
  medicine: 'Medicines',
  settings: 'Clinic settings',
  system: 'System',
};

const noun = (resource: string) => NOUN[resource as AuditResource] ?? `a ${resource.replace(/_/g, ' ')}`;

/** What the person did, as the rest of a sentence that starts with their name. */
export function actionPhrase(action: string, resource: string, success: boolean): string {
  switch (action) {
    case 'login':
      return success ? 'signed in' : 'couldn’t sign in';
    case 'logout':
      return 'signed out';
    case 'password_change':
      return success ? 'changed a password' : 'tried to change a password';
    case 'access_denied':
      return resource === 'system' ? 'was refused access' : `was refused access to ${noun(resource)}`;
    case 'permission_change':
      return 'changed what a role may do';
    case 'backup':
      return 'made a backup';
    case 'download':
      // The only system-level download is a backup file.
      if (resource === 'system') return success ? 'downloaded a backup' : 'tried to download a backup';
      break;
    case 'delete':
      if (resource === 'system') return success ? 'deleted a backup' : 'tried to delete a backup';
      break;
    case 'restore':
      return 'restored a backup';
    case 'data_deletion':
      return 'deleted a patient’s data';
    case 'data_export':
    case 'export':
      return resource === 'system' ? 'exported data' : `exported ${noun(resource)}`;
  }
  const verb = VERBS[action];
  if (!verb) return `${action.replace(/_/g, ' ')} ${noun(resource)}`;
  return success ? `${verb[0]} ${noun(resource)}` : `tried to ${verb[1]} ${noun(resource)}`;
}

/** Past tense, and the base form for "tried to …". */
const VERBS: Record<string, [string, string]> = {
  read: ['opened', 'open'],
  view: ['opened', 'open'],
  create: ['added', 'add'],
  update: ['changed', 'change'],
  delete: ['removed', 'remove'],
  print: ['printed', 'print'],
  download: ['downloaded', 'download'],
};

/** Where the record an entry is about can be opened, when it still can. */
export function recordHref(resource: string, id: string | null, action: string): string | null {
  if (resource === 'system' && ['backup', 'restore', 'download', 'delete'].includes(action)) return '/admin/backups';
  if (action === 'delete' || action === 'data_deletion') return null;
  const byId: Record<string, string> = {
    patient: '/patients/',
    visit: '/visits/',
    appointment: '/appointments/',
    prescription: '/prescriptions/',
    lab_result: '/lab-results/',
    invoice: '/invoices/',
    document: '/documents/',
    doctor: '/doctors/',
    referral: '/referrals/',
    membership: '/memberships/',
  };
  if (id && byId[resource]) return `${byId[resource]}${id}`;
  const lists: Record<string, string> = {
    room: '/admin/rooms',
    service: '/admin/services',
    medicine: '/admin/medicines',
    staff: '/admin/staff',
    user: '/admin/users',
    settings: '/admin/settings',
  };
  return lists[resource] ?? null;
}

/**
 * Descriptions some writers fill with a template that only repeats the action and a raw id
 * ("Accessed patient data for patient 64f…"). The row already says that in words.
 */
export function usefulDescription(description: string | null | undefined): string | null {
  const text = description?.trim();
  if (!text) return null;
  if (/^(Accessed \w+ data for patient|Modified \w+ [a-f0-9]{24}$|Deleted \w+ [a-f0-9]{24}$|User logged (in|out):|Exported \w+ data( for patient [a-f0-9]{24})?$)/i.test(text)) {
    return null;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Shapes the API returns
// ---------------------------------------------------------------------------

export interface AuditChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditRow {
  _id: string;
  at: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  success: boolean;
  description: string | null;
  errorMessage: string | null;
  isSensitive: boolean;
  user: { _id: string | null; name: string | null; email: string | null; role: string | null };
  patient: { _id: string; name: string; code: string | null } | null;
  /** Set when the entry names a patient that is no longer on file. */
  patientMissing: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  changes: AuditChange[];
  metadata: Record<string, unknown> | null;
}

export interface AuditInsights {
  tz: string;
  today: string;
  days: number;
  perDay: { date: string; entries: number; refused: number }[];
  total: number;
  byKind: Record<AuditKind, number>;
  refused: number;
  failedSignIns: number;
  failed: number;
  aboutPatients: number;
  patientsOpened: number;
  /** How many people opened at least one patient's record. */
  openers: number;
  openedBy: { _id: string; name: string; patients: number }[];
  people: { _id: string; name: string; email: string; closed: boolean }[];
  oldest: string | null;
}

/** Days the insights strip covers. */
export const INSIGHT_DAYS = 30;

/** Most entries one CSV download holds (newest first). */
export const AUDIT_EXPORT_MAX = 10000;
