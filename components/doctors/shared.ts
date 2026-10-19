import { SERIES } from '../dashboards/charts';
import { STATUS_LABEL, type DoctorStatus, type TimeOff, type WeeklyHours } from '@/lib/doctors';

export interface DoctorRow {
  _id: string;
  firstName: string;
  lastName: string;
  title?: string;
  email: string;
  phone: string;
  specialization?: string;
  specializationId?: { _id: string; name: string } | null;
  licenseNumber: string;
  ptr?: string;
  /** PhilHealth accreditation number (PAN) of the doctor, for claims. */
  philhealthPan?: string;
  department?: string;
  status?: DoctorStatus;
  qualifications?: string[];
  bio?: string;
  schedule?: WeeklyHours[];
  availabilityOverrides?: TimeOff[];
}

/** Status: active = seen teal, on leave = pending amber, inactive = outside the hue set (outline). */
export const DOCTOR_STATE: Record<DoctorStatus, { label: string; badge: string; fill: string | null }> = {
  active: { label: STATUS_LABEL.active, badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', fill: SERIES.teal },
  'on-leave': { label: STATUS_LABEL['on-leave'], badge: 'bg-amber-50 text-amber-800 ring-amber-200', fill: '#D97706' },
  inactive: { label: STATUS_LABEL.inactive, badge: 'bg-gray-50 text-gray-600 ring-gray-300', fill: null },
};

export const statusOf = (d: { status?: string }): DoctorStatus =>
  d.status === 'on-leave' || d.status === 'inactive' ? d.status : 'active';

/** "Dr. Ana Reyes"; the title the profile carries, "Dr." when none. */
export const doctorName = (d: { title?: string; firstName: string; lastName: string }) =>
  `${d.title?.trim() || 'Dr.'} ${d.firstName} ${d.lastName}`.trim();

export const specialtyOf = (d: { specializationId?: { name?: string } | null; specialization?: string; specialty?: string | null }) =>
  d.specializationId?.name || d.specialty || d.specialization || '';

export const initials = (d: { firstName: string; lastName: string }) =>
  `${d.firstName.charAt(0)}${d.lastName.charAt(0)}`.toUpperCase() || '?';
