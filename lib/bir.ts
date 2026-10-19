/**
 * BIR invoicing (Philippines): the clinic's registration, how it turns into the tax rules the
 * invoice arithmetic uses, and how BIR figures print. Client-safe: no model imports.
 *
 * Under the Ease of Paying Taxes Act (RA 11976) and RR 7-2024 the sales invoice is the one
 * document issued for a sale of services; official receipts are no longer primary documents.
 */
import type { TaxProfile, VatClass } from './invoice-totals';

export interface BirSettings {
  /** Invoices are issued as BIR sales invoices, with serials from the registered range. */
  enabled: boolean;
  regime: 'vat' | 'non_vat';
  vatRate: number;
  pricesIncludeVat: boolean;
  professionalFeeVatClass: VatClass;
  /** The registered name on the Certificate of Registration (Form 2303), if not the clinic name. */
  registeredName: string;
  /** Five-digit branch code; 00000 is the head office. */
  branchCode: string;
  /** Acknowledgment certificate / permit to use the system, as printed on every invoice. */
  permitNumber: string;
  permitIssuedOn: string;
  serialPrefix: string;
  serialStart: number;
  /** 0 = no end registered. */
  serialEnd: number;
}

export const BIR_DEFAULTS: BirSettings = {
  enabled: false,
  regime: 'non_vat',
  vatRate: 12,
  pricesIncludeVat: true,
  professionalFeeVatClass: 'vatable',
  registeredName: '',
  branchCode: '00000',
  permitNumber: '',
  permitIssuedOn: '',
  serialPrefix: '',
  serialStart: 1,
  serialEnd: 0,
};

export const SERIAL_PREFIX = /^[A-Za-z0-9-]{0,6}$/;
export const BRANCH_CODE = /^\d{3,5}$/;

export const VAT_CLASS_LABEL: Record<VatClass, string> = {
  vatable: 'VATable',
  exempt: 'VAT-exempt',
  zero_rated: 'Zero-rated',
};

/** The stored settings with every field present. */
export function birSettingsOf(raw: unknown): BirSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<BirSettings>;
  return {
    ...BIR_DEFAULTS,
    ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null)),
    permitIssuedOn: s.permitIssuedOn ? String(s.permitIssuedOn).slice(0, 10) : '',
  } as BirSettings;
}

/** The tax rules for new invoices, or undefined when BIR invoicing is off. */
export function taxProfileOf(raw: unknown): TaxProfile | undefined {
  const s = birSettingsOf(raw);
  if (!s.enabled) return undefined;
  return {
    regime: s.regime,
    vatRate: s.vatRate,
    pricesIncludeVat: s.pricesIncludeVat,
    professionalFeeVatClass: s.professionalFeeVatClass,
  };
}

/** "123-456-789-00000" from any spacing of a 9 or 12 digit TIN plus the branch code. */
export function formatTin(tin: string | undefined, branchCode = '00000'): string {
  const digits = String(tin ?? '').replace(/\D/g, '');
  if (digits.length < 9) return String(tin ?? '').trim();
  const head = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  const branch = digits.length >= 12 ? digits.slice(9) : String(branchCode || '00000').padStart(5, '0');
  return `${head}-${branch}`;
}

/** Sales invoice serial as printed: prefix and a zero-padded number. */
export function formatSerial(prefix: string, seq: number): string {
  const n = String(seq).padStart(7, '0');
  return prefix ? `${prefix}-${n}` : n;
}

/** What is missing before the clinic can issue BIR invoices, for the settings page and the API. */
export function birSetupProblems(s: BirSettings, taxId: string): string[] {
  if (!s.enabled) return [];
  const out: string[] = [];
  if (String(taxId ?? '').replace(/\D/g, '').length < 9) out.push('Enter the clinic’s TIN under Clinic details.');
  if (!BRANCH_CODE.test(s.branchCode)) out.push('The branch code is 3 to 5 digits; 00000 for the head office.');
  if (!s.permitNumber.trim()) out.push('Enter the BIR permit or acknowledgment certificate number.');
  if (!Number.isInteger(s.serialStart) || s.serialStart < 1) out.push('The first serial number is a whole number from 1.');
  if (s.serialEnd && s.serialEnd < s.serialStart) out.push('The last serial number comes after the first.');
  if (s.regime === 'vat' && !(s.vatRate > 0 && s.vatRate <= 100)) out.push('Enter the VAT rate (12% in the Philippines).');
  return out;
}
