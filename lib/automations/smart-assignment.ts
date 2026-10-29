// Smart Appointment Assignment Automation
// Auto-assigns doctors based on workload, specialization, availability, and patient preferences

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { combineDateAndTimeInTz, dayRangeInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, getTenantTimezone, errorMessage, type AutomationTenant } from './shared';

export interface SmartAssignmentOptions {
  appointmentId?: string | Types.ObjectId;
  patientId?: string | Types.ObjectId;
  appointmentDate?: Date;
  appointmentTime?: string;
  reason?: string;
  preferredDoctorId?: string | Types.ObjectId;
  specialization?: string;
  tenantId?: string | Types.ObjectId;
}

export interface DoctorScore {
  doctorId: Types.ObjectId;
  doctor: any;
  score: number;
  reasons: string[];
}

const MAX_DOCTORS = 100;
const BATCH_SIZE = 50;

/**
 * Calculate doctor workload score (lower is better)
 */
async function calculateWorkloadScore(
  doctorId: Types.ObjectId,
  appointmentDate: Date,
  appointmentTime: string,
  duration: number,
  tenantId: Types.ObjectId,
  tz: string
): Promise<{ workload: number; reasons: string[] }> {
  const reasons: string[] = [];

  const appointmentStart = combineDateAndTimeInTz(appointmentDate, appointmentTime, tz);
  const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60 * 1000);
  const { start: dayStart, end: dayEnd } = dayRangeInTz(appointmentStart, tz);

  const dayAppointments = await Appointment.find({
    tenantId,
    $and: [
      { $or: [{ doctor: doctorId }, { provider: doctorId }] },
      { $or: [{ appointmentDate: { $gte: dayStart, $lte: dayEnd } }, { scheduledAt: { $gte: dayStart, $lte: dayEnd } }] },
    ],
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
  })
    .select('appointmentDate appointmentTime scheduledAt duration')
    .lean<any[]>();
  const dayCount = dayAppointments.length;

  let overlappingCount = 0;
  for (const apt of dayAppointments) {
    let aptStart: Date;
    if (apt.scheduledAt) {
      aptStart = new Date(apt.scheduledAt);
    } else if (apt.appointmentDate && apt.appointmentTime) {
      aptStart = combineDateAndTimeInTz(apt.appointmentDate, apt.appointmentTime, tz);
    } else {
      continue;
    }
    const aptEnd = new Date(aptStart.getTime() + (apt.duration || 30) * 60 * 1000);
    if (appointmentStart < aptEnd && aptStart < appointmentEnd) {
      overlappingCount++;
    }
  }

  let workload = dayCount * 0.5;
  if (dayCount > 10) {
    workload += (dayCount - 10) * 0.5;
    reasons.push(`High daily appointment count: ${dayCount}`);
  }
  if (overlappingCount > 0) {
    workload += overlappingCount * 20;
    reasons.push(`${overlappingCount} overlapping appointment(s)`);
  }

  return { workload, reasons };
}

/**
 * Score doctors for appointment assignment
 */
