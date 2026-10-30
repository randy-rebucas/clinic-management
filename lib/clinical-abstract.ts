import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import { CLINICAL_ABSTRACT_FIELDS, type ClinicalAbstract, type ClinicalAbstractField } from '@/models/DocumentRequest';
import type { IssuedSeal } from '@/lib/document-seal';
import type { Signer } from '@/lib/doctor-signature';
import { escapeHtml as e, protectionHead, sealedDocumentParts, watermarkOverlay } from '@/lib/document-protection';

/**
 * Clinical abstracts (a `clinical_abstract` document request): a doctor's signed summary of the
 * patient's case. Staff write it on the Document requests page, starting from a draft built from
 * the chart (`draftAbstractFromChart`); the patient downloads it sealed once released.
 */

export const ABSTRACT_LABELS: Record<ClinicalAbstractField, string> = {
  consultations: 'Dates of consultation',
  chiefComplaint: 'Chief complaint',
  history: 'Brief history',
  findings: 'Pertinent physical findings',
  diagnostics: 'Laboratory and diagnostic results',
  diagnosis: 'Diagnosis',
  management: 'Treatment and management',
  condition: 'Present condition',
  recommendations: 'Recommendations',
};

/** Must be filled in before the abstract can be released. */
export const ABSTRACT_REQUIRED: readonly ClinicalAbstractField[] = ['diagnosis', 'condition'];

export const abstractSchema = z
  .object(Object.fromEntries(CLINICAL_ABSTRACT_FIELDS.map((f) => [f, z.string().trim().max(4000).optional()])) as Record<
    ClinicalAbstractField,
    z.ZodOptional<z.ZodString>
  >)
  .strict();

/** The required sections still empty. */
export function missingAbstractFields(a: ClinicalAbstract | null | undefined): ClinicalAbstractField[] {
  return ABSTRACT_REQUIRED.filter((f) => !a?.[f]?.trim());
}

const DAY = (d: Date, tz: string) => new Date(d).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
const VISIT_TYPES: Record<string, string> = {
  consultation: 'consultation',
  'follow-up': 'follow-up',
  checkup: 'check-up',
  emergency: 'emergency',
  teleconsult: 'teleconsult',
  vaccination: 'vaccination',
};

/**
 * A starting draft from the patient's chart at the clinic: visit dates, the latest complaint,
 * history, exam and plan, recent results, every diagnosis, and recent medicines. The doctor
 * edits it; nothing here is released without being saved.
 */
export async function draftAbstractFromChart(
  r: { tenantId: unknown; patient: unknown },
  tz: string
): Promise<ClinicalAbstract> {
  await connectDB();
  const scope = { tenantId: new Types.ObjectId(String(r.tenantId)), patient: new Types.ObjectId(String(r.patient)) };
  const [visits, labs, prescriptions] = await Promise.all([
    Visit.find({ ...scope, status: { $in: ['open', 'closed'] } })
      .select('date visitType chiefComplaint historyOfPresentIllness soapNotes physicalExam vitals diagnoses plan treatmentPlan.followUp')
      .sort({ date: -1 })
      .limit(20)
      .lean<any[]>(),
    LabResult.find({ ...scope, status: { $in: ['completed', 'reviewed'] } })
      .select('orderDate resultDate request.testType results abnormalFlags interpretation')
      .sort({ orderDate: -1 })
      .limit(5)
      .lean<any[]>(),
    Prescription.find({ ...scope, status: { $ne: 'cancelled' }, issuedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } })
      .select('issuedAt medications')
      .sort({ issuedAt: -1 })
      .limit(5)
      .lean<any[]>(),
  ]);

  const latest = visits[0];
  const join = (parts: (string | null | undefined | false)[], sep = '\n') => parts.filter(Boolean).join(sep);

  const diagnoses = new Map<string, string>();
  for (const v of visits) {
    for (const d of v.diagnoses || []) {
      const text = join([d.code, d.description], ' ').trim();
      if (text && !diagnoses.has(text.toLowerCase())) diagnoses.set(text.toLowerCase(), text);
    }
  }

  const exam = latest?.physicalExam
    ? Object.entries(latest.physicalExam as Record<string, string>)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key === 'heent' || key === 'headEent' ? 'HEENT' : key[0].toUpperCase() + key.slice(1)}: ${value}`)
    : [];
  const vit = latest?.vitals;
  const vitals = vit
    ? join([vit.bp && `BP ${vit.bp}`, vit.hr && `HR ${vit.hr}`, vit.rr && `RR ${vit.rr}`, vit.tempC && `Temp ${vit.tempC}°C`, vit.spo2 && `SpO2 ${vit.spo2}%`], ', ')
    : '';

  const results = labs.map((l) => {
    const values = l.results && typeof l.results === 'object'
      ? Object.entries(l.results)
          .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}${l.abnormalFlags?.[k] && l.abnormalFlags[k] !== 'normal' ? ` (${l.abnormalFlags[k]})` : ''}`)
          .join(', ')
      : '';
    return `${l.request?.testType || 'Test'} (${DAY(l.resultDate || l.orderDate, tz)}): ${values || l.interpretation || 'see result'}`;
  });

  const medicines = [
    ...new Set(
      prescriptions.flatMap((rx) => (rx.medications || []).map((m: any) => join([m.name, m.strength, m.frequency, m.durationDays && `x ${m.durationDays} days`], ' ')))
    ),
  ];

  return {
    consultations: visits
      .slice()
      .reverse()
      .slice(-10)
      .map((v) => `${DAY(v.date, tz)} (${VISIT_TYPES[v.visitType] || 'consultation'})`)
      .join('; '),
    chiefComplaint: latest?.chiefComplaint || '',
    history: latest?.historyOfPresentIllness || latest?.soapNotes?.subjective || '',
    findings: join([vitals, ...exam]),
    diagnostics: results.join('\n'),
    diagnosis: [...diagnoses.values()].join('\n'),
    management: join([latest?.soapNotes?.plan || latest?.plan, medicines.length ? `Medicines: ${medicines.join('; ')}` : '']),
    condition: '',
    recommendations: latest?.treatmentPlan?.followUp?.instructions || '',
  };
}

