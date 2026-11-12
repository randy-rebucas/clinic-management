import { describe, it, expect } from 'vitest';
import {
  formatClinicAddress,
  formatPhPhone,
  isPhZipCode,
  normalizePhPhone,
  subdomainError,
} from '@/lib/tenant-onboarding';

describe('normalizePhPhone', () => {
  it.each([
    ['0917 123 4567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['(02) 8123 4567', '+63281234567'],
    ['028 123 4567', '+63281234567'],
    ['(032) 123 4567', '+63321234567'],
  ])('accepts %s', (input, expected) => {
    expect(normalizePhPhone(input)).toBe(expected);
  });

  it.each([['+1 415 555 0100'], ['0917 123 456'], ['0917 123 45678'], ['12345'], [''], [null]])('refuses %s', (input) => {
    expect(normalizePhPhone(input as any)).toBeNull();
  });
});

describe('formatPhPhone', () => {
  it('formats mobiles and landlines the way Filipinos write them', () => {
    expect(formatPhPhone('+639171234567')).toBe('0917 123 4567');
    expect(formatPhPhone('+63281234567')).toBe('(02) 8123 4567');
    expect(formatPhPhone('+63321234567')).toBe('(032) 123 4567');
  });
});

describe('isPhZipCode', () => {
  it('takes four digits only', () => {
    expect(isPhZipCode('1200')).toBe(true);
    expect(isPhZipCode('120')).toBe(false);
    expect(isPhZipCode('90210-1')).toBe(false);
  });
});

describe('formatClinicAddress', () => {
  it('keeps the city even when no street is given', () => {
    expect(formatClinicAddress({ city: 'Cebu City', state: 'Cebu', zipCode: '6000' })).toBe('Cebu City, Cebu 6000');
  });
  it('joins every part', () => {
    expect(formatClinicAddress({ street: '12 Rizal St, Brgy. Lahug', city: 'Cebu City', state: 'Cebu', zipCode: '6000', country: 'Philippines' }))
      .toBe('12 Rizal St, Brgy. Lahug, Cebu City, Cebu 6000');
  });
  it('is empty without an address', () => {
    expect(formatClinicAddress(undefined)).toBe('');
  });
});

describe('subdomainError', () => {
  it('refuses names reserved for the platform', () => {
    expect(subdomainError('login')).toMatch(/reserved/);
    expect(subdomainError('billing')).toMatch(/reserved/);
  });
  it('accepts a normal clinic name', () => {
    expect(subdomainError('city-medical')).toBeNull();
  });
});
