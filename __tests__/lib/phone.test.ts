import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it.each([
    ['09171234567'],
    ['9171234567'],
    ['639171234567'],
    ['+639171234567'],
    ['00639171234567'],
    ['0917 123 4567'],
    ['(0917) 123-4567'],
    ['+63 917 123 4567'],
  ])('normalizes PH mobile %s to E.164', (input) => {
    expect(normalizePhone(input)).toBe('+639171234567');
  });

  it('keeps explicit international numbers', () => {
    expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100');
  });

  it.each([[''], [null], [undefined], ['abc'], ['12'], ['+1234567890123456789']])('rejects %s', (input) => {
    expect(normalizePhone(input as any)).toBeNull();
  });
});
