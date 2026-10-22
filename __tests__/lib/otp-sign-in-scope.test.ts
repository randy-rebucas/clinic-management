import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({ default: {} }));

import { otpSignInScope } from '@/app/api/patients/auth/otp-scope';

const CLINIC = '507f1f77bcf86cd7994390aa';
const minorDob = new Date(Date.now() - 8 * 365 * 24 * 3600 * 1000);

describe('otpSignInScope', () => {
  it('the patient’s own number proves their phone across clinics', () => {
    expect(otpSignInScope({ phone: '09171234567' }, '+639171234567')).toEqual({ claims: { amr: 'otp' }, linkRecords: true });
  });

  it('a contact number signs in to a minor at one clinic only, without phone proof', () => {
    const scope = otpSignInScope({ phone: '+639170000000', dateOfBirth: minorDob, tenantIds: [CLINIC] }, '09171234567');
    expect(scope).toEqual({ claims: { tid: CLINIC }, linkRecords: false });
  });

  it('a contact number never signs in as an adult', () => {
    expect(otpSignInScope({ phone: '+639170000000', dateOfBirth: new Date('1980-01-01') }, '09171234567')).toBeNull();
    expect(otpSignInScope({ dateOfBirth: undefined }, '09171234567')).toBeNull();
  });
});
