import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Doctor', () => ({ default: {} }));
vi.mock('@/models/User', () => ({ default: {} }));

import { signerWroteContent } from '@/lib/doctor-signature';
import { touchesAttestedFields } from '@/lib/visit-schema';

const DOCTOR = '507f1f77bcf86cd799439011';
const NURSE = '507f1f77bcf86cd799439022';

describe('signerWroteContent', () => {
  it('signs only what the signer wrote last; older documents count as theirs', () => {
    expect(signerWroteContent({ contentAuthor: DOCTOR }, DOCTOR)).toBe(true);
    expect(signerWroteContent({ contentAuthor: DOCTOR }, { _id: DOCTOR, name: 'Dr' })).toBe(true);
    expect(signerWroteContent({ contentAuthor: NURSE }, DOCTOR)).toBe(false);
    expect(signerWroteContent({}, DOCTOR)).toBe(true);
  });
});

describe('touchesAttestedFields', () => {
  it('clinical content makes the writer the author; vitals and status do not', () => {
    expect(touchesAttestedFields({ assessment: 'x' })).toBe(true);
    expect(touchesAttestedFields({ provider: DOCTOR })).toBe(true);
    expect(touchesAttestedFields({ vitals: { hr: 80 }, status: 'open' })).toBe(false);
  });
});
