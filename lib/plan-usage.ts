import { SUBSCRIPTION_PACKAGES, type SubscriptionPlan } from '@/lib/subscription-packages';

/**
 * The plan limits the system actually enforces, in words, with what the clinic uses of each.
 * Used by the admin overview (meters) and the subscription page (meters and plan fit).
 */

export type UsageKey = 'patients' | 'users' | 'doctors' | 'appointments' | 'appointmentsToday' | 'visits' | 'storage';

export interface UsageRow {
  key: UsageKey;
  label: string;
  current: number;
  limit: number | null;
  /** What hitting the limit stops, in words. */
  blocks: string;
}

/** Counts that reset (month, day) rather than standing totals. */
export const RESETS: Partial<Record<UsageKey, string>> = {
  appointments: 'this month',
  appointmentsToday: 'today',
  visits: 'this month',
};

interface Usage {
  patients: { current: number; limit: number | null };
  users: { current: number; limit: number | null };
  doctors: { current: number; limit: number | null };
  appointmentsThisMonth: { current: number; limit: number | null };
  appointmentsToday: { current: number; limit: number | null };
  visitsThisMonth: { current: number; limit: number | null };
  storage: { currentGB: number; limitGB: number | null };
}

export function buildUsageRows(usage: Usage): UsageRow[] {
  return [
    { key: 'users', label: 'Staff accounts', current: usage.users.current, limit: usage.users.limit, blocks: 'new accounts can’t be added' },
    { key: 'doctors', label: 'Doctors', current: usage.doctors.current, limit: usage.doctors.limit, blocks: 'new doctors can’t be added' },
    { key: 'patients', label: 'Patients', current: usage.patients.current, limit: usage.patients.limit, blocks: 'new patients can’t be registered' },
    {
      key: 'appointments',
      label: 'Appointments this month',
      current: usage.appointmentsThisMonth.current,
      limit: usage.appointmentsThisMonth.limit,
      blocks: 'no more can be booked this month',
    },
    {
      key: 'appointmentsToday',
      label: 'Appointments booked today',
      current: usage.appointmentsToday.current,
      limit: usage.appointmentsToday.limit,
      blocks: 'no more can be booked today',
    },
    { key: 'visits', label: 'Visits this month', current: usage.visitsThisMonth.current, limit: usage.visitsThisMonth.limit, blocks: 'no more visits can be started this month' },
    {
      key: 'storage',
      label: 'File storage',
      current: Math.round(usage.storage.currentGB * 100) / 100,
      limit: usage.storage.limitGB,
      blocks: 'files can’t be uploaded',
    },
  ];
}

/** The same limits for any plan, from the catalogue. */
export function planLimits(plan: SubscriptionPlan): Record<UsageKey, number | null> {
  const p = SUBSCRIPTION_PACKAGES[plan];
  return {
    users: p.maxUsers,
    doctors: p.maxDoctors,
    patients: p.maxPatients,
    appointments: p.maxAppointmentsPerMonth,
    appointmentsToday: p.maxAppointmentsPerDay,
    visits: p.maxVisitsPerMonth,
    storage: p.maxStorageGB,
  };
}
