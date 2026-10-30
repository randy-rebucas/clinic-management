'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING } from '../appointments/shared';
import { visitTypeLabel } from '../visits/shared';
import { KIND_PURPOSES, PURPOSE_LABELS } from '@/lib/document-requests';

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;
const LINK = `rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`;

export interface CertificateVisit {
  _id: string;
  visitCode: string;
  date: string;
  visitType: string;
  status: string;
  diagnoses?: { code?: string; description?: string; primary?: boolean }[];
  provider?: { name?: string } | null;
}

const PURPOSES = KIND_PURPOSES.medical_certificate;
const visitDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "sick leave", "insurance or HMO claim": how the purpose reads in the certificate's sentence. */
function purposeText(purpose: string, other: string): string {
  if (!purpose) return '';
  if (purpose === 'other') return other.trim();
  const label = PURPOSE_LABELS[purpose as keyof typeof PURPOSE_LABELS] ?? '';
  return label ? label[0].toLowerCase() + label.slice(1) : '';
}

/**
 * Issue a medical certificate from the patient's page (doctors and clinic admins): pick the visit it
 * certifies and, optionally, what it is for. The certificate is the visit's own sealed
 * certificate (GET /api/visits/:id/print/medical-certificate), so it prints what the visit says.
 */
export default function MedicalCertificateDialog({
  open,
  onOpenChange,
  patientName,
  visits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  visits: CertificateVisit[];
}) {
  const ids = useId();
  // Only visits a doctor has written up can be certified; newest first.
  const eligible = visits.filter((v) => v.status === 'open' || v.status === 'closed').slice(0, 10);
  const [picked, setPicked] = useState('');
  const [purpose, setPurpose] = useState('');
  const [other, setOther] = useState('');
  // The latest visit until the doctor picks another.
  const visitId = eligible.some((v) => v._id === picked) ? picked : eligible[0]?._id ?? '';

  // Each opening starts fresh.
  const change = (next: boolean) => {
    if (!next) {
      setPicked('');
      setPurpose('');
      setOther('');
    }
    onOpenChange(next);
  };

  const text = purposeText(purpose, other);
  const needsOther = purpose === 'other' && !other.trim();
  const url = (extra: Record<string, string> = {}) =>
    `/api/visits/${visitId}/print/medical-certificate?${new URLSearchParams({ ...(text ? { purpose: text } : {}), ...extra })}`;
  const ready = !!visitId && !needsOther;

  return (
    <Modal open={open} onOpenChange={change} className="max-w-lg" labelledBy={`${ids}-title`}>
      <div className="p-6">
        <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
          Medical certificate
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">For {patientName}. It certifies one visit and prints what that visit says.</p>

        {eligible.length === 0 ? (
          <p className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
            No visits to certify yet. A certificate is issued for a visit that has been written up; drafts and cancelled visits don&rsquo;t count.
          </p>
        ) : (
          <>
            <fieldset className="mt-5">
              <legend className="text-xs font-semibold text-gray-700">Visit</legend>
              <div className="mt-1.5 max-h-60 space-y-1.5 overflow-y-auto">
                {eligible.map((v) => {
                  const dx = v.diagnoses?.find((d) => d.primary) ?? v.diagnoses?.[0];
                  const selected = v._id === visitId;
                  return (
                    <label
                      key={v._id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${selected ? 'border-brand-teal-dark bg-brand-teal-light/40' : 'border-gray-200 hover:border-gray-400'}`}
                    >
                      <input type="radio" name={`${ids}-visit`} value={v._id} checked={selected} onChange={() => setPicked(v._id)} className="mt-1" />
                      <span className="min-w-0">
                        <span className="font-semibold text-gray-900">
                          {visitDate(v.date)} · {visitTypeLabel(v.visitType)}
                        </span>
                        <span className="ml-2 font-mono text-xs text-gray-500">{v.visitCode}</span>
                        <span className="block truncate text-gray-600">
                          {dx ? [dx.code, dx.description].filter(Boolean).join(' ') : 'No diagnosis recorded'}
                          {v.provider?.name && <span className="text-gray-500"> · {v.provider.name}</span>}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${ids}-purpose`} className="text-xs font-semibold text-gray-700">
                  Requested for (optional)
                </label>
                <select id={`${ids}-purpose`} value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`${FIELD} mt-1`}>
                  <option value="">Not stated</option>
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {PURPOSE_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              {purpose === 'other' && (
                <div>
                  <label htmlFor={`${ids}-other`} className="text-xs font-semibold text-gray-700">
                    What for
                  </label>
                  <input id={`${ids}-other`} maxLength={120} value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. barangay clearance" className={`${FIELD} mt-1`} />
                </div>
              )}
            </div>
            {text && <p className="mt-2 text-xs text-gray-600">Adds: &ldquo;issued upon the request of the patient for {text} purposes.&rdquo;</p>}

            <p className="mt-4 text-sm text-gray-700">
              Rest days or work restrictions come from the visit&rsquo;s follow-up instructions.{' '}
              {visitId && (
                <Link href={`/visits/${visitId}`} target="_blank" className={LINK}>
                  Open the visit to add them
                </Link>
              )}
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => change(false)} className={SECONDARY}>
            Close
          </button>
          {ready && (
            <>
              <a href={url({ format: 'pdf', download: '1' })} className={SECONDARY}>
                Download PDF
              </a>
              <a href={url()} target="_blank" rel="noopener" className={PRIMARY}>
                Print certificate
              </a>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
