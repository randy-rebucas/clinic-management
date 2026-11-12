/**
 * Shared rules for registering a clinic (web sign-up, API and scripts/onboard-tenant.ts).
 * MyClinicSoft serves clinics in the Philippines: PayMongo pay-links only take PHP,
 * and PhilHealth, BIR receipts and SMS all assume a PH clinic, so new clinics start with
 * PH settings rather than whatever a visitor's IP or browser suggests.
 */
import { normalizePhone } from './phone';

export const PH_DEFAULTS = {
  country: 'Philippines',
  timezone: 'Asia/Manila',
  currency: 'PHP',
  dateFormat: 'MM/DD/YYYY',
} as const;

export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;

export const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'staging', 'dev', 'test', 'demo',
  // Names that would pass for the platform's own pages on a clinic subdomain (phishing).
  'login', 'signin', 'signup', 'auth', 'account', 'accounts', 'secure', 'security', 'pay', 'payment',
  'payments', 'billing', 'checkout', 'support', 'help', 'status', 'platform', 'console', 'dashboard',
  'portal', 'emcr', 'verify', 'docs', 'blog', 'static', 'assets', 'cdn', 'media', 'files', 'smtp',
  'email', 'webmail', 'ns1', 'ns2', 'root', 'system', 'official', 'myclinicsoft', 'devcom',
];

/** Error message for an invalid subdomain, or null when it can be used. */
export function subdomainError(subdomain: string): string | null {
  if (!subdomain || subdomain.length < 2) return 'Subdomain must be at least 2 characters long';
  if (subdomain.length > 63) return 'Subdomain must be at most 63 characters long';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return 'Subdomain must contain only lowercase letters, numbers, and hyphens';
  }
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return `Subdomain "${subdomain}" is reserved and cannot be used`;
  }
  return null;
}

/**
 * A Philippine phone number in E.164, or null. Accepts mobiles (0917 123 4567, +63 917…)
 * and landlines with area code ((02) 8123 4567, 032 123 4567). Foreign numbers are refused.
 */
export function normalizePhPhone(input: string | null | undefined): string | null {
  const e164 = normalizePhone(input, '63');
  if (!e164 || !e164.startsWith('+63')) return null;
  const national = e164.slice(3);
  // Mobiles are 9XX XXX XXXX (10 digits); landlines are area code + number (9 digits, Metro Manila 02 + 8 digits).
  if (/^9\d{9}$/.test(national)) return e164;
  if (/^[2-8]\d{8}$/.test(national)) return e164;
  return null;
}

/** "+639171234567" → "0917 123 4567"; "+63281234567" → "(02) 8123 4567"; other landlines → "(032) 123 4567". */
export function formatPhPhone(e164: string): string {
  const national = e164.replace(/^\+63/, '');
  if (/^9\d{9}$/.test(national)) return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  if (/^2\d{8}$/.test(national)) return `(02) ${national.slice(1, 5)} ${national.slice(5)}`;
  if (/^[3-8]\d{8}$/.test(national)) return `(0${national.slice(0, 2)}) ${national.slice(2, 5)} ${national.slice(5)}`;
  return e164;
}

/** PH ZIP codes are four digits. */
export const isPhZipCode = (zip: string) => /^\d{4}$/.test(zip.trim());

/** One-line clinic address for receipts and letters, from whichever parts were given. */
export function formatClinicAddress(address?: {
  street?: string; city?: string; state?: string; zipCode?: string; country?: string;
} | null): string {
  if (!address) return '';
  const cityLine = [address.city, [address.state, address.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [address.street, cityLine].filter(Boolean).join(', ');
}
