import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { sharedSignInChanges } from '@/app/api/patients/_lib/shared-record';

const A = new Types.ObjectId();
const B = new Types.ObjectId();
const before = { phone: '09171234567', email: 'ana@x.test', dateOfBirth: new Date('1990-05-01'), tenantIds: [A, B] };

describe('sharedSignInChanges', () => {
  it('refuses a new phone, email or birth date on a record another clinic shares', () => {
    expect(sharedSignInChanges(before, { phone: '09998887777' }, String(A))).toEqual(['phone']);
    expect(sharedSignInChanges(before, { email: 'evil@x.test', dateOfBirth: '1991-01-01' }, String(A))).toEqual(['email', 'dateOfBirth']);
  });

  it('allows the same values in another spelling, and other fields', () => {
    expect(sharedSignInChanges(before, { phone: '+639171234567', email: 'ANA@x.test', dateOfBirth: '1990-05-01', allergies: ['x'] }, String(A))).toEqual([]);
  });

  it("doesn't restrict a record only this clinic has", () => {
    expect(sharedSignInChanges({ ...before, tenantIds: [A] }, { phone: '09998887777' }, String(A))).toEqual([]);
  });
});
