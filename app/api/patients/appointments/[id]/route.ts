import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import User from '@/models/User';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { notifyStaff } from '@/lib/notify';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { combineDateAndTimeInTz, formatInTz } from '@/lib/tz';
import { ACTIVE_APPOINTMENT_STATUSES, isSlotDuplicateError, normalizeTime } from '@/lib/appointment-booking';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { memberTenantIds } from '../../me/_lib/patient-scope';
import { linkedRecords } from '../../me/_lib/linked-records';
import { checkPatientSlot, sendBookingConfirmation, slotTaken, toPatientBooking } from '../_lib/booking';

/** Closed out: the patient can neither cancel nor move these. */
const CLOSED_STATUSES = ['completed', 'cancelled', 'no-show'];

/** Staff told about a patient's reschedule (with the doctor's own account). */
const FRONT_DESK_ROLES = ['admin', 'owner', 'receptionist'];

/**
 * Cancel an appointment for logged-in patient
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) return patientAuthError(request);

    await connectDB();

    const patient = await Patient.findById(sessionData.patientId).select('tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    const linked = await linkedRecords(patient as any);

    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    // Only the patient's own appointments (on any linked record) at one of their clinics (the
    // session's clinic, when bound).
    const appointment = await Appointment.findOne({
      _id: id,
      patient: { $in: linked.patientIds },
      tenantId: { $in: memberTenantIds(linked.tenantIds, sessionData) },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    if (CLOSED_STATUSES.includes(appointment.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot cancel an appointment that is already ${appointment.status}` },
        { status: 400 }
      );
    }

    const tz = await getTenantTimezone(appointment.tenantId);
    const appointmentDateTime = appointment.appointmentDate
      ? combineDateAndTimeInTz(appointment.appointmentDate, appointment.appointmentTime || '00:00', tz)
      : appointment.scheduledAt;

    if (appointmentDateTime && appointmentDateTime < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel past appointments' },
        { status: 400 }
      );
    }

    appointment.status = 'cancelled';
    appointment.notes = `${appointment.notes ? appointment.notes + '\n' : ''}Cancelled by patient on ${new Date().toISOString()}`;
    await appointment.save();

    logger.info('Patient cancelled appointment', {
      patientId: sessionData.patientId,
      appointmentId: id,
      appointmentCode: appointment.appointmentCode,
    });

    return NextResponse.json({
      success: true,
      message: 'Appointment cancelled successfully',
    });

  } catch (error: any) {
    logger.error('Error cancelling appointment', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel appointment' },
      { status: 500 }
    );
  }
}

const rescheduleSchema = z.object({
  appointmentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid appointment date.'),
  appointmentTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Appointment time must be in HH:mm format.'),
});

/** "Mon, Nov 3 at 09:30" in the clinic's timezone. */
function slotLabel(date: Date | string, time: string, tz: string): string {
  return `${formatInTz(date, 'EEE, MMM d', tz)} at ${time}`;
}

