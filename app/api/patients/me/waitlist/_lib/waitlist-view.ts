import 'server-only';
import type { NextRequest } from 'next/server';
import { createAuditLog } from '@/lib/audit';
import type { PatientSessionPayload } from '@/app/lib/dal';
import { doctorSummary, PATIENT_DOCTOR_POPULATE } from '../../../_lib/doctor-summary';

/**
 * Patient side of the clinic waitlist (models/WaitlistEntry.ts, filled by
 * lib/automations/waitlist-management.ts). When a booked slot with the doctor is cancelled, the
 * first matching entry gets the slot booked for them automatically and is told by SMS, email and
 * push (`appointment-waitlist-<appointmentId>`). An entry with a date matches slots up to 7 days
 * either side of it; one without a date matches any slot with the doctor.
 */

/** Most entries one person may have waiting at once, across their clinics. */
export const MAX_ACTIVE_WAITLIST_ENTRIES = 3;

/** Slots more than this long after the preferred day never match it (claimMatchingWaitlistEntry). */
export const MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Filled entries stay in the patient's list this long, so they can see what was booked. */
export const FILLED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000;

export const WAITLIST_DOCTOR_POPULATE = PATIENT_DOCTOR_POPULATE;

type Lean = Record<string, any>;

/** A waiting entry whose day is so far past that no slot can match it any more. */
export function isLapsed(entry: { status?: string; preferredDate?: Date | string | null }, now = Date.now()): boolean {
  if (entry.status !== 'waiting' || !entry.preferredDate) return false;
  const day = new Date(entry.preferredDate).getTime();
  return !isNaN(day) && day + MATCH_WINDOW_MS < now;
}

/** "yyyy-MM-dd" for a stored preferred day (stored as that day's UTC midnight). */
function dayKey(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** The patient-facing shape of one entry. Staff priority is not shown. */
export function toPatientWaitlistEntry(entry: Lean, clinicNames: Map<string, string | null>, now = Date.now()) {
  const tenantId = entry.tenantId ? String(entry.tenantId) : null;
  const doctor = doctorSummary(entry.doctor) as Lean | null;
  return {
    _id: String(entry._id),
    /** waiting | filled (a slot was booked: see `appointmentId`) | removed (left; only in the DELETE reply). */
    status: entry.status as 'waiting' | 'filled' | 'removed',
    /** Still waiting, but its day is more than a week past: nothing will match it. */
    lapsed: isLapsed(entry, now),
    clinic: { tenantId, name: tenantId ? clinicNames.get(tenantId) ?? null : null },
    doctor:
      doctor && typeof doctor === 'object' && 'firstName' in doctor
        ? { _id: String(doctor._id), firstName: doctor.firstName, lastName: doctor.lastName, specialization: doctor.specialization ?? null }
        : null,
    /** "yyyy-MM-dd"; null = any day. */
    preferredDate: dayKey(entry.preferredDate),
    preferredTime: entry.preferredTime ?? null,
    joinedAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
    filledAt: entry.filledAt ? new Date(entry.filledAt).toISOString() : null,
    appointmentId: entry.filledAppointmentId ? String(entry.filledAppointmentId) : null,
  };
}

export type PatientWaitlistEntry = ReturnType<typeof toPatientWaitlistEntry>;

/** Audit a patient's join or leave. A family manager acting for the patient is logged as themselves. */
export function logWaitlistChange(
  session: PatientSessionPayload,
  request: NextRequest,
  entry: { action: 'create' | 'delete'; tenantId: unknown; entryId: unknown; patientId: unknown; description: string; metadata?: Record<string, unknown> }
) {
  return createAuditLog({
    userId: session.guardianId ?? session.patientId,
    userEmail: session.email,
    userRole: 'patient',
    tenantId: entry.tenantId ? String(entry.tenantId) : undefined,
    action: entry.action,
    resource: 'appointment',
    resourceId: String(entry.entryId),
    dataSubject: String(entry.patientId),
    isSensitive: true,
    description: `${entry.description}${session.guardianId ? ' (by a family member)' : ''}`,
    metadata: { waitlistEntryId: String(entry.entryId), ...entry.metadata },
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
