import { describe, it, expect, afterEach } from 'vitest';
import { smsCountryAllowed } from '@/lib/phone';

describe('smsCountryAllowed', () => {
  const prev = process.env.SMS_ALLOWED_COUNTRY_CODES;
  afterEach(() => {
    if (prev === undefined) delete process.env.SMS_ALLOWED_COUNTRY_CODES;
    else process.env.SMS_ALLOWED_COUNTRY_CODES = prev;
  });

  it('allows only Philippine numbers by default', () => {
    delete process.env.SMS_ALLOWED_COUNTRY_CODES;
    expect(smsCountryAllowed('+639171234567')).toBe(true);
    expect(smsCountryAllowed('+2348012345678')).toBe(false);
    expect(smsCountryAllowed('+14155550100')).toBe(false);
  });

  it('follows SMS_ALLOWED_COUNTRY_CODES, including "*"', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '63, +65';
    expect(smsCountryAllowed('+6591234567')).toBe(true);
    expect(smsCountryAllowed('+14155550100')).toBe(false);
    process.env.SMS_ALLOWED_COUNTRY_CODES = '*';
    expect(smsCountryAllowed('+14155550100')).toBe(true);
  });
});
