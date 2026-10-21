import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { createAuditLog, recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import Queue from '@/models/Queue';
import '@/models/Doctor';
import '@/models/Room';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { readCheckInQr, verifyCheckInCode } from '@/lib/clinic-checkin';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz } from '@/lib/tz';
import { createQueueEntry } from '@/lib/queue-entry';
import { queuePosition } from '@/lib/queue-position';
import { scopedTenantIds } from '../_lib/patient-scope';
import { linkedRecords, recordAtClinic } from '../_lib/linked-records';
import { requireActiveEmcr } from '@/lib/emcr/activation';

const ACTIVE = ['waiting', 'in-progress'];
/** Appointments a patient can arrive for: anything booked and not finished or cancelled. */
const ARRIVABLE = ['pending', 'scheduled', 'confirmed', 'rescheduled'];

function refuse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

/**
 * POST /api/patients/me/check-in
 * Body: { qrCode } — the clinic's check-in QR (lib/clinic-checkin.ts), scanned on arrival.
 *
 * Marks the patient's queue entry at that clinic as checked in, or, when they have an
 * appointment there today but no queue entry yet, seats them in the queue already checked in.
 * → 200 { status: 'checked-in' | 'already-checked-in', queue: { …entry, position, clinic } }
 *
 * Errors (`code`): 400 INVALID_QR, 400 QR_EXPIRED, 403 NOT_REGISTERED, 403 SELF_CHECKIN_OFF,
 * 404 NO_APPOINTMENT (walk-ins register at the front desk).
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'check_in');
  if (locked) return locked;

  const limited = await applyRateLimit(request, rateLimiters.api, `patient-checkin:${session.patientId}`);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const qr = readCheckInQr(body?.qrCode);
  if (!qr) return refuse(400, 'INVALID_QR', 'That isn’t a clinic check-in code. Scan the QR on the clinic’s check-in screen.');

  try {
    await connectDB();
    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const linked = await linkedRecords(patient as any);
    const inScope = (scopedTenantIds(linked.tenantIds, session) ?? []).some((id) => String(id) === qr.tenantId);
    const recordId = inScope ? recordAtClinic(linked, qr.tenantId) : null;
    if (!recordId) {
      return refuse(403, 'NOT_REGISTERED', 'You’re not registered at this clinic yet. Please check in at the front desk.');
    }

    const settings = await getSettings(qr.tenantId);
    if (!settings?.queueSettings?.patientSelfCheckIn) {
      return refuse(403, 'SELF_CHECKIN_OFF', 'This clinic doesn’t take app check-ins. Please check in at the front desk.');
    }
    if (!verifyCheckInCode(qr.tenantId, qr.code)) {
      return refuse(400, 'QR_EXPIRED', 'This check-in code has expired. Scan the code on the clinic’s screen again.');
    }

    const tenantObjectId = new Types.ObjectId(qr.tenantId);
    let status: 'checked-in' | 'already-checked-in' = 'checked-in';

    let entry = await Queue.findOne({ tenantId: tenantObjectId, patient: { $in: linked.patientIds }, status: { $in: ACTIVE } })
      .sort({ queuedAt: -1 })
      .lean<Record<string, any> | null>();

    if (entry) {
      if (entry.checkedIn) {
        status = 'already-checked-in';
      } else {
        await Queue.updateOne(
          { _id: entry._id, checkedIn: { $ne: true } },
          { $set: { checkedIn: true, checkedInAt: new Date(), checkInMethod: 'app' } }
        );
      }
    } else {
      const tz = await getTenantTimezone(qr.tenantId);
      const { start, end } = dayRangeInTz(new Date(), tz);
      const appointment = await Appointment.findOne({
        tenantId: tenantObjectId,
        patient: { $in: linked.patientIds },
        status: { $in: ARRIVABLE },
        modality: { $ne: 'teleconsult' },
        $or: [{ appointmentDate: { $gte: start, $lte: end } }, { scheduledAt: { $gte: start, $lte: end } }],
      })
        .sort({ appointmentTime: 1, scheduledAt: 1 })
        .select('patient doctor')
        .lean<{ _id: Types.ObjectId; patient: Types.ObjectId; doctor?: Types.ObjectId } | null>();
      if (!appointment) {
        return refuse(
          404,
          'NO_APPOINTMENT',
          'We couldn’t find an appointment for you here today. Please check in at the front desk.'
        );
      }

      const seated = await Patient.findById(appointment.patient)
        .select('_id firstName lastName')
        .lean<{ _id: Types.ObjectId; firstName: string; lastName: string } | null>();
      if (!seated) return refuse(404, 'NO_APPOINTMENT', 'We couldn’t find an appointment for you here today. Please check in at the front desk.');

      const created = await createQueueEntry({
        tenantId: tenantObjectId,
        patient: seated,
        queueType: 'appointment',
        appointmentId: appointment._id,
        doctorId: appointment.doctor,
        checkIn: { method: 'app' },
      });
      entry = { _id: created._id };
    }

    const queue = await Queue.findById(entry._id)
      .select('queueNumber status checkedIn checkedInAt queuedAt priority doctor room tenantId estimatedWaitTime')
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name', match: { tenantId: tenantObjectId } })
      .lean<Record<string, any> | null>();
    if (!queue) return NextResponse.json({ success: false, error: 'Failed to check in' }, { status: 500 });

    const position =
      queue.status === 'waiting'
        ? await queuePosition(tenantObjectId, queue as { doctor?: unknown; priority?: number; queuedAt: Date })
        : null;

    if (status === 'checked-in') {
      await createAuditLog({
        userId: session.guardianId ?? session.patientId,
        userEmail: session.email,
        userRole: 'patient',
        tenantId: qr.tenantId,
        action: 'update',
        resource: 'system',
        resourceId: queue._id,
        dataSubject: recordId,
        description: `Patient checked in from the app${session.guardianId ? ' (by a family member)' : ''}: ${queue.queueNumber}`,
        metadata: { checkInMethod: 'app' },
      });
      import('@/lib/automations/queue-notifications')
        .then(({ notifyQueuePositions }) => notifyQueuePositions(tenantObjectId))
        .catch((error) => logger.error('Queue position updates after check-in failed', error as Error));
    }

    return NextResponse.json({
      success: true,
      data: {
        status,
        queue: { ...queue, position, clinic: { tenantId: qr.tenantId, name: (settings as any).clinicName ?? null } },
      },
      message: status === 'checked-in' ? 'You’re checked in.' : 'You’re already checked in.',
    });
  } catch (error) {
    logger.error('Error in patient self check-in', error as Error);
    return NextResponse.json({ success: false, error: 'Check-in failed. Please try again or see the front desk.' }, { status: 500 });
  }
}
