'use client';

import { FIELD } from '../appointments/shared';
import { Label, NoteArea } from '../visits/form/parts';
import type { DocumentCategory } from '@/lib/documents';

type FieldDef = { key: string; label: string; kind: 'text' | 'date' | 'long'; placeholder?: string };

/** The details each kind of document carries, the API group they are stored in, and its form key. */
export const DETAIL_FIELDS: Partial<Record<DocumentCategory, { group: string; formKey: string; fields: FieldDef[] }>> = {
  referral: {
    group: 'referral',
    formKey: 'referralData',
    fields: [
      { key: 'referringDoctor', label: 'Referred by', kind: 'text', placeholder: 'Dr. …' },
      { key: 'referringClinic', label: 'From', kind: 'text', placeholder: 'Clinic or hospital' },
      { key: 'referralDate', label: 'Date of the referral', kind: 'date' },
      { key: 'reason', label: 'Reason', kind: 'long' },
    ],
  },
  imaging: {
    group: 'imaging',
    formKey: 'imagingData',
    fields: [
      { key: 'modality', label: 'Study', kind: 'text', placeholder: 'X-ray, ultrasound, CT, MRI…' },
      { key: 'bodyPart', label: 'Body part', kind: 'text', placeholder: 'e.g. Chest PA' },
      { key: 'studyDate', label: 'Date taken', kind: 'date' },
      { key: 'radiologist', label: 'Read by', kind: 'text', placeholder: 'Radiologist' },
    ],
  },
  medical_certificate: {
    group: 'medicalCertificate',
    formKey: 'medicalCertificateData',
    fields: [
      { key: 'issueDate', label: 'Issued on', kind: 'date' },
      { key: 'validUntil', label: 'Valid until', kind: 'date' },
      { key: 'purpose', label: 'For', kind: 'text', placeholder: 'Work, school, travel…' },
      { key: 'restrictions', label: 'Restrictions', kind: 'long' },
    ],
  },
  laboratory_result: {
    group: 'labResultMetadata',
    formKey: 'labResultData',
    fields: [
      { key: 'testType', label: 'Test', kind: 'text', placeholder: 'e.g. CBC, lipid profile' },
      { key: 'testDate', label: 'Date of the test', kind: 'date' },
      { key: 'labName', label: 'Laboratory', kind: 'text' },
    ],
  },
};

/** Kinds whose document has its own expiry (an ID, an HMO card). Certificates use "Valid until". */
export const HAS_EXPIRY = new Set<DocumentCategory>(['id', 'insurance']);

export const dateInput = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

/** The details object for the API: only filled fields; dates as yyyy-MM-dd. */
export function detailsPayload(category: DocumentCategory, values: Record<string, string>) {
  const def = DETAIL_FIELDS[category];
  if (!def) return null;
  const out: Record<string, string> = {};
  for (const f of def.fields) if (values[f.key]?.trim()) out[f.key] = values[f.key].trim();
  return Object.keys(out).length ? out : null;
}

export function DetailFields({ category, values, onChange, idPrefix }: { category: DocumentCategory; values: Record<string, string>; onChange: (key: string, v: string) => void; idPrefix: string }) {
  const def = DETAIL_FIELDS[category];
  if (!def) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {def.fields.map((f) => (
        <div key={f.key} className={f.kind === 'long' ? 'sm:col-span-2' : ''}>
          <Label htmlFor={`${idPrefix}-${f.key}`} optional>
            {f.label}
          </Label>
          {f.kind === 'long' ? (
            <NoteArea id={`${idPrefix}-${f.key}`} rows={2} value={values[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
          ) : (
            <input
              id={`${idPrefix}-${f.key}`}
              type={f.kind === 'date' ? 'date' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              maxLength={200}
              className={`${FIELD} ${f.kind === 'date' ? 'font-mono' : ''}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
