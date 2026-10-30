import 'server-only';
import '@/models/Specialization';
import type { IssuedSeal } from '@/lib/document-seal';
import { directionOf } from '@/lib/referrals';
import { escapeHtml as e, sealedDocumentParts } from '@/lib/document-protection';

/**
 * The referral letter the patient carries to the receiving doctor (staff print:
 * GET /api/referrals/:id/letter; patient app: GET /api/referral-letter/:token). Shared so both
 * render the same sealed document.
 */

type Allergy = string | { substance?: string; reaction?: string; severity?: string };

/** The populates the letter reads. Each is matched to the referral's clinic. */
export function populateReferralForLetter<T>(query: T, tenantId: unknown): T {
  return (query as any)
    .populate({ path: 'patient', select: 'firstName lastName patientCode phone dateOfBirth sex allergies', match: { tenantIds: tenantId } })
    .populate({ path: 'referringDoctor', select: 'firstName lastName title licenseNumber ptrNumber ptr specializationId', populate: { path: 'specializationId', select: 'name' }, match: { tenantId } })
    .populate({ path: 'receivingDoctor', select: 'firstName lastName title specializationId', populate: { path: 'specializationId', select: 'name' }, match: { tenantId } });
}

/**
 * Why this referral has no letter, or null when it has one. Only referrals the clinic sends have
 * a letter, and not once cancelled or declined.
 */
export function referralLetterUnavailable(r: {
  type?: string;
  status?: string;
  referringDoctor?: unknown;
  receivingClinic?: string | null;
  referringClinic?: string | null;
  referringContact?: { name?: string | null } | null;
}): string | null {
  const direction = directionOf(r);
  if (direction !== 'internal' && direction !== 'out') return 'Only referrals this clinic sends have a referral letter.';
  if (r.status === 'cancelled' || r.status === 'declined') return `A ${r.status} referral can’t be printed.`;
  return null;
}

function doctorLine(d: any) {
  if (!d) return '';
  return `${d.title ? `${d.title} ` : 'Dr. '}${d.firstName} ${d.lastName}`.trim();
}

function age(dob?: Date) {
  if (!dob) return '';
  const d = new Date(dob);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return years >= 0 ? `${years} yrs` : '';
}

