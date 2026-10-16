// Document labels and rules shared by the API and the documents screens (no server imports).

export const DOCUMENT_CATEGORY_KEYS = [
  'referral', 'laboratory_result', 'imaging', 'medical_certificate', 'prescription', 'invoice', 'id', 'insurance', 'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORY_KEYS)[number];
export type DocumentKind = 'pdf' | 'image' | 'word' | 'excel' | 'other';
export type DocumentStatusFilter = 'active' | 'archived' | 'all';

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  referral: 'Referral letter',
  laboratory_result: 'Lab result',
  imaging: 'Imaging',
  medical_certificate: 'Medical certificate',
  prescription: 'Prescription',
  invoice: 'Invoice or receipt',
  id: 'ID',
  insurance: 'Insurance or HMO',
  other: 'Other',
};

export const categoryLabel = (c?: string) => (c && c in CATEGORY_LABEL ? CATEGORY_LABEL[c as DocumentCategory] : 'Other');

/** The short file-type mark shown on rows (always with the word, never colour alone). */
export const KIND_MARK: Record<DocumentKind, string> = { pdf: 'PDF', image: 'IMG', word: 'DOC', excel: 'XLS', other: 'FILE' };
export const KIND_LABEL: Record<DocumentKind, string> = { pdf: 'PDF', image: 'Image', word: 'Word document', excel: 'Spreadsheet', other: 'File' };

/** Upload cap when files go to Cloudinary (inline storage has its own, smaller cap). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Days before an expiry date that a document counts as "expiring soon". */
export const EXPIRING_DAYS = 30;

export function fileSize(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Whole days from today until `iso` (negative once past), on calendar days. */
export function daysUntil(iso: string, now = new Date()) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** The expiry a document carries: its own date, or a certificate's "valid until". */
export const expiryOf = (d: { expiryDate?: string | Date | null; medicalCertificate?: { validUntil?: string | Date | null } | null }) =>
  d.expiryDate ?? d.medicalCertificate?.validUntil ?? null;
