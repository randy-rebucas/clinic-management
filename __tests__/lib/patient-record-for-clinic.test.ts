import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { patientRecordForClinic } from '@/lib/patient-attachments';

const A = new Types.ObjectId();
const B = new Types.ObjectId();

describe('patientRecordForClinic', () => {
  const shared = {
    _id: new Types.ObjectId(),
    firstName: 'Ana',
    tenantIds: [A, B],
    attachments: [
      { name: 'ours.pdf', tenantId: A },
      { name: 'theirs.pdf', tenantId: B },
      { name: 'unstamped.pdf' },
    ],
    guardians: [
      { patient: new Types.ObjectId(), source: 'phone' },
      { patient: new Types.ObjectId(), source: 'clinic', tenantId: A },
      { patient: new Types.ObjectId(), source: 'clinic', tenantId: B },
    ],
  };

  it("keeps only this clinic's files and family links, and hides the other clinics", () => {
    const out = patientRecordForClinic(shared, A) as typeof shared;
    expect(out.firstName).toBe('Ana');
    expect('tenantIds' in out).toBe(false);
    expect(out.attachments.map((a) => a.name)).toEqual(['ours.pdf']);
    expect(out.guardians.map((g) => g.source + ':' + String(g.tenantId ?? ''))).toEqual(['phone:', `clinic:${A}`]);
  });

  it('leaves fields that were not loaded alone', () => {
    const out = patientRecordForClinic({ firstName: 'Ana', tenantIds: [A] }, A);
    expect(out).toEqual({ firstName: 'Ana' });
  });
});