/** The sealed letter as HTML (rendered to PDF by lib/pdf). `r` is populated as by `populateReferralForLetter`. */
export function referralLetterHtml(r: any, settings: any, seal: IssuedSeal, tz: string, signatureSrc: string | null): string {
  const patient = r.patient || {};
  const from = r.referringDoctor;
  const to = r.receivingDoctor;
  const clinicName = settings?.clinicName || 'Clinic';
  const date = (v: Date) => new Date(v).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' });
  const born = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const allergies = ((patient.allergies || []) as Allergy[])
    .map((a) => (typeof a === 'string' ? a : [a.substance, a.reaction ? `(${a.reaction})` : '', a.severity ? `– ${a.severity}` : ''].filter(Boolean).join(' ')))
    .filter((a) => a && a.trim());
  const meds: string[] = (r.medications || []).filter((m: string) => m && m.trim());
  const toName = to ? doctorLine(to) : r.receivingClinic || 'Attending physician';
  const toSpecialty = to?.specializationId?.name || r.specialty || '';
  const urgency = r.urgency === 'stat' ? 'STAT — please see the patient as soon as possible' : r.urgency === 'urgent' ? 'Urgent — please see the patient soon' : '';

  const protection = sealedDocumentParts({ seal, clinicName, documentLabel: 'Referral Letter', documentCode: r.referralCode });

  const row = (label: string, value: string) => (value ? `<tr><th>${e(label)}</th><td>${value}</td></tr>` : '');
  const block = (title: string, body: string) => (body ? `<section><h2>${e(title)}</h2>${body}</section>` : '');
  const para = (v?: string) => (v && v.trim() ? `<p>${e(v).replace(/\n/g, '<br>')}</p>` : '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Referral Letter - ${e(r.referralCode)}</title>
  ${protection.head}
  <style>
    @media print { @page { size: A4; margin: 18mm; } body { margin: 0; padding: 0; } .no-print { display: none; } }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 0 auto; padding: 24px; line-height: 1.55; color: #111827; font-size: 14px; }
    header { border-bottom: 2px solid #0A7F7E; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
    header .clinic { font-size: 16px; font-weight: bold; }
    header .contact { color: #4B5563; font-size: 12px; }
    header .code { text-align: right; font-size: 12px; color: #4B5563; }
    header .code strong { font-family: ui-monospace, monospace; color: #111827; font-size: 14px; }
    h1 { font-size: 1.875rem; letter-spacing: 0.04em; margin: 0 0 14px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 18px 0 6px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th { text-align: left; font-weight: normal; color: #4B5563; width: 150px; padding: 3px 12px 3px 0; vertical-align: top; }
    td { padding: 3px 0; vertical-align: top; }
    p { margin: 6px 0; }
    ul { margin: 6px 0; padding-left: 20px; }
    .urgent { border: 1px solid #B91C1C; color: #991B1B; padding: 6px 10px; border-radius: 4px; font-weight: bold; margin: 10px 0; }
    .allergy { color: #991B1B; font-weight: bold; }
    .signature { margin-top: 44px; display: flex; justify-content: flex-end; }
    .signature div { border-top: 1px solid #111827; min-width: 260px; padding-top: 6px; text-align: center; }
    .signature small { display: block; color: #4B5563; }
    .print-button { text-align: center; margin-bottom: 18px; }
    .print-button button { padding: 10px 22px; background: #0A7F7E; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #6B7280; text-align: center; }
  </style>
</head>
<body>
  ${protection.watermark}
  <div class="no-print print-button"><button data-print>Print referral letter</button></div>
  ${protection.banner}

  <header>
    <div>
      <div class="clinic">${e(clinicName)}</div>
      <div class="contact">${[settings?.clinicAddress, settings?.clinicPhone, settings?.clinicEmail].filter(Boolean).map(e).join(' · ')}</div>
    </div>
    <div class="code">Referral <strong>${e(r.referralCode)}</strong><br>${e(date(r.referredDate))}</div>
  </header>

  <h1>REFERRAL LETTER</h1>

  <table>
    ${row('To', `<strong>${e(toName)}</strong>${toSpecialty ? `, ${e(toSpecialty)}` : ''}${to && r.receivingClinic ? `<br>${e(r.receivingClinic)}` : ''}`)}
    ${row('Patient', `<strong>${e(patient.firstName)} ${e(patient.lastName)}</strong>${patient.patientCode ? ` (${e(patient.patientCode)})` : ''}`)}
    ${row('Born', born ? `${e(born)}${age(patient.dateOfBirth) ? ` · ${e(age(patient.dateOfBirth))}` : ''}` : '')}
    ${row('Sex', patient.sex ? e(patient.sex) : '')}
    ${row('Phone', patient.phone ? e(patient.phone) : '')}
  </table>

  ${urgency ? `<div class="urgent">${e(urgency)}</div>` : ''}

  <p style="margin-top:16px">Dear ${e(to ? doctorLine(to) : 'Doctor')},</p>
  <p>I am referring the patient above to you${r.specialty ? ` for ${e(r.specialty)}` : ''}. Reason for referral:</p>
  ${para(r.reason)}

  ${block(
    'Clinical summary',
    `<table>${row('Chief complaint', r.chiefComplaint ? e(r.chiefComplaint) : '')}${row('Diagnosis', r.diagnosis ? e(r.diagnosis) : '')}</table>${r.relevantHistory ? `<p><strong>Relevant history.</strong> ${e(r.relevantHistory).replace(/\n/g, '<br>')}</p>` : ''}`.replace('<table></table>', '')
  )}
  ${block('Allergies', allergies.length ? `<p class="allergy">${allergies.map(e).join('; ')}</p>` : '<p>None on file.</p>')}
  ${block('Current medicines', meds.length ? `<ul>${meds.map((m) => `<li>${e(m)}</li>`).join('')}</ul>` : '')}
  ${block('Notes', para(r.notes))}

  <p style="margin-top:18px">Kindly send your findings and recommendations back to us. Thank you for seeing this patient.</p>

  <div class="signature"${signatureSrc ? ' style="margin-top: 12px;"' : ''}>
    <figure style="margin: 0;">
    ${signatureSrc ? `<img src="${signatureSrc}" alt="Signature" style="display: block; max-height: 72px; max-width: 240px; margin: 0 auto;" />` : ''}
    <div>
      <strong>${e(from ? doctorLine(from) : 'Attending physician')}</strong>
      ${from?.specializationId?.name ? `<small>${e(from.specializationId.name)}</small>` : ''}
      <small>${from?.licenseNumber ? `License No. ${e(from.licenseNumber)}` : 'License No. ____________'}${from?.ptrNumber || from?.ptr ? ` · PTR ${e(from.ptrNumber || from.ptr)}` : ''}</small>
    </div>
    </figure>
  </div>

  ${protection.seal}

  <footer>Referral ${e(r.referralCode)} from ${e(clinicName)}. Check the serial above to confirm this letter is genuine.</footer>
</body>
</html>`;
}
