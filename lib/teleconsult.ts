import { randomBytes } from 'node:crypto';
import { DEFAULT_TIMEZONE, combineDateAndTimeInTz } from '@/lib/tz';

/**
 * Teleconsult (video visit) links. Video runs on Jitsi Meet: the room name is long and random,
 * so the link itself is the key, and it is only handed to the patient (and staff) of the
 * appointment, within the join window.
 *
 * TELECONSULT_BASE_URL points at the Jitsi deployment (default meet.jit.si). The public
 * meet.jit.si asks the first person in a room to sign in as moderator and allows only short
 * embeds, so links open in a new tab or the Jitsi app; a self-hosted Jitsi or 8x8 JaaS
 * removes those limits without code changes.
 */

export type AppointmentModality = 'in-person' | 'teleconsult';
export const MODALITIES: AppointmentModality[] = ['in-person', 'teleconsult'];

/** Joinable from 15 minutes before the start until 2 hours after it ends. */
export const OPENS_BEFORE_MIN = 15;
export const CLOSES_AFTER_MIN = 120;

const JOINABLE_STATUSES = new Set(['scheduled', 'confirmed', 'rescheduled', 'pending']);

export function newRoomName(): string {
  return `mcs-${randomBytes(16).toString('hex')}`;
}

export function teleconsultBaseUrl(): string {
  return (process.env.TELECONSULT_BASE_URL || 'https://meet.jit.si').replace(/\/+$/, '');
}

/** Join URL with the display name pre-filled; Jitsi reads config from the hash. */
export function joinUrl(roomName: string, displayName?: string): string {
  const hash = [
    'config.prejoinPageEnabled=true',
    displayName ? `userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}` : null,
  ]
    .filter(Boolean)
    .join('&');
  return `${teleconsultBaseUrl()}/${encodeURIComponent(roomName)}#${hash}`;
}

type ApptLike = {
  status?: string;
  scheduledAt?: Date | string | null;
  appointmentDate?: Date | string | null;
  appointmentTime?: string | null;
  duration?: number | null;
  modality?: string | null;
  teleconsult?: { roomName?: string | null } | null;
};

/** The appointment's start instant: scheduledAt, else the clinic-local date + time. */
export function startOf(appt: ApptLike, tz: string = DEFAULT_TIMEZONE): Date | null {
  let d: Date | null = null;
  if (appt.scheduledAt) d = new Date(appt.scheduledAt);
  else if (appt.appointmentDate && appt.appointmentTime) d = combineDateAndTimeInTz(new Date(appt.appointmentDate), appt.appointmentTime, tz);
  else if (appt.appointmentDate) d = new Date(appt.appointmentDate);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function joinWindow(appt: ApptLike, tz?: string): { opensAt: Date; closesAt: Date } | null {
  const start = startOf(appt, tz);
  if (!start) return null;
  const duration = appt.duration && appt.duration > 0 ? appt.duration : 30;
  return {
    opensAt: new Date(start.getTime() - OPENS_BEFORE_MIN * 60_000),
    closesAt: new Date(start.getTime() + (duration + CLOSES_AFTER_MIN) * 60_000),
  };
}

export interface PatientTeleconsult {
  /** Present only while the call can be joined. */
  joinUrl: string | null;
  opensAt: string | null;
  closesAt: string | null;
  joinable: boolean;
}

/**
 * What the patient app sees for a video appointment. The link is withheld outside the
 * join window and for cancelled, missed or finished appointments.
 */
export function patientTeleconsult(
  appt: ApptLike,
  opts: { tz?: string; displayName?: string; now?: Date } = {}
): PatientTeleconsult | null {
  const { tz, displayName, now = new Date() } = opts;
  if (appt.modality !== 'teleconsult') return null;
  const window = joinWindow(appt, tz);
  const room = appt.teleconsult?.roomName;
  const joinable =
    Boolean(room && window && JOINABLE_STATUSES.has(appt.status ?? '')) &&
    now >= window!.opensAt &&
    now <= window!.closesAt;
  return {
    joinUrl: joinable ? joinUrl(room!, displayName) : null,
    opensAt: window?.opensAt.toISOString() ?? null,
    closesAt: window?.closesAt.toISOString() ?? null,
    joinable,
  };
}

/**
 * Replace the raw room name on an appointment sent to the patient with the computed
 * join details, so the link never leaks outside its window.
 */
export function withPatientTeleconsult<T extends ApptLike>(appt: T, opts: { tz?: string; displayName?: string; now?: Date } = {}) {
  const { teleconsult: _raw, ...rest } = appt as T & { teleconsult?: unknown };
  void _raw;
  return { ...rest, teleconsult: patientTeleconsult(appt, opts) };
}