export type ClinicalAbstractDocumentInput = {
  request: { requestCode: string; purpose: string | null; abstract: ClinicalAbstract; savedAt?: Date | null };
  patient: any;
  settings: any;
  tz: string;
  seal: IssuedSeal | null;
  signer: Signer | null;
};

const text = (v: unknown) => e(v).replace(/\n/g, '<br>');

/** The abstract as self-contained HTML for lib/pdf.ts. Without a seal it renders as a staff preview. */
export function clinicalAbstractHtml({ request, patient: p, settings, tz, seal, signer }: ClinicalAbstractDocumentInput): string {
  const clinicName = settings?.clinicName || 'Clinic';
  const fullName = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const born = p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const dated = (request.savedAt ? new Date(request.savedAt) : new Date()).toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' });
  const licenseNumber = signer?.licenseNumber || settings?.licenseNumber;

  const protection = seal
    ? sealedDocumentParts({ seal, clinicName, documentLabel: 'Clinical Abstract', documentCode: request.requestCode })
    : {
        head: protectionHead(),
        watermark: watermarkOverlay([`PREVIEW · NOT ISSUED · ${clinicName}`, request.requestCode, 'For clinic staff only'], { warning: true }),
        banner: '<div class="draft">Preview of the saved abstract. The patient&rsquo;s copy carries a verifiable seal.</div>',
        seal: '',
      };

  const sections = CLINICAL_ABSTRACT_FIELDS.filter((f) => request.abstract[f]?.trim())
    .map((f) => `<tr><th>${e(ABSTRACT_LABELS[f])}</th><td>${text(request.abstract[f])}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Clinical abstract - ${e(request.requestCode)}</title>
${protection.head}
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; font-size: 12.5px; line-height: 1.5; margin: 0 auto; max-width: 780px; }
  header { text-align: center; border-bottom: 2px solid #0A7F7E; padding-bottom: 10px; margin-bottom: 14px; }
  header .clinic { font-size: 16px; font-weight: bold; }
  header .contact { color: #52606d; font-size: 11px; }
  h1 { text-align: center; font-size: 19px; letter-spacing: .08em; margin: 6px 0 14px; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 28px; margin-bottom: 14px; padding: 8px 10px; background: #f5f7fa; border-left: 3px solid #0A7F7E; }
  .facts div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #7b8794; }
  .facts div strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; vertical-align: top; width: 190px; padding: 7px 12px 7px 0; color: #3e4c59; font-size: 11.5px; border-bottom: 1px solid #e4e7eb; }
  td { vertical-align: top; padding: 7px 0; border-bottom: 1px solid #e4e7eb; }
  tr { page-break-inside: avoid; }
  .purpose { margin-top: 16px; }
  .signature { margin-top: 30px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
  .signature figure { margin: 0; text-align: center; min-width: 260px; }
  .signature .line { border-top: 1px solid #1f2933; padding-top: 6px; }
  .signature small { display: block; color: #52606d; }
  .draft { border: 1px solid #b45309; background: #fffbeb; color: #92400e; padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; font-weight: bold; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d9e2ec; font-size: 10px; color: #7b8794; text-align: center; }
</style>
</head>
<body>
  ${protection.watermark}
  ${protection.banner}
  <header>
    <div class="clinic">${e(clinicName)}</div>
    <div class="contact">${[settings?.clinicAddress, settings?.clinicPhone, settings?.clinicEmail].filter(Boolean).map(e).join(' · ')}</div>
  </header>

  <h1>CLINICAL ABSTRACT</h1>

  <section class="facts">
    <div><span>Patient</span><strong>${e(fullName)}</strong></div>
    ${p.patientCode ? `<div><span>Patient ID</span><strong>${e(p.patientCode)}</strong></div>` : ''}
    <div><span>Date of birth</span><strong>${e(born)}</strong></div>
    <div><span>Sex</span><strong>${e(p.sex ? p.sex[0].toUpperCase() + p.sex.slice(1) : '—')}</strong></div>
    <div><span>Date issued</span><strong>${e(dated)}</strong></div>
  </section>

  <table>${sections}</table>

  ${request.purpose ? `<p class="purpose">This clinical abstract is issued upon the request of the patient for ${e(request.purpose)} purposes.</p>` : ''}

  <div class="signature">
    <figure>
      ${seal && signer?.signatureSrc ? `<img src="${signer.signatureSrc}" alt="Signature" style="display:block; max-height:72px; max-width:240px; margin:0 auto;" />` : ''}
      <div class="line">
        <strong>${e(signer?.name || 'Attending physician')}</strong>
        <small>${licenseNumber ? `License No. ${e(licenseNumber)}` : 'License No. ____________'}${signer?.ptr ? ` · PTR No. ${e(signer.ptr)}` : ''}</small>
      </div>
    </figure>
  </div>

  ${protection.seal}

  <footer>
    Clinical abstract ${e(request.requestCode)} from ${e(clinicName)}. Confidential: released to the patient under the Data Privacy Act of 2012.
    ${seal ? 'Check the serial above to confirm it is genuine and has not been withdrawn.' : ''}
  </footer>
</body>
</html>`;
}