/**
 * Move one of the logged-in patient's upcoming appointments to another free slot with the same
 * doctor: PATCH { appointmentDate: "yyyy-MM-dd", appointmentTime: "HH:mm" }. The appointment keeps
 * its id, code, reason and visit type, and goes back to `pending` for the clinic to confirm the
 * new time. The cut-off is the same as cancelling; the slot rules and 409s are the same as booking.
 * Asking for the slot it already has is a no-op success, so a retry after a lost reply is safe.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) return patientAuthError(request);
    const locked = await requireActiveEmcr(sessionData, 'booking');
    if (locked) return locked;

    await connectDB();

    const parsed = await parseBody(request, rescheduleSchema);
    if (isValidationError(parsed)) return parsed;
    const appointmentDate = parsed.data.appointmentDate.slice(0, 10);
    const appointmentTime = normalizeTime(parsed.data.appointmentTime);
    const appointmentDateObj = new Date(appointmentDate);
    if (isNaN(appointmentDateObj.getTime()) || !appointmentTime) {
      return NextResponse.json({ success: false, error: 'Invalid appointment date.' }, { status: 400 });
    }

    const signedIn = await Patient.findById(sessionData.patientId).select('tenantIds accountId').lean();
    if (!signedIn) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }
    const linked = await linkedRecords(signedIn as any);

    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    // Only the patient's own appointments (on any linked record) at one of their clinics (the
    // session's clinic, when bound), as for cancelling.
    const appointment = await Appointment.findOne({
      _id: id,
      patient: { $in: linked.patientIds },
      tenantId: { $in: memberTenantIds(linked.tenantIds, sessionData) },
    }).lean<Record<string, any>>();
    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    if (CLOSED_STATUSES.includes(appointment.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot reschedule an appointment that is already ${appointment.status}` },
        { status: 400 }
      );
    }
    if (appointment.isWalkIn || !appointment.doctor || !appointment.appointmentDate || !appointment.appointmentTime) {
      return NextResponse.json(
        { success: false, error: 'This visit can’t be moved in the app. Please contact the clinic.' },
        { status: 400 }
      );
    }

    const tenantId = appointment.tenantId;
    const tz = await getTenantTimezone(tenantId);
    const currentDay = formatInTz(appointment.appointmentDate, 'yyyy-MM-dd', tz);

    // Already at that slot (e.g. a retry after the reply was lost): nothing to change.
    if (currentDay === appointmentDate && appointment.appointmentTime === appointmentTime) {
      return NextResponse.json({
        success: true,
        data: toPatientBooking(appointment, tz),
        message: 'Your appointment is already at this time.',
      });
    }

    if (combineDateAndTimeInTz(appointment.appointmentDate, appointment.appointmentTime, tz) < new Date()) {
      return NextResponse.json({ success: false, error: 'Cannot reschedule past appointments' }, { status: 400 });
    }

    const doctor = await Doctor.findOne({ _id: appointment.doctor, tenantId, status: 'active' })
      .select('firstName lastName schedule availabilityOverrides')
      .lean() as any;
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'This doctor isn’t taking online bookings right now. Please contact the clinic.' },
        { status: 400 }
      );
    }

    const slot = await checkPatientSlot({
      tenantId,
      doctor,
      patientId: appointment.patient,
      appointmentDate,
      appointmentTime,
      duration: appointment.duration,
      excludeId: appointment._id,
    });
    if (slot instanceof NextResponse) return slot;

    const from = slotLabel(appointment.appointmentDate, appointment.appointmentTime, tz);
    const to = slotLabel(appointmentDateObj, appointmentTime, tz);
    const note = `Rescheduled by patient from ${from} to ${to} on ${new Date().toISOString()}`;

    // Only if nobody changed it meanwhile (staff, or the patient on another device).
    let updated;
    try {
      updated = await Appointment.findOneAndUpdate(
        {
          _id: appointment._id,
          tenantId,
          status: { $in: ACTIVE_APPOINTMENT_STATUSES },
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
        },
        {
          $set: {
            appointmentDate: appointmentDateObj,
            appointmentTime,
            // The clinic confirms the new time, as it does a new request.
            status: 'pending',
            notes: `${appointment.notes ? appointment.notes + '\n' : ''}${note}`,
          },
          // Reminders go out again for the new time.
          $unset: { reminderSentAt: 1, reminderClaimedAt: 1 },
        },
        { new: true, runValidators: true }
      )
        .populate({ path: 'patient', select: 'firstName lastName email phone patientCode', match: { tenantIds: tenantId } })
        .populate({
          path: 'doctor',
          select: 'firstName lastName specializationId',
          populate: { path: 'specializationId', select: 'name' },
          match: { tenantId },
        });
    } catch (err: any) {
      if (isSlotDuplicateError(err)) return slotTaken();
      throw err;
    }
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'This appointment was just changed. Please refresh and try again.' },
        { status: 409 }
      );
    }

    const patient = updated.patient as any;
    const code: string = updated.appointmentCode ?? 'an appointment';
    after(() => sendBookingConfirmation(updated, tz, { rescheduled: true }).catch(console.error));
    after(() =>
      createAuditLog({
        userId: sessionData.guardianId ?? sessionData.patientId,
        userEmail: sessionData.email,
        userRole: 'patient',
        tenantId,
        action: 'update',
        resource: 'appointment',
        resourceId: String(updated._id),
        dataSubject: String(appointment.patient),
        description: `Patient rescheduled appointment ${code} from ${from} to ${to}${sessionData.guardianId ? ' (by a family member)' : ''}`,
        changes: [
          { field: 'appointmentDate', oldValue: currentDay, newValue: appointmentDate },
          { field: 'appointmentTime', oldValue: appointment.appointmentTime, newValue: appointmentTime },
          ...(appointment.status !== 'pending' ? [{ field: 'status', oldValue: appointment.status, newValue: 'pending' }] : []),
        ],
      })
    );
    after(async () => {
      try {
        const doctorUsers = await User.find({ tenantId, doctorProfile: doctor._id, status: 'active' })
          .select('_id')
          .lean<{ _id: unknown }[]>();
        const name = `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim() || 'A patient';
        await notifyStaff({
          tenantId: String(tenantId),
          audience: { roles: FRONT_DESK_ROLES, userIds: doctorUsers.map((u) => String(u._id)) },
          type: 'appointment',
          priority: 'high',
          title: 'Appointment rescheduled by patient',
          message: `${name} moved ${code} with Dr. ${doctor.lastName} from ${from} to ${to}. Please confirm the new time.`,
          actionUrl: `/appointments/${updated._id}`,
          sender: { kind: 'system' },
          metadata: { appointmentId: String(updated._id) },
        });
      } catch (error) {
        logger.error('Staff notification for a patient reschedule failed', error as Error);
      }
    });

    logger.info('Patient rescheduled appointment', {
      patientId: sessionData.patientId,
      appointmentId: id,
      appointmentCode: updated.appointmentCode,
      appointmentDate,
      appointmentTime,
    });

    return NextResponse.json({
      success: true,
      data: toPatientBooking(updated as any, tz),
      message: 'Appointment moved. The clinic will confirm the new time.',
    });
  } catch (error: any) {
    logger.error('Error rescheduling appointment', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to reschedule appointment' }, { status: 500 });
  }
}
