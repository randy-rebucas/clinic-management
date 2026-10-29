import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));

const { patientChanges, changedFields, patientLabel } = await import('@/app/api/patients/_lib/patient-audit');

const base = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  phone: '09171234567',
  dateOfBirth: new Date('1990-05-01T00:00:00Z'),
  address: { street: '1 Rizal St', city: 'Cebu' },
  identifiers: { philHealth: '12-345678901-2' },
  allergies: [{ substance: 'Penicillin', reaction: 'Rash' }],
  medicalHistory: 'Hypertension',
};

describe('patientChanges', () => {
  it('logs contact fields with their values, nested ones by path', () => {
    const changes = patientChanges(base, { ...base, phone: '09179999999', address: { street: '1 Rizal St', city: 'Davao' } }, ['phone', 'address']);
    expect(changes).toEqual([
      { field: 'phone', oldValue: '09171234567', newValue: '09179999999' },
      { field: 'address.city', oldValue: 'Cebu', newValue: 'Davao' },
    ]);
  });

  it('says health fields changed without copying them', () => {
    const changes = patientChanges(base, { ...base, allergies: [{ substance: 'Penicillin', reaction: 'Rash' }, { substance: 'Peanuts' }] }, ['allergies', 'medicalHistory']);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('allergies');
    expect(JSON.stringify(changes)).not.toMatch(/Peanuts|Penicillin|Hypertension/);
  });

  it('masks ID numbers to their last four characters', () => {
    const changes = patientChanges(base, { ...base, identifiers: { philHealth: '12-999999999-9' } }, ['identifiers']);
    expect(changes).toEqual([{ field: 'identifiers.philHealth', oldValue: '•••• 01-2', newValue: '•••• 99-9' }]);
  });

  it('compares dates by day and ignores sub-document ids and blanks', () => {
    const after = { ...base, dateOfBirth: new Date('1990-05-01T08:00:00Z'), allergies: [{ _id: 'x1', substance: 'Penicillin', reaction: 'Rash' }], middleName: '' };
    expect(patientChanges({ ...base, middleName: undefined }, after, ['dateOfBirth', 'allergies', 'middleName'])).toEqual([]);
  });

  it('compares only the fields named', () => {
    expect(patientChanges(base, { ...base, phone: 'changed' }, ['address'])).toEqual([]);
  });

  it('lists what a new record was registered with', () => {
    const fields = patientChanges({}, base, Object.keys(base)).map((c) => c.field);
    expect(fields).toEqual(['firstName', 'lastName', 'phone', 'dateOfBirth', 'address.street', 'address.city', 'identifiers.philHealth', 'allergies', 'medicalHistory']);
  });
});

describe('words', () => {
  it('names the patient and the fields changed', () => {
    expect(patientLabel({ firstName: 'Juan', lastName: 'Dela Cruz', suffix: 'Jr.' })).toBe('Juan Dela Cruz Jr.');
    expect(changedFields([
      { field: 'address.city', oldValue: 'a', newValue: 'b' },
      { field: 'address.street', oldValue: 'a', newValue: 'b' },
      { field: 'phone', oldValue: 'a', newValue: 'b' },
    ])).toBe('address, phone');
  });
});
