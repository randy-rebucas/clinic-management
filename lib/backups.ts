/**
 * In-app backups: what /admin/backups shows and the limits the backups API works within.
 * Shared by the API routes and the page.
 */

/** A backup is one database document, so it has to stay well under MongoDB's 16 MB limit. */
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;

/** From 80% of the limit the page warns that in-app backups will soon stop working. */
export const NEAR_BACKUP_LIMIT = 0.8;

/** No backup for this long reads as overdue. */
export const BACKUP_STALE_DAYS = 30;

/** Never copied into a backup: credentials, sign-in codes and device tokens. */
export const SECRET_FIELDS = [
  'password',
  'defaultPassword',
  'totpSecret',
  'totpLastUsedStep',
  'otp',
  'otpExpiry',
  'otpAttempts',
  'loginQrTokenHash',
  'loginQrTokenExpiry',
  'pushToken',
  'feedbackToken',
  'resetPasswordToken',
  'resetPasswordExpires',
];

/** Platform-level or credential-only collections that are not part of a clinic's data. */
export const SKIPPED_COLLECTIONS = ['backuprecords', 'mobiledevices', 'pushsubscriptions', 'paypalorders', 'counters', 'specializations'];

/** Collection names in words, for "120 patients · 340 visits". */
const COLLECTION_WORDS: Record<string, [string, string]> = {
  patients: ['patient', 'patients'],
  visits: ['visit', 'visits'],
  appointments: ['appointment', 'appointments'],
  prescriptions: ['prescription', 'prescriptions'],
  labresults: ['lab result', 'lab results'],
  invoices: ['invoice', 'invoices'],
  documents: ['document', 'documents'],
  users: ['account', 'accounts'],
  doctors: ['doctor', 'doctors'],
  inventoryitems: ['stock item', 'stock items'],
  medicines: ['medicine', 'medicines'],
  services: ['service', 'services'],
  referrals: ['referral', 'referrals'],
  memberships: ['membership', 'memberships'],
  auditlogs: ['audit entry', 'audit entries'],
  notifications: ['notification', 'notifications'],
  queues: ['queue entry', 'queue entries'],
};

export function collectionWords(name: string, n: number): string {
  const words = COLLECTION_WORDS[name];
  const label = words ? words[n === 1 ? 0 : 1] : name;
  return `${n.toLocaleString('en-US')} ${label}`;
}

/** The kinds of record people look for first, in this order. */
export const HEADLINE_COLLECTIONS = ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'labresults'];

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface BackupRow {
  _id: string;
  label: string | null;
  status: 'pending' | 'completed' | 'failed' | 'restoring';
  createdAt: string;
  createdBy: { _id: string | null; name: string | null; email: string | null };
  collections: string[];
  counts: Record<string, number> | null;
  totalDocuments: number;
  sizeBytes: number;
  errorMessage: string | null;
}

export interface BackupSummary {
  total: number;
  storedBytes: number;
  last: { at: string; sizeBytes: number } | null;
}
