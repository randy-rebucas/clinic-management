import 'server-only';
import type { IssuedSeal } from '@/lib/document-seal';
import { escapeHtml as e, protectionHead, sealedDocumentParts, watermarkOverlay } from '@/lib/document-protection';
import { RECORDS_SECTION_LIMIT, type MedicalRecords } from '@/lib/medical-records';
import { PURPOSE_LABELS } from '@/lib/document-requests';
import type { DocumentRequestPurpose } from '@/models/DocumentRequest';

/**
 * The copy of a patient's medical records a clinic releases on request (staff preview:
 * GET /api/document-requests/:id/preview; patient: GET /api/requested-documents/:token).
 * Self-contained HTML for lib/pdf.ts. Without a seal it renders as an unreleased draft.
 */

type Allergy = string | { substance?: string; reaction?: string; severity?: string };

const VISIT_TYPES: Record<string, string> = {
  consultation: 'Consultation',
  'follow-up': 'Follow-up',
  checkup: 'Check-up',
  emergency: 'Emergency',
  teleconsult: 'Teleconsult',
  vaccination: 'Vaccination',
};

const EXAM_LABELS: [string, string][] = [
  ['general', 'General'],
  ['heent', 'HEENT'],
  ['headEent', 'HEENT'],
  ['chest', 'Chest'],
  ['lungs', 'Lungs'],
  ['cardiovascular', 'Cardiovascular'],
  ['abdomen', 'Abdomen'],
  ['breast', 'Breast'],
  ['genitalia', 'Genitalia'],
  ['rectum', 'Rectum'],
  ['musculoskeletal', 'Musculoskeletal'],
  ['extremities', 'Extremities'],
  ['neurological', 'Neurological'],
  ['neuro', 'Neurological'],
  ['skin', 'Skin'],
  ['lymphNotes', 'Lymph nodes'],
  ['other', 'Other'],
];

export type MedicalRecordsDocumentInput = {
  request: {
    requestCode: string;
    purpose: string;
    periodFrom?: string | null;
    periodTo?: string | null;
    cutoff?: Date | null;
    releasedByName?: string | null;
  };
  records: MedicalRecords;
  settings: any;
  tz: string;
  seal: IssuedSeal | null;
};

const text = (v: unknown) => (v === undefined || v === null || v === '' ? '' : e(v).replace(/\n/g, '<br>'));

