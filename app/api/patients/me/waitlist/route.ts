import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import WaitlistEntry from '@/models/WaitlistEntry';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { getTenantContext } from '@/lib/tenant';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { bookingHorizon, clinicClock } from '@/lib/booking-slots';
import { addToWaitlist } from '@/lib/automations/waitlist-management';
import { automationEnabled } from '@/lib/automations/shared';
import { memberTenantIds, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords, recordAtClinic } from '../_lib/linked-records';
import { clinicNames } from '../_lib/clinic-names';
import {
  FILLED_VISIBLE_MS,
  MAX_ACTIVE_WAITLIST_ENTRIES,
  WAITLIST_DOCTOR_POPULATE,
  isLapsed,
  logWaitlistChange,
  toPatientWaitlistEntry,
} from './_lib/waitlist-view';

type PatientLean = { _id: unknown; active?: boolean; email?: string; tenantIds?: unknown[]; accountId?: unknown };

async function signedInPatient(request: NextRequest, patientId: string): Promise<PatientLean | NextResponse> {
  await connectDB();
  const patient = await Patient.findById(patientId).select('active email tenantIds accountId').lean<PatientLean | null>();
  if (!patient) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
  if (patient.active === false) {
    await recordPatientRefused(patient, request, 'access');
    return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
  }
  return patient;
}

/**
 * GET /api/patients/me/waitlist
 * This person's waitlist entries at their clinics: every one still waiting, and those filled in
 * the last 30 days (with the appointment booked for them). Query: tenantId?
 * → { entries, maxActive }
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    const patient = await signedInPatient(request, session.patientId);
    if (patient instanceof NextResponse) return patient;

    const linked = await linkedRecords(patient);
    const tenant = resolveTenantFilter(linked.tenantIds, session, request.nextUrl.searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const rows = await WaitlistEntry.find({
      patient: { $in: linked.patientIds },
      ...tenant.filter,
      $or: [{ status: 'waiting' }, { status: 'filled', filledAt: { $gte: new Date(Date.now() - FILLED_VISIBLE_MS) } }],
    })
      .select('-priority')
      .populate(WAITLIST_DOCTOR_POPULATE)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<Record<string, any>[]>();
    const names = await clinicNames(rows.map((r) => r.tenantId));

    return NextResponse.json({
      success: true,
      data: { entries: rows.map((r) => toPatientWaitlistEntry(r, names)), maxActive: MAX_ACTIVE_WAITLIST_ENTRIES },
    });
  } catch (error) {
    logger.error('Error fetching patient waitlist', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch your waitlist' }, { status: 500 });
  }
}

const joinSchema = z.object({
  doctorId: zObjectId,
  /** The day wanted ("yyyy-MM-dd"); left out = the doctor's first opening on any day. */
  preferredDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred date must be yyyy-MM-dd.').optional(),
  /** Stored for the clinic to see; the automatic fill matches on doctor and date only. */
  preferredTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Preferred time must be in HH:mm format.').optional(),
});

const conflict = (code: string, error: string) => NextResponse.json({ success: false, code, error }, { status: 409 });

