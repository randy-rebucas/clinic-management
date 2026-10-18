import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: {} }));
vi.mock('@/app/lib/dal', () => ({}));
vi.mock('@/app/lib/refresh-tokens', () => ({}));

import { readLoginQrToken } from '@/app/api/patients/auth/shared';

const TOKEN = 'A'.repeat(43);

describe('readLoginQrToken', () => {
  it('reads the token from the scanned JSON string', () => {
    expect(readLoginQrToken(JSON.stringify({ type: 'patient_login', token: TOKEN }))).toBe(TOKEN);
  });

  it('accepts an already-parsed object', () => {
    expect(readLoginQrToken({ type: 'patient_login', token: TOKEN })).toBe(TOKEN);
  });

  it.each([
    ['not JSON', 'hello'],
    ['wrong type', JSON.stringify({ type: 'other', token: TOKEN })],
    ['patient code instead of a token', JSON.stringify({ type: 'patient_login', patientCode: 'P-001' })],
    ['token too short', JSON.stringify({ type: 'patient_login', token: 'abc' })],
    ['token with bad characters', JSON.stringify({ type: 'patient_login', token: `${'A'.repeat(42)}$` })],
    ['array', '[]'],
  ])('rejects %s', (_label, input) => {
    expect(readLoginQrToken(input)).toBeNull();
  });
});
