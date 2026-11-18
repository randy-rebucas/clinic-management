import { describe, it, expect } from 'vitest';
import {
  dropFields,
  LOCKED_LAB_RESULT_FIELDS,
  LOCKED_VISIT_FIELDS,
  pickFields,
} from '@/app/api/patients/me/_lib/locked-list';

describe('locked record lists (no active eMCR year)', () => {
  it('a lab result keeps what the row shows and never its values', () => {
    const row = pickFields(
      {
        _id: 'l1',
        status: 'completed',
        orderDate: '2026-11-01',
        requestCode: 'LAB-1',
        request: { testType: 'CBC', description: 'clinical notes', specialInstructions: 'x' },
        results: { hb: 9.1 },
        abnormalFlags: { hb: 'low' },
        referenceRanges: { hb: '12-16' },
        interpretation: 'Anemia',
        attachments: [{ filename: 'a.pdf' }],
      },
      LOCKED_LAB_RESULT_FIELDS
    );
    expect(row).toEqual({ _id: 'l1', status: 'completed', orderDate: '2026-11-01', requestCode: 'LAB-1', request: { testType: 'CBC' } });
  });

  it('a visit keeps when, what kind and with whom, never the clinical content', () => {
    const row = pickFields(
      {
        _id: 'v1',
        date: '2026-11-01',
        visitType: 'consultation',
        status: 'closed',
        provider: { name: 'Dr. Cruz' },
        chiefComplaint: 'cough',
        diagnoses: [{ code: 'J06.9' }],
        soapNotes: { assessment: 'URTI' },
        notes: 'internal',
      },
      LOCKED_VISIT_FIELDS
    );
    expect(row).toEqual({ _id: 'v1', date: '2026-11-01', visitType: 'consultation', status: 'closed', provider: { name: 'Dr. Cruz' } });
  });

  it('dropFields removes only the named top-level fields', () => {
    expect(dropFields({ a: 1, reason: 'chest pain', b: 2 }, ['reason'])).toEqual({ a: 1, b: 2 });
  });
});
