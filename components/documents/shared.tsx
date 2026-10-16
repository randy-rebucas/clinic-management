'use client';

import { KIND_MARK, KIND_LABEL, daysUntil, type DocumentKind } from '@/lib/documents';

export interface DocumentRow {
  _id: string;
  documentCode: string;
  title: string;
  description?: string;
  category: string;
  documentType: DocumentKind;
  originalFilename?: string;
  filename?: string;
  contentType?: string;
  size: number;
  url?: string;
  patient?: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  visit?: { _id: string; visitCode: string; date: string } | null;
  uploadedBy?: { _id: string; name: string } | null;
  uploadDate: string;
  status: 'active' | 'archived' | 'deleted';
  isConfidential?: boolean;
  expiryDate?: string;
  medicalCertificate?: { issueDate?: string; validUntil?: string; purpose?: string; restrictions?: string } | null;
  tags?: string[];
  scanned?: boolean;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** The file type as a small gray mark with its word (never a colour per type). */
export function KindMark({ kind, size = 'md' }: { kind: DocumentKind; size?: 'md' | 'lg' }) {
  return (
    <span
      title={KIND_LABEL[kind] ?? 'File'}
      className={`flex shrink-0 items-center justify-center rounded-md bg-gray-100 font-mono font-semibold text-gray-600 ring-1 ring-inset ring-gray-200 text-xs ${size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'}`}
    >
      {KIND_MARK[kind] ?? 'FILE'}
      <span className="sr-only"> {KIND_LABEL[kind] ?? 'File'}</span>
    </span>
  );
}

/** "Expired Oct 2" (red), "Expires in 12 days" (amber within 30), else the plain date. */
export function ExpiryLine({ iso, className = '' }: { iso: string; className?: string }) {
  const d = daysUntil(iso);
  if (d < 0) return <span className={`font-medium text-red-700 ${className}`}>Expired <span className="font-mono">{shortDate(iso)}</span></span>;
  if (d === 0) return <span className={`font-medium text-amber-800 ${className}`}>Expires today</span>;
  if (d <= 30)
    return (
      <span className={`font-medium text-amber-800 ${className}`}>
        Expires in <span className="font-mono">{d}</span> {d === 1 ? 'day' : 'days'}
      </span>
    );
  return (
    <span className={`text-gray-500 ${className}`}>
      Valid until <span className="font-mono">{shortDate(iso)}</span>
    </span>
  );
}
