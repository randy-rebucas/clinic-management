import { escapeHtml as e } from '@/lib/document-protection';
import type { HealthSummary, SummaryMedication } from '@/lib/patient-health-summary';

/**
 * The printable health summary a patient downloads from eMCR and hands to a new clinic.
 * Self-contained HTML (no external assets) for lib/pdf.ts.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const STAMP_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
});

function day(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

function age(dateOfBirth: string | null, now: Date): string {
  if (!dateOfBirth) return '';
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) years--;
  return years >= 0 ? ` (${years} yrs)` : '';
}

function empty(text: string): string {
  return `<p class="empty">${e(text)}</p>`;
}

function medicationRows(meds: SummaryMedication[], showEnd: boolean): string {
  return meds
    .map((m) => {
      const detail = [m.strength, m.dose && m.dose !== m.strength ? m.dose : null, m.frequency, m.route].filter(Boolean).join(' · ');
      return `<tr>
        <td><strong>${e(m.name)}</strong>${m.genericName && m.genericName !== m.name ? `<div class="sub">${e(m.genericName)}</div>` : ''}
          ${m.instructions ? `<div class="sub">${e(m.instructions)}</div>` : ''}</td>
        <td>${e(detail || '—')}</td>
        <td>${e(day(m.issuedAt))}${showEnd && m.endsAt ? `<div class="sub">until ${e(day(m.endsAt))}</div>` : ''}</td>
        <td>${e(m.clinic ?? '—')}${m.prescriber ? `<div class="sub">${e(m.prescriber)}</div>` : ''}</td>
      </tr>`;
    })
    .join('');
}

function medicationTable(meds: SummaryMedication[], showEnd: boolean): string {
  return `<table>
    <thead><tr><th>Medicine</th><th>Dose</th><th>Prescribed</th><th>Clinic</th></tr></thead>
    <tbody>${medicationRows(meds, showEnd)}</tbody>
  </table>`;
}

export function generateHealthSummaryHTML(summary: HealthSummary): string {
  const now = new Date(summary.generatedAt);
  const p = summary.patient;
  const fullName = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const sex = p.sex ? p.sex[0].toUpperCase() + p.sex.slice(1) : '—';

  const allergies = summary.allergies.length
    ? `<table>
        <thead><tr><th>Allergy</th><th>Reaction</th><th>Severity</th><th>Recorded by</th></tr></thead>
        <tbody>${summary.allergies
          .map(
            (a) => `<tr><td><strong>${e(a.substance)}</strong></td><td>${e(a.reaction ?? '—')}</td><td>${e(a.severity ?? '—')}</td><td>${e(a.clinics.join(', ') || '—')}</td></tr>`
          )
          .join('')}</tbody>
      </table>`
    : empty('No known allergies recorded.');

  const conditions = summary.conditions.length
    ? `<table>
        <thead><tr><th>Condition</th><th>Status</th><th>Diagnosed</th><th>Recorded by</th></tr></thead>
        <tbody>${summary.conditions
          .map(
            (c) => `<tr><td><strong>${e(c.condition)}</strong>${c.notes ? `<div class="sub">${e(c.notes)}</div>` : ''}</td>
              <td>${e(c.status)}</td><td>${e(day(c.diagnosisDate))}</td><td>${e(c.clinics.join(', ') || '—')}</td></tr>`
          )
          .join('')}</tbody>
      </table>`
    : empty('No conditions recorded.');

  const immunizations = summary.immunizations.length
    ? `<table>
        <thead><tr><th>Vaccine</th><th>Date</th><th>Batch</th><th>Clinic</th></tr></thead>
        <tbody>${summary.immunizations
          .map(
            (i) => `<tr><td><strong>${e(i.name)}</strong>${i.notes ? `<div class="sub">${e(i.notes)}</div>` : ''}</td>
              <td>${e(day(i.date))}</td><td>${e(i.batch ?? '—')}</td><td>${e(i.clinic ?? '—')}</td></tr>`
          )
          .join('')}</tbody>
      </table>`
    : empty('No vaccinations recorded.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Health summary — ${e(fullName)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; font-size: 12px; line-height: 1.45; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 14px; }
  header h1 { font-size: 20px; margin: 0; color: #0f766e; }
  header .brand { font-size: 11px; color: #52606d; text-align: right; }
  .person { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-bottom: 12px; }
  .person div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #7b8794; }
  .person div strong { font-size: 13px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #0f766e; border-bottom: 1px solid #d9e2ec; padding-bottom: 4px; margin: 18px 0 8px; }
  h2.alert { color: #b42318; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #52606d; border-bottom: 1px solid #bcccdc; padding: 4px 6px; }
  td { border-bottom: 1px solid #e4e7eb; padding: 5px 6px; vertical-align: top; }
  .sub { color: #616e7c; font-size: 11px; }
  .empty { color: #616e7c; font-style: italic; margin: 4px 0; }
  .clinics { color: #3e4c59; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d9e2ec; font-size: 10px; color: #7b8794; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Health summary</h1>
      <div class="sub">Generated ${e(STAMP_FORMAT.format(now))}</div>
    </div>
    <div class="brand">eMCR · Electronic MyClinic Record</div>
  </header>

  <section class="person">
    <div><span>Patient</span><strong>${e(fullName)}</strong></div>
    <div><span>Date of birth</span><strong>${e(day(p.dateOfBirth))}${e(age(p.dateOfBirth, now))}</strong></div>
    <div><span>Sex</span><strong>${e(sex)}</strong></div>
  </section>
  ${
    summary.clinics.length
      ? `<p class="clinics"><strong>Clinics:</strong> ${summary.clinics
          .map((c) => `${e(c.name)}${c.patientCode ? ` (${e(c.patientCode)})` : ''}`)
          .join(' · ')}</p>`
      : ''
  }

  <h2 class="${summary.allergies.length ? 'alert' : ''}">Allergies</h2>
  ${allergies}

  <h2>Current medicines</h2>
  ${summary.medications.current.length ? medicationTable(summary.medications.current, true) : empty('No current medicines.')}

  <h2>Conditions</h2>
  ${conditions}

  <h2>Vaccinations</h2>
  ${immunizations}

  ${
    summary.medications.recent.length
      ? `<h2>Other medicines in the last 12 months</h2>${medicationTable(summary.medications.recent, false)}`
      : ''
  }

  <footer>
    Compiled from the records of the clinics listed above, as recorded by each clinic. It is a summary for
    continuity of care, not a prescription or medical certificate. Confirm current medicines and allergies with the patient.
  </footer>
</body>
</html>`;
}