async function scoreDoctors(options: SmartAssignmentOptions & { tenantId: Types.ObjectId }, tz: string): Promise<DoctorScore[]> {
  const doctors = await Doctor.find({ tenantId: options.tenantId, status: 'active' })
    .populate('specializationId', 'name')
    .limit(MAX_DOCTORS)
    .lean<any[]>();

  const wanted = options.specialization ? String(options.specialization).toLowerCase() : null;
  const scores: DoctorScore[] = [];

  for (const doctor of doctors) {
    let score = 100;
    const reasons: string[] = [];

    if (options.preferredDoctorId && String(doctor._id) === String(options.preferredDoctorId)) {
      score += 50;
      reasons.push('Preferred doctor');
    }

    if (wanted) {
      const specName = String(doctor.specializationId?.name || '').toLowerCase();
      if (specName && specName.includes(wanted)) {
        score += 30;
        reasons.push(`Specialization match: ${options.specialization}`);
      } else {
        score -= 20;
        reasons.push('No specialization match');
      }
    }

    if (options.appointmentDate && options.appointmentTime) {
      const workloadResult = await calculateWorkloadScore(
        doctor._id,
        options.appointmentDate,
        options.appointmentTime,
        30,
        options.tenantId,
        tz
      );
      score -= workloadResult.workload;
      reasons.push(...workloadResult.reasons);
    }

    // Continuity of care: visits reference the doctor's User account.
    if (options.patientId) {
      const doctorUser = await User.findOne({ tenantId: options.tenantId, doctorProfile: doctor._id }).select('_id').lean<any>();
      if (doctorUser) {
        const recentVisits = await Visit.countDocuments({
          tenantId: options.tenantId,
          patient: options.patientId,
          provider: doctorUser._id,
          status: 'closed',
        });
        if (recentVisits > 0) {
          score += 20;
          reasons.push(`Has ${recentVisits} previous visit(s) with patient`);
        }
      }
    }

    scores.push({ doctorId: doctor._id, doctor, score: Math.max(0, score), reasons });
  }

  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Assign doctor to appointment using smart assignment
 */
export async function assignDoctorToAppointment(
  options: SmartAssignmentOptions
): Promise<{
  success: boolean;
  assigned?: boolean;
  doctorId?: Types.ObjectId;
  doctor?: any;
  score?: number;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.appointmentId) {
      return { success: false, error: 'Appointment ID is required' };
    }

    const filter: Record<string, unknown> = { _id: new Types.ObjectId(String(options.appointmentId)) };
    if (options.tenantId) filter.tenantId = new Types.ObjectId(String(options.tenantId));
    const appointment = await Appointment.findOne(filter);
    if (!appointment || !appointment.tenantId) {
      return { success: false, error: 'Appointment not found' };
    }
    const tenantId = new Types.ObjectId(String(appointment.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoSmartAssignment')) {
      return { success: false, error: 'Smart assignment is disabled' };
    }

    if (appointment.doctor || appointment.provider) {
      return { success: true, assigned: false, error: 'Appointment already has a doctor assigned' };
    }

    const tz = await getTenantTimezone(tenantId);
    const scoringOptions = {
      ...options,
      tenantId,
      patientId: appointment.patient,
      appointmentDate: appointment.appointmentDate || appointment.scheduledAt || options.appointmentDate,
      appointmentTime: appointment.appointmentTime || options.appointmentTime || '09:00',
      reason: appointment.reason || options.reason,
    };

    const scores = await scoreDoctors(scoringOptions, tz);
    if (scores.length === 0) {
      return { success: false, error: 'No available doctors found' };
    }

    const topDoctor = scores[0];
    const doctorUser = await User.findOne({ tenantId, doctorProfile: topDoctor.doctorId }).select('_id').lean<any>();

    // Only fill the slot if it is still unassigned (a user may have assigned it meanwhile).
    const res = await Appointment.updateOne(
      {
        _id: appointment._id,
        tenantId,
        $and: [
          { $or: [{ doctor: { $exists: false } }, { doctor: null }] },
          { $or: [{ provider: { $exists: false } }, { provider: null }] },
        ],
      },
      { $set: { doctor: topDoctor.doctorId, ...(doctorUser ? { provider: doctorUser._id } : {}) } }
    );

    return {
      success: true,
      assigned: res.modifiedCount > 0,
      doctorId: topDoctor.doctorId,
      doctor: topDoctor.doctor,
      score: topDoctor.score,
    };
  } catch (error: any) {
    console.error('Error in smart appointment assignment:', error);
    return {
      success: false,
      error: 'Failed to assign doctor',
    };
  }
}

type UnassignedResult = {
  success: boolean;
  processed: number;
  assigned: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; doctorId?: string; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<UnassignedResult> {
  const out: UnassignedResult = { success: true, processed: 0, assigned: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoSmartAssignment')) return out;

  const { start: todayStart } = dayRangeInTz(new Date(), tenant.timezone);
  const unassigned = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    $and: [
      { $or: [{ doctor: { $exists: false } }, { doctor: null }] },
      { $or: [{ provider: { $exists: false } }, { provider: null }] },
    ],
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
    appointmentDate: { $gte: todayStart },
  })
    .select('_id')
    .sort({ appointmentDate: 1 })
    .limit(BATCH_SIZE)
    .lean();

  for (const appointment of unassigned as any[]) {
    out.processed++;
    try {
      const result = await assignDoctorToAppointment({ appointmentId: appointment._id, tenantId: tenant.tenantObjectId });
      out.results.push({
        appointmentId: String(appointment._id),
        success: result.success,
        doctorId: result.doctorId?.toString(),
        error: result.error,
      });
      if (result.success && result.assigned) out.assigned++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ appointmentId: String(appointment._id), success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process unassigned upcoming appointments and assign doctors.
 * Without a tenantId every active tenant is processed.
 */
export async function processUnassignedAppointments(tenantId?: string | Types.ObjectId): Promise<UnassignedResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoSmartAssignment' });
    const total: UnassignedResult = { success: runs.every((r) => r.success), processed: 0, assigned: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.assigned += run.result.assigned;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing unassigned appointments:', error);
    return {
      success: false,
      processed: 0,
      assigned: 0,
      errors: 1,
      results: [],
    };
  }
}
