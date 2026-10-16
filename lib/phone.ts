/**
 * Normalize a phone number to E.164 for SMS delivery.
 *
 * Defaults to the Philippines (+63): `09171234567`, `9171234567`, `639171234567`
 * and `+639171234567` all become `+639171234567`. Numbers already starting with `+`
 * are kept as-is (digits only). Returns null when the input can't be a valid number.
 */
export function normalizePhone(input: string | null | undefined, defaultCountryCode = '63'): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let e164: string;
  if (trimmed.startsWith('+')) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('00')) {
    e164 = `+${digits.slice(2)}`;
  } else if (digits.startsWith(defaultCountryCode) && digits.length > 10) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('0')) {
    e164 = `+${defaultCountryCode}${digits.slice(1)}`;
  } else {
    e164 = `+${defaultCountryCode}${digits}`;
  }

  // E.164: up to 15 digits after '+', and realistically at least 8.
  const len = e164.length - 1;
  return len >= 8 && len <= 15 ? e164 : null;
}
