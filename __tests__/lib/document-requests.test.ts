import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));

import { coveredRange, RECORDS_SECTION_LIMIT } from '@/lib/medical-records';
import { isDownloadable, patientRequestStatus } from '@/lib/document-requests';
import { medicalRecordsHtml } from '@/lib/medical-records-document';
import { generateMedicalCertificateHTML } from '@/lib/medical-certificate';
import { purposePhrase } from '@/lib/document-request-pdf';
import { clinicalAbstractHtml, missingAbstractFields } from '@/lib/clinical-abstract';

const NOW = new Date('2026-10-30T04:00:00Z');

describe('document request rules', () => {
  it('a released copy past its window reads as expired and stops downloading', () => {
    expect(patientRequestStatus({ status: 'released', availableUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe('released');
    expect(patientRequestStatus({ status: 'released', availableUntil: NOW }, NOW)).toBe('expired');
    expect(isDownloadable({ status: 'released', availableUntil: NOW }, NOW)).toBe(false);
    expect(isDownloadable({ status: 'revoked', availableUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
  });

  it('covers clinic-local days and never past the release cutoff', () => {
    const cutoff = new Date('2026-10-20T03:00:00Z');
    // Manila is UTC+8: the clinic's 1 January starts at 16:00 UTC the day before.
    expect(coveredRange({ periodFrom: '2026-01-01', periodTo: '2026-03-31', cutoff }, 'Asia/Manila', NOW)).toEqual({
      $gte: new Date('2025-12-31T16:00:00.000Z'),
      $lte: new Date('2026-03-31T15:59:59.999Z'),
    });
    // A period ending after the release stops at the release.
    expect(coveredRange({ periodTo: '2026-12-31', cutoff }, 'Asia/Manila', NOW)).toEqual({ $lte: cutoff });
    // Not released yet (preview): up to now.
    expect(coveredRange({}, 'Asia/Manila', NOW)).toEqual({ $lte: NOW });
  });
});

describe('medical records document', () => {
  const records = {
    patient: { firstName: '<script>x</script>', lastName: 'Cruz', sex: 'female', dateOfBirth: new Date('1990-02-03'), allergies: ['Penicillin'] },
    visits: [
      {
        visitCode: 'V-1',
        date: new Date('2026-05-01T02:00:00Z'),
        visitType: 'consultation',
        chiefComplaint: 'Cough',
        vitals: { bp: '120/80', tempC: 37.8 },
        physicalExam: { heent: 'Clear', headEent: 'Clear' },
        diagnoses: [{ code: 'J06.9', description: 'URTI', primary: true }],
        provider: { name: 'Dr. Ana Reyes' },
      },
    ],
    prescriptions: [],
    labResults: [{ orderDate: new Date('2026-05-01T02:00:00Z'), request: { testType: 'CBC' }, status: 'completed', results: { hb: 10.1 }, abnormalFlags: { hb: 'low' }, referenceRanges: { hb: '12-16' } }],
    truncated: true,
  };
  const html = medicalRecordsHtml({
    request: { requestCode: 'MRR-000007', purpose: 'insurance', periodFrom: '2026-01-01', periodTo: null, cutoff: null },
    records,
    settings: { clinicName: 'Sunrise Clinic' },
    tz: 'Asia/Manila',
    seal: null,
  });

  it('escapes record text and renders the chart sections', () => {
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    for (const expected of ['Penicillin', 'J06.9', 'BP 120/80', 'Dr. Ana Reyes', 'Insurance or HMO claim', 'LOW', 'Consultations (1)']) {
      expect(html).toContain(expected);
    }
    // HEENT is stored under two keys on older visits; it prints once.
    expect(html.match(/HEENT:/g)).toHaveLength(1);
    expect(html).toContain(`first ${RECORDS_SECTION_LIMIT} entries`);
  });

  it('an unsealed copy is a preview, never a certified copy', () => {
    expect(html).toContain('PREVIEW');
    expect(html).not.toContain('This is a true copy');
  });
});

describe('requested medical certificate', () => {
  const visit = {
    visitCode: 'V-000201',
    date: new Date('2026-10-28T02:00:00Z'),
    status: 'closed',
    patient: { firstName: 'Maria', lastName: 'Cruz' },
    provider: { name: 'Dr. Ana Reyes' },
    diagnoses: [{ code: 'J06.9', description: 'URTI', primary: true }],
    treatmentPlan: { followUp: { instructions: 'Rest for 3 days, Oct 28 to 30' } },
  };

  it('says what it was requested for, and an unsealed one is a preview', () => {
    const html = generateMedicalCertificateHTML(visit, { clinicName: 'Sunrise Clinic' }, null, 'Asia/Manila', null, { purpose: 'sick leave' });
    expect(html).toContain('issued upon the request of the patient for sick leave purposes');
    expect(html).toContain('Rest for 3 days');
    expect(html).toContain('PREVIEW');
    expect(html).not.toContain('verifies at');
  });

  it('staff prints carry no purpose line', () => {
    expect(generateMedicalCertificateHTML(visit, {}, null, 'Asia/Manila', null)).not.toContain('issued upon the request');
  });

  it('phrases purposes for the sentence, using the patient’s words for "other"', () => {
    expect(purposePhrase({ purpose: 'sick_leave' })).toBe('sick leave');
    expect(purposePhrase({ purpose: 'insurance' })).toBe('insurance or HMO claim');
    expect(purposePhrase({ purpose: 'other', purposeNote: 'barangay clearance' })).toBe('barangay clearance');
    expect(purposePhrase({ purpose: 'other' })).toBeNull();
  });
});

describe('clinical abstract document', () => {
  const input = {
    request: {
      requestCode: 'CAR-000001',
      purpose: 'employment',
      abstract: { diagnosis: 'J18.9 <b>Pneumonia</b>', condition: 'Recovered', history: '' },
      savedAt: new Date('2026-10-30T04:00:00Z'),
    },
    patient: { firstName: 'Maria', lastName: 'Cruz', sex: 'female', dateOfBirth: new Date('1990-02-03') },
    settings: { clinicName: 'Sunrise Clinic' },
    tz: 'Asia/Manila',
    seal: null,
    signer: { doctorId: 'd', name: 'Dr. Ana Reyes', licenseNumber: '0123456', ptr: null, s2Number: null, signatureSrc: 'data:image/png;base64,AAAA' },
  };

  it('prints only written sections, escaped, with the purpose and signer', () => {
    const html = clinicalAbstractHtml(input);
    expect(html).toContain('J18.9 &lt;b&gt;Pneumonia&lt;/b&gt;');
    expect(html).toContain('Present condition');
    expect(html).not.toContain('Brief history');
    expect(html).toContain('for employment purposes');
    expect(html).toContain('License No. 0123456');
  });

  it('an unsealed abstract is a preview without the signature image', () => {
    const html = clinicalAbstractHtml(input);
    expect(html).toContain('PREVIEW');
    expect(html).not.toContain('data:image/png;base64,AAAA');
  });

  it('needs a diagnosis and the present condition', () => {
    expect(missingAbstractFields(null)).toEqual(['diagnosis', 'condition']);
    expect(missingAbstractFields({ diagnosis: 'x', condition: '  ' })).toEqual(['condition']);
  });
});
