'use client';

import type { ReactNode } from 'react';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from '../../appointments/shared';
import { vitalsSummary, type Vitals } from '../../queue/VitalsModal';

type Allergy = string | { substance?: string; reaction?: string; severity?: string };

export interface ClinicalSummary {
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    dateOfBirth?: string;
    sex?: string;
    phone?: string;
    allergies?: Allergy[];
    preExistingConditions?: { condition: string; status?: string }[];
  };
  visits: { _id: string; visitCode: string; date: string; chiefComplaint?: string; diagnoses?: { code?: string; description?: string; primary?: boolean }[]; vitals?: Vitals | null }[];
  prescriptions: { _id: string; prescriptionCode: string; issuedAt: string; status: string; medications?: { name: string; dose?: string; frequency?: string }[] }[] | null;
  labs: { _id: string; requestCode?: string; orderDate: string; status: string; request?: { testType?: string } }[] | null;
}

const EXTERNAL = 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14';

export function ageFrom(dob?: string) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years--;
  if (years >= 2) return `${years} yrs`;
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() - (now.getDate() < d.getDate() ? 1 : 0);
  return `${Math.max(0, months)} mo`;
}

export function allergyList(allergies?: Allergy[]) {
  return (allergies ?? [])
    .map((a) => (typeof a === 'string' ? { substance: a, reaction: '', severity: '' } : { substance: a.substance ?? '', reaction: a.reaction ?? '', severity: a.severity ?? '' }))
    .filter((a) => a.substance.trim() !== '');
}

const isSevere = (s: string) => ['severe', 'high', 'life-threatening', 'anaphylaxis'].includes(s.toLowerCase());
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The patient beside the note: allergies first (they matter when prescribing), then what they
 * live with, the medicines they are on, labs still out, and their last visits. Links open in a
 * new tab so the note being written is never lost.
 */
export function usePatientSummary(patientId: string | null, excludeVisit?: string) {
  const url = patientId ? `/api/patients/${patientId}/clinical-summary${excludeVisit ? `?excludeVisit=${excludeVisit}` : ''}` : null;
  const summary = useKeyedFetch<ClinicalSummary>(url);
  return { data: url && summary.valueUrl === url ? summary.value : null, error: summary.error, reload: summary.reload };
}

export default function PatientSummary({ summary }: { summary: ReturnType<typeof usePatientSummary> }) {
  const { data } = summary;

  if (summary.error && !data) {
    return (
      <Frame>
        <div className="flex items-start justify-between gap-3 px-5 py-4 text-sm">
          <p className="text-gray-600">The patient summary didn’t load.</p>
          <button type="button" onClick={summary.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICON.refresh} />
            Try again
          </button>
        </div>
      </Frame>
    );
  }

  if (!data) {
    return (
      <Frame>
        <div className="animate-pulse space-y-3 px-5 py-4" aria-hidden="true">
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="h-4 w-1/2 rounded bg-gray-100" />
          <div className="h-16 rounded bg-gray-50" />
        </div>
      </Frame>
    );
  }

  const p = data.patient;
  const allergies = allergyList(p.allergies);
  const conditions = (p.preExistingConditions ?? []).filter((c) => c.condition && c.status !== 'resolved');
  const age = ageFrom(p.dateOfBirth);
  const meds = (data.prescriptions ?? []).flatMap((rx) => (rx.medications ?? []).map((m) => ({ ...m, rx })));
  const labs = data.labs ?? [];

  return (
    <Frame>
      <div className="border-b border-gray-200 px-5 py-4">
        <p className="font-semibold text-gray-900">
          {p.firstName} {p.lastName}
        </p>
        <p className="mt-0.5 text-sm text-gray-500">
          {[age, p.sex ? p.sex.charAt(0).toUpperCase() + p.sex.slice(1) : null].filter(Boolean).join(' · ') || 'Age and sex not on file'}
          {p.patientCode && <span className="font-mono text-xs"> · {p.patientCode}</span>}
        </p>
      </div>

      <Group title="Allergies">
        {allergies.length === 0 ? (
          <p className="text-sm text-gray-500">None on file. Ask before prescribing.</p>
        ) : (
          <ul className="space-y-1">
            {allergies.map((a, i) => {
              const severe = isSevere(a.severity);
              return (
                <li key={i} className="text-sm">
                  <span className={`font-semibold ${severe ? 'text-red-700' : 'text-gray-900'}`}>{a.substance}</span>
                  {(a.reaction || a.severity) && (
                    <span className={severe ? 'text-red-700' : 'text-gray-600'}>
                      {' '}
                      · {[a.reaction, a.severity && `${a.severity.toLowerCase()}`].filter(Boolean).join(', ')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Group>

      {conditions.length > 0 && (
        <Group title="Conditions">
          <ul className="space-y-1 text-sm text-gray-700">
            {conditions.map((c, i) => (
              <li key={i}>
                {c.condition}
                {c.status === 'chronic' && <span className="text-gray-500"> · chronic</span>}
              </li>
            ))}
          </ul>
        </Group>
      )}

      {data.prescriptions !== null && (
        <Group title="Current medicines">
          {meds.length === 0 ? (
            <p className="text-sm text-gray-500">No prescription waiting or in progress.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {meds.slice(0, 8).map((m, i) => (
                <li key={i}>
                  <span className="text-gray-900">{m.name}</span>
                  {(m.dose || m.frequency) && <span className="text-gray-500"> · {[m.dose, m.frequency].filter(Boolean).join(' ')}</span>}
                  <span className="block font-mono text-xs text-gray-500">
                    {m.rx.prescriptionCode} · {shortDate(m.rx.issuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Group>
      )}

      {data.labs !== null && labs.length > 0 && (
        <Group title="Labs still out">
          <ul className="space-y-1 text-sm">
            {labs.map((l) => (
              <li key={l._id} className="flex items-baseline justify-between gap-3">
                <span className="text-gray-900">{l.request?.testType || 'Lab test'}</span>
                <span className="shrink-0 text-xs text-gray-500">{l.status === 'completed' ? 'Result in' : `Ordered ${shortDate(l.orderDate)}`}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Last visits" last>
        {data.visits.length === 0 ? (
          <p className="text-sm text-gray-500">First visit on file.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {data.visits.map((v) => {
              const dx = v.diagnoses?.find((d) => d.primary) ?? v.diagnoses?.[0];
              const vitals = vitalsSummary(v.vitals);
              return (
                <li key={v._id}>
                  <a
                    href={`/visits/${v._id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded px-2 py-1.5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-900">{shortDate(v.date)}</span>
                      <span className="text-gray-400 group-hover:text-gray-700" aria-hidden="true">
                        <Svg d={EXTERNAL} className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-700">
                      {dx ? (
                        <>
                          {dx.code && <span className="mr-1 font-mono text-xs font-semibold text-gray-900">{dx.code}</span>}
                          {dx.description}
                        </>
                      ) : (
                        v.chiefComplaint || <span className="text-gray-400">No diagnosis recorded</span>
                      )}
                    </span>
                    {vitals && <span className="mt-0.5 block font-mono text-xs text-gray-500">{vitals}</span>}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Group>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section className="motion-panel-in rounded-lg border border-gray-200 bg-white" aria-labelledby="visit-form-patient">
      <h2 id="visit-form-patient" className="sr-only">
        Patient summary
      </h2>
      {children}
    </section>
  );
}

function Group({ title, last, children }: { title: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={`px-5 py-3.5 ${last ? '' : 'border-b border-gray-100'}`}>
      <h3 className="mb-1.5 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}
