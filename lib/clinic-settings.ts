/**
 * Clinic settings as /admin/settings edits them. Only settings something in the app reads are
 * offered; the rest of the Settings document (kept for old data) is never shown, so no switch
 * here is a switch that does nothing. Client-safe: no model imports.
 */

import type { BirSettings } from './bir';
import type { PhilhealthSettings } from './philhealth';

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export interface DayHours {
  day: Weekday;
  open: string;
  close: string;
  closed: boolean;
}

/** Currencies the receipt and the money formatters handle (the onboarding list). */
export const CURRENCIES = [
  { code: 'PHP', label: 'Philippine peso' },
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British pound' },
  { code: 'JPY', label: 'Japanese yen' },
  { code: 'CAD', label: 'Canadian dollar' },
  { code: 'AUD', label: 'Australian dollar' },
  { code: 'INR', label: 'Indian rupee' },
  { code: 'SGD', label: 'Singapore dollar' },
  { code: 'MYR', label: 'Malaysian ringgit' },
] as const;
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as readonly [string, ...string[]];

/** The invoice route keeps only these characters and the first 10 of them. */
export const INVOICE_PREFIX = /^[A-Za-z0-9_-]{1,10}$/;

/** Everything the page edits, in the shape the API takes. */
export interface ClinicSettingsForm {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicWebsite: string;
  taxId: string;
  licenseNumber: string;
  ptr: string;
  businessHours: DayHours[];
  timezone: string;
  defaultDuration: number;
  appointmentReminders: boolean;
  /** Patients may book video visits from the app. */
  teleconsultBooking: boolean;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  allowPartialPayments: boolean;
  autoAssignRooms: boolean;
  displayQueuePublicly: boolean;
  /** Patients may check in from the app by scanning the clinic check-in QR. */
  patientSelfCheckIn: boolean;
  prescriptionPaperSize: 'A4' | 'A5';
  prescriptionDigitalSignatureEnabled: boolean;
  sidebarCollapsed: boolean;
  automations: Record<string, boolean>;
  bir: BirSettings;
  philhealth: PhilhealthSettings;
}

export interface ClinicSettingsPageData {
  form: ClinicSettingsForm;
  /** Settings.updatedAt, sent back on save so a concurrent change is refused, not overwritten. */
  version: string;
  timezones: string[];
  services: { email: boolean; sms: boolean; files: boolean };
  /** The waiting-room screen's address. */
  displayPath: string;
  now: string;
  /** Plan features a setting depends on. */
  plan: { teleconsult: boolean };
  /** BIR serials: per prefix ('' for none), the last number given (numbering only moves forward), and the newest serial printed. */
  serials: { used: Record<string, number>; last: { serialNo: string; at: string } | null };
  lastChange: { who: string; at: string; what: string } | null;
}

/** Which part of the page a stored settings path belongs to, for "Last changed …: billing, queue". */
const AREAS: [RegExp, string][] = [
  [/^(clinicName|clinicAddress|clinicPhone|clinicEmail|clinicWebsite|taxId|licenseNumber|ptr)$/, 'clinic details'],
  [/^(businessHours|timezone)/, 'opening hours'],
  [/^(appointmentSettings|communicationSettings)/, 'appointments'],
  [/^billingSettings/, 'billing'],
  [/^birSettings/, 'BIR invoicing'],
  [/^philhealthSettings/, 'PhilHealth'],
  [/^queueSettings/, 'queue'],
  [/^prescription/, 'prescriptions'],
  [/^displaySettings/, 'staff screens'],
  [/^automationSettings/, 'automations'],
];

export function settingsAreasOf(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const area = AREAS.find(([re]) => re.test(p))?.[1];
    if (area && !out.includes(area)) out.push(area);
  }
  return out;
}

/** "9:00 AM" from "09:00". */
export function clock12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