export function medicalRecordsHtml({ request, records, settings, tz, seal }: MedicalRecordsDocumentInput): string {
  const clinicName = settings?.clinicName || 'Clinic';
  const p = records.patient;
  const fullName = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const date = (v: unknown) =>
    v ? new Date(v as string).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const ymd = (v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  const born = p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const releasedOn = request.cutoff
    ? new Date(request.cutoff).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const period = `${request.periodFrom ? ymd(request.periodFrom) : 'First record'} to ${request.periodTo ? ymd(request.periodTo) : releasedOn ?? 'latest record'}`;

  const protection = seal
    ? sealedDocumentParts({ seal, clinicName, documentLabel: 'Medical Records Copy', documentCode: request.requestCode })
    : {
        head: protectionHead(),
        watermark: watermarkOverlay([`PREVIEW · NOT THE PATIENT COPY · ${clinicName}`, request.requestCode, 'For clinic staff only'], { warning: true }),
        banner: request.cutoff
          ? '<div class="draft">Clinic preview of what the patient downloads. Their copy carries a verifiable seal.</div>'
          : '<div class="draft">Preview: not released to the patient yet. A copy released now would contain exactly this.</div>',
        seal: '',
      };

  const allergies = ((p.allergies || []) as Allergy[])
    .map((a) => (typeof a === 'string' ? a : [a.substance, a.reaction ? `(${a.reaction})` : '', a.severity ? `– ${a.severity}` : ''].filter(Boolean).join(' ')))
    .filter((a) => a && a.trim());
  const conditions = (p.preExistingConditions || []).filter((c: any) => c?.condition);
  const immunizations = (p.immunizations || []).filter((i: any) => i?.name);

  const vitalsLine = (v: any) =>
    v
      ? [
          v.bp && `BP ${v.bp}`,
          v.hr && `HR ${v.hr}`,
          v.rr && `RR ${v.rr}`,
          v.tempC && `Temp ${v.tempC}°C`,
          v.spo2 && `SpO₂ ${v.spo2}%`,
          v.weightKg && `Wt ${v.weightKg} kg`,
          v.heightCm && `Ht ${v.heightCm} cm`,
          v.bmi && `BMI ${v.bmi}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  const row = (label: string, value: string) => (value ? `<tr><th>${e(label)}</th><td>${value}</td></tr>` : '');

  const visitBlock = (v: any) => {
    const seen = new Set<string>();
    const exam = EXAM_LABELS.filter(([key, label]) => {
      if (!v.physicalExam?.[key] || seen.has(label)) return false;
      seen.add(label);
      return true;
    })
      .map(([key, label]) => `${e(label)}: ${text(v.physicalExam[key])}`)
      .join('<br>');
    const diagnoses = (v.diagnoses || [])
      .filter((d: any) => d?.description || d?.code)
      .map((d: any) => `${d.code ? `<span class="code">${e(d.code)}</span> ` : ''}${e(d.description || '')}${d.primary ? ' <span class="sub">(primary)</span>' : ''}`)
      .join('<br>');
    const assessment = v.soapNotes?.assessment || v.assessment;
    const plan = v.soapNotes?.plan || v.plan;
    const followUp = v.treatmentPlan?.followUp?.instructions;
    return `<article class="visit">
      <h3>${e(date(v.date))} · ${e(VISIT_TYPES[v.visitType] || 'Visit')} <span class="sub">${e(v.visitCode)}${v.provider?.name ? ` · ${e(v.provider.name)}` : ''}</span></h3>
      <table class="kv">
        ${row('Chief complaint', text(v.chiefComplaint))}
        ${row('History', text(v.historyOfPresentIllness || v.soapNotes?.subjective))}
        ${row('Vital signs', e(vitalsLine(v.vitals)))}
        ${row('Physical exam', exam || text(v.soapNotes?.objective))}
        ${row('Diagnosis', diagnoses)}
        ${row('Assessment', text(assessment))}
        ${row('Plan', text(plan))}
        ${row('Follow-up', [text(followUp), v.followUpDate ? e(date(v.followUpDate)) : ''].filter(Boolean).join(' · '))}
      </table>
    </article>`;
  };

  const rxRows = records.prescriptions
    .map((rx) =>
      (rx.medications || [])
        .map(
          (m: any, i: number) => `<tr>
            ${i === 0 ? `<td rowspan="${rx.medications.length}">${e(date(rx.issuedAt))}<div class="sub">${e(rx.prescriptionCode)}</div></td>` : ''}
            <td><strong>${e(m.name)}</strong>${m.genericName && m.genericName !== m.name ? `<div class="sub">${e(m.genericName)}</div>` : ''}</td>
            <td>${e([m.strength, m.form, m.dose && m.dose !== m.strength ? m.dose : null, m.route, m.frequency, m.durationDays ? `${m.durationDays} days` : null].filter(Boolean).join(' · ') || '—')}${m.instructions ? `<div class="sub">${e(m.instructions)}</div>` : ''}</td>
            ${i === 0 ? `<td rowspan="${rx.medications.length}">${e(rx.prescribedBy?.name || '—')}</td>` : ''}
          </tr>`
        )
        .join('')
    )
    .join('');

  const labValues = (l: any) => {
    const results = l.results && typeof l.results === 'object' ? Object.entries(l.results) : [];
    if (!results.length) return '<span class="sub">No result values recorded.</span>';
    return results
      .map(([k, v]) => {
        const flag = l.abnormalFlags?.[k];
        const range = l.referenceRanges?.[k];
        return `<div>${e(k)}: <strong>${e(typeof v === 'object' ? JSON.stringify(v) : v)}</strong>${range ? ` <span class="sub">(${e(range)})</span>` : ''}${flag && flag !== 'normal' ? ` <span class="flag">${e(String(flag).toUpperCase())}</span>` : ''}</div>`;
      })
      .join('');
  };
  const labRows = records.labResults
    .map(
      (l) => `<tr>
        <td>${e(date(l.orderDate))}${l.requestCode ? `<div class="sub">${e(l.requestCode)}</div>` : ''}</td>
        <td><strong>${e(l.request?.testType || 'Laboratory test')}</strong>${l.request?.description ? `<div class="sub">${e(l.request.description)}</div>` : ''}</td>
        <td>${l.status === 'completed' || l.status === 'reviewed' ? labValues(l) : `<span class="sub">${e(String(l.status || '').replace(/-/g, ' '))}</span>`}${l.interpretation ? `<div class="sub">${text(l.interpretation)}</div>` : ''}</td>
        <td>${e(date(l.resultDate))}</td>
      </tr>`
    )
    .join('');

  const empty = (t: string) => `<p class="empty">${e(t)}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Medical records - ${e(request.requestCode)}</title>
${protection.head}
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; font-size: 12px; line-height: 1.45; margin: 0 auto; max-width: 800px; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; border-bottom: 2px solid #0A7F7E; padding-bottom: 10px; margin-bottom: 14px; }
  header .clinic { font-size: 16px; font-weight: bold; }
  header .contact { color: #52606d; font-size: 11px; }
  header .code { text-align: right; font-size: 11px; color: #52606d; }
  header .code strong { font-family: ui-monospace, monospace; color: #1f2933; font-size: 13px; }
  h1 { font-size: 20px; letter-spacing: .04em; margin: 0 0 10px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #0A7F7E; border-bottom: 1px solid #d9e2ec; padding-bottom: 4px; margin: 18px 0 8px; break-after: avoid; page-break-after: avoid; }
  h2.alert { color: #b42318; }
  h3 { font-size: 13px; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #52606d; border-bottom: 1px solid #bcccdc; padding: 4px 6px; }
  td { border-bottom: 1px solid #e4e7eb; padding: 5px 6px; vertical-align: top; }
  table.kv th { width: 120px; border: none; text-transform: none; letter-spacing: 0; font-size: 11px; padding: 2px 8px 2px 0; vertical-align: top; }
  table.kv td { border: none; padding: 2px 0; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-bottom: 8px; }
  .facts div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #7b8794; }
  .facts div strong { font-size: 13px; }
  .visit { border: 1px solid #e4e7eb; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; page-break-inside: avoid; }
  .sub { color: #616e7c; font-size: 11px; font-weight: normal; }
  .code { font-family: ui-monospace, monospace; }
  .flag { color: #b42318; font-weight: bold; font-size: 10px; }
  .allergy { color: #b42318; font-weight: bold; }
  .empty { color: #616e7c; font-style: italic; margin: 4px 0; }
  .draft { border: 1px solid #b45309; background: #fffbeb; color: #92400e; padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; font-weight: bold; }
  .note { border: 1px solid #d9e2ec; background: #f5f7fa; padding: 6px 10px; border-radius: 4px; margin: 10px 0; }
  .certify { margin-top: 24px; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d9e2ec; font-size: 10px; color: #7b8794; }
</style>
</head>
<body>
  ${protection.watermark}
  ${protection.banner}

  <header>
    <div>
      <div class="clinic">${e(clinicName)}</div>
      <div class="contact">${[settings?.clinicAddress, settings?.clinicPhone, settings?.clinicEmail].filter(Boolean).map(e).join(' · ')}</div>
    </div>
    <div class="code">Request <strong>${e(request.requestCode)}</strong>${releasedOn ? `<br>Released ${e(releasedOn)}` : ''}</div>
  </header>

  <h1>MEDICAL RECORDS</h1>

  <section class="facts">
    <div><span>Patient</span><strong>${e(fullName)}</strong></div>
    ${p.patientCode ? `<div><span>Patient ID</span><strong>${e(p.patientCode)}</strong></div>` : ''}
    <div><span>Date of birth</span><strong>${e(born)}</strong></div>
    <div><span>Sex</span><strong>${e(p.sex ? p.sex[0].toUpperCase() + p.sex.slice(1) : '—')}</strong></div>
  </section>
  <section class="facts">
    <div><span>Period covered</span><strong>${e(period)}</strong></div>
    <div><span>Requested for</span><strong>${e(PURPOSE_LABELS[request.purpose as DocumentRequestPurpose] ?? request.purpose)}</strong></div>
  </section>
  ${records.truncated ? `<p class="note">This copy lists the first ${RECORDS_SECTION_LIMIT} entries of each section. Ask the clinic for the rest, or request a shorter period.</p>` : ''}

  <h2 class="${allergies.length ? 'alert' : ''}">Allergies</h2>
  ${allergies.length ? `<p class="allergy">${allergies.map(e).join('; ')}</p>` : empty('No known allergies on file.')}

  <h2>Medical history</h2>
  ${
    conditions.length
      ? `<table><thead><tr><th>Condition</th><th>Status</th><th>Diagnosed</th></tr></thead><tbody>${conditions
          .map((c: any) => `<tr><td><strong>${e(c.condition)}</strong>${c.notes ? `<div class="sub">${text(c.notes)}</div>` : ''}</td><td>${e(c.status || '—')}</td><td>${e(date(c.diagnosisDate))}</td></tr>`)
          .join('')}</tbody></table>`
      : empty('No conditions on file.')
  }

  <h2>Consultations (${records.visits.length})</h2>
  ${records.visits.length ? records.visits.map(visitBlock).join('') : empty('No consultations in this period.')}

  <h2>Prescriptions (${records.prescriptions.length})</h2>
  ${
    rxRows
      ? `<table><thead><tr><th>Date</th><th>Medicine</th><th>Dose and instructions</th><th>Prescriber</th></tr></thead><tbody>${rxRows}</tbody></table>`
      : empty('No prescriptions in this period.')
  }

  <h2>Laboratory results (${records.labResults.length})</h2>
  ${
    labRows
      ? `<table><thead><tr><th>Ordered</th><th>Test</th><th>Result</th><th>Resulted</th></tr></thead><tbody>${labRows}</tbody></table>`
      : empty('No laboratory tests in this period.')
  }

  <h2>Vaccinations</h2>
  ${
    immunizations.length
      ? `<table><thead><tr><th>Vaccine</th><th>Date</th><th>Batch</th></tr></thead><tbody>${immunizations
          .map((i: any) => `<tr><td><strong>${e(i.name)}</strong>${i.notes ? `<div class="sub">${text(i.notes)}</div>` : ''}</td><td>${e(date(i.date))}</td><td>${e(i.batch || '—')}</td></tr>`)
          .join('')}</tbody></table>`
      : empty('No vaccinations on file.')
  }

  ${
    seal
      ? `<p class="certify">This is a true copy of the records of the patient named above held by ${e(clinicName)}, for the period stated, released${
          request.releasedByName ? ` by ${e(request.releasedByName)}` : ''
        } on ${e(releasedOn ?? '')} at the patient&rsquo;s request.</p>`
      : ''
  }

  ${protection.seal}

  <footer>
    Medical records ${e(request.requestCode)} from ${e(clinicName)}. Confidential: released to the patient under the Data Privacy Act of 2012.
    ${seal ? 'Check the serial above to confirm this copy is genuine and has not been withdrawn.' : ''}
  </footer>
</body>
</html>`;
}
