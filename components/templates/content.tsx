import type { ClinicalTemplateDTO, TemplateMedication } from '@/lib/clinical-templates';

/** "Amoxicillin 500 mg capsule" */
export function medName(m: TemplateMedication): string {
  return [m.name, m.strength, m.form].filter(Boolean).join(' ');
}

/** "1 capsule · 3 times a day · 7 days" */
export function medDirections(m: TemplateMedication): string {
  return [m.dosage, m.route, m.frequency, m.duration].filter(Boolean).join(' · ');
}

/** One line saying what applying the template brings in. */
export function templateSummary(t: ClinicalTemplateDTO): string {
  if (t.kind === 'phrase') return t.text ?? '';
  const meds = t.medications ?? [];
  if (t.kind === 'prescription') return meds.map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' ')).join(' · ');
  const dx = (t.visit?.diagnoses ?? []).map((d) => [d.code, d.description].filter(Boolean).join(' ')).join('; ');
  return [t.visit?.chiefComplaint, dx, meds.length ? `${meds.length} medicine${meds.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

const DAY = 86_400_000;

/** "Used 12 times · last 3 days ago", "Not used yet" */
export function usageLabel(t: ClinicalTemplateDTO, now = Date.now()): string {
  if (!t.usageCount) return 'Not used yet';
  const times = `Used ${t.usageCount} ${t.usageCount === 1 ? 'time' : 'times'}`;
  if (!t.lastUsedAt) return times;
  const then = new Date(t.lastUsedAt);
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / DAY);
  const when =
    days <= 0
      ? 'last today'
      : days === 1
        ? 'last yesterday'
        : days < 60
          ? `last ${days} days ago`
          : `last on ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return `${times} · ${when}`;
}

const SOAP: { key: 'subjective' | 'objective' | 'assessment' | 'plan'; label: string }[] = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="min-w-0 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function MedicineList({ medications }: { medications: TemplateMedication[] }) {
  return (
    <ol className="divide-y divide-gray-100">
      {medications.map((m, i) => (
        <li key={`${m.name}-${i}`} className="flex gap-3 py-2 first:pt-0 last:pb-0">
          <span className="w-4 shrink-0 font-mono text-xs tabular-nums leading-5 text-gray-500">{i + 1}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-gray-900">{medName(m)}</span>
            {medDirections(m) && <span className="block text-gray-900">{medDirections(m)}</span>}
            {m.instructions && <span className="block text-gray-600">{m.instructions}</span>}
            {m.quantity ? <span className="block font-mono text-xs tabular-nums text-gray-500">Qty {m.quantity}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Everything a template holds, read-only, in the order a note is written. */
export function TemplateContent({ t }: { t: ClinicalTemplateDTO }) {
  if (t.kind === 'phrase') {
    return <p className="whitespace-pre-wrap text-sm text-gray-900">{t.text}</p>;
  }
  const meds = t.medications ?? [];
  if (t.kind === 'prescription') {
    return meds.length ? <div className="text-sm"><MedicineList medications={meds} /></div> : <p className="text-sm text-gray-500">No medicines.</p>;
  }
  const v = t.visit ?? {};
  const exam = Object.entries(v.physicalExam ?? {}).filter(([, text]) => text?.trim());
  const dx = v.diagnoses ?? [];
  const text = (s?: string) => <span className="whitespace-pre-wrap">{s}</span>;
  return (
    <dl className="divide-y divide-gray-100">
      {v.chiefComplaint && <Row label="Chief complaint">{text(v.chiefComplaint)}</Row>}
      {v.historyOfPresentIllness && <Row label="History">{text(v.historyOfPresentIllness)}</Row>}
      {SOAP.map(({ key, label }) => v.soapNotes?.[key] && <Row key={key} label={label}>{text(v.soapNotes[key])}</Row>)}
      {exam.length > 0 && (
        <Row label="Physical exam">
          <ul className="space-y-0.5">
            {exam.map(([part, finding]) => (
              <li key={part}>
                <span className="text-gray-600">{part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())}:</span> {finding}
              </li>
            ))}
          </ul>
        </Row>
      )}
      {dx.length > 0 && (
        <Row label="Diagnoses">
          <ul className="space-y-0.5">
            {dx.map((d, i) => (
              <li key={`${d.code}-${i}`} className="flex items-baseline gap-2">
                {d.code && <span className="font-mono text-xs font-semibold tabular-nums text-gray-900">{d.code}</span>}
                <span>{d.description}</span>
                {d.primary && dx.length > 1 && <span className="text-xs text-gray-500">main</span>}
              </li>
            ))}
          </ul>
        </Row>
      )}
      {meds.length > 0 && (
        <Row label="Medicines">
          <MedicineList medications={meds} />
        </Row>
      )}
      {v.followUpInstructions && <Row label="Follow-up advice">{text(v.followUpInstructions)}</Row>}
    </dl>
  );
}