/**
 * POST /api/patients/me/waitlist { doctorId, preferredDate?, preferredTime? }
 * Join the waitlist for a doctor (at the doctor's clinic, which must be one of this person's).
 * One waiting entry per clinic, at most MAX_ACTIVE_WAITLIST_ENTRIES across clinics.
 * 409 codes: WAITLIST_OFF (the clinic doesn't fill from a waitlist), ALREADY_WAITING,
 * WAITLIST_LIMIT. → 201 { entry }
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'booking');
  if (locked) return locked;

  try {
    const parsed = await parseBody(request, joinSchema);
    if (isValidationError(parsed)) return parsed;
    const { doctorId, preferredDate, preferredTime } = parsed.data;

    const patient = await signedInPatient(request, session.patientId);
    if (patient instanceof NextResponse) return patient;
    const linked = await linkedRecords(patient);

    // The clinic is the doctor's, and this person must be registered there (as for booking).
    const doctor = await Doctor.findOne({ _id: doctorId, status: 'active' })
      .select('tenantId firstName lastName')
      .lean<{ _id: Types.ObjectId; tenantId?: Types.ObjectId; firstName?: string; lastName?: string } | null>();
    const clinics = memberTenantIds(linked.tenantIds, session).map(String);
    if (!doctor?.tenantId || !clinics.includes(String(doctor.tenantId))) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    const tenantId = doctor.tenantId;
    const ctx = await getTenantContext();
    if (ctx.tenantId && ctx.tenantId !== String(tenantId)) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    // Each clinic keeps its own record of this person; the entry is made on that one.
    const patientId = recordAtClinic(linked, tenantId);
    if (!patientId) return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });

    const settings = await getSettings(String(tenantId));
    if (!automationEnabled(settings, 'autoWaitlistManagement')) {
      return conflict('WAITLIST_OFF', 'This clinic isn’t using a waitlist. Please choose another time or call the clinic.');
    }

    if (preferredDate) {
      const clock = clinicClock(await getTenantTimezone(tenantId));
      if (!bookingHorizon(clock.today).includes(preferredDate)) {
        return NextResponse.json(
          { success: false, error: 'Choose a day from today up to two months ahead.' },
          { status: 400 }
        );
      }
    }

    const waiting = await WaitlistEntry.find({ patient: { $in: linked.patientIds }, status: 'waiting' })
      .select('tenantId patient doctor preferredDate status')
      .lean<Record<string, any>[]>();
    const live = waiting.filter((e) => !isLapsed(e));
    const atThisClinic = waiting.find((e) => String(e.tenantId) === String(tenantId) && String(e.patient) === String(patientId));
    if (atThisClinic && !isLapsed(atThisClinic)) {
      const same = atThisClinic.doctor && String(atThisClinic.doctor) === String(doctor._id);
      return conflict(
        'ALREADY_WAITING',
        same
          ? 'You’re already on the waitlist for this doctor. Leave that entry first to change the day.'
          : 'You’re already on this clinic’s waitlist for another doctor. Leave that entry first to join this one.'
      );
    }
    if (live.length >= MAX_ACTIVE_WAITLIST_ENTRIES) {
      return conflict('WAITLIST_LIMIT', `You can wait for up to ${MAX_ACTIVE_WAITLIST_ENTRIES} doctors at once. Leave one to join another.`);
    }
    // An entry whose day has long passed can't be matched any more: retire it so the new one
    // queues from now rather than taking over its place in line.
    if (atThisClinic) {
      await WaitlistEntry.updateOne({ _id: atThisClinic._id, status: 'waiting' }, { $set: { status: 'removed' } });
    }

    const added = await addToWaitlist(patientId, {
      tenantId,
      doctorId: doctor._id,
      preferredDate: preferredDate ? new Date(`${preferredDate}T00:00:00.000Z`) : undefined,
      preferredTime,
    });
    if (!added.success) {
      return NextResponse.json({ success: false, error: 'Couldn’t add you to the waitlist. Please try again.' }, { status: 500 });
    }

    const entry = await WaitlistEntry.findOne({ tenantId, patient: patientId, status: 'waiting' })
      .select('-priority')
      .populate(WAITLIST_DOCTOR_POPULATE)
      .lean<Record<string, any> | null>();
    if (!entry) {
      return NextResponse.json({ success: false, error: 'Couldn’t add you to the waitlist. Please try again.' }, { status: 500 });
    }

    const doctorText = `Dr. ${[doctor.firstName, doctor.lastName].filter(Boolean).join(' ')}`.trim();
    after(() =>
      logWaitlistChange(session, request, {
        action: 'create',
        tenantId,
        entryId: entry._id,
        patientId,
        description: `Patient joined the waitlist for ${doctorText}, ${preferredDate ? `around ${preferredDate}` : 'any day'}`,
        metadata: { doctorId: String(doctor._id), preferredDate: preferredDate ?? null },
      })
    );

    return NextResponse.json(
      { success: true, data: { entry: toPatientWaitlistEntry(entry, await clinicNames([tenantId])) } },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Error joining patient waitlist', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t add you to the waitlist. Please try again.' }, { status: 500 });
  }
}
