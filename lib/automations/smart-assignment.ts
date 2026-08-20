// Smart Appointment Assignment Automation
// Auto-assigns doctors based on workload, specialization, availability, and patient preferences

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAppointmentById, updateAppointment } from '@/lib/data/appointment';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * app/api/appointments/route.ts already passes a plain string tenantId, but
 * accept anything string-coercible defensively so this module doesn't
 * carry any ODM dependency.
 */
type IdLike = string | { toString(): string };

export interface SmartAssignmentOptions {
  appointmentId?: IdLike;
  patientId?: IdLike;
  appointmentDate?: Date;
  appointmentTime?: string;
  reason?: string;
  preferredDoctorId?: IdLike;
  specialization?: string;
  tenantId?: IdLike;
}

export interface DoctorScore {
  doctorId: string;
  doctor: any;
  score: number;
  reasons: string[];
}

/**
 * Calculate doctor workload score (lower is better)
 */
async function calculateWorkloadScore(
  doctorId: string,
  appointmentDate: Date,
  appointmentTime: string,
  duration: number,
  tenantId?: string
): Promise<{ workload: number; reasons: string[] }> {
  const reasons: string[] = [];

  // Parse appointment time
  const [hours, minutes] = appointmentTime.split(':').map(Number);
  const appointmentStart = new Date(appointmentDate);
  appointmentStart.setHours(hours, minutes, 0, 0);
  const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60 * 1000);

  // Get day range for checking appointments
  const dayStart = new Date(appointmentDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  // Count existing appointments on this day
  const dayAppointments = await prisma.appointment.findMany({
    where: {
      OR: [{ doctorId }, { providerId: doctorId }],
      appointmentDate: { gte: dayStart, lte: dayEnd },
      status: { in: ['scheduled', 'confirmed'] as any },
      ...(tenantId ? { tenantId } : {}),
    },
  });
  const dayCount = dayAppointments.length;

  // Check for overlapping appointments
  const allAppointments = await prisma.appointment.findMany({
    where: {
      OR: [{ doctorId }, { providerId: doctorId }],
      status: { in: ['scheduled', 'confirmed'] as any },
      ...(tenantId ? { tenantId } : {}),
    },
    include: {
      doctor: { select: { firstName: true, lastName: true } },
      provider: { select: { name: true } },
    },
  });

  let overlappingCount = 0;
  for (const apt of allAppointments) {
    let aptStart: Date;
    let aptDuration: number;

    if (apt.scheduledAt) {
      aptStart = new Date(apt.scheduledAt);
      aptDuration = apt.duration || 30;
    } else if (apt.appointmentDate && apt.appointmentTime) {
      aptStart = new Date(apt.appointmentDate);
      const [aptHours, aptMinutes] = apt.appointmentTime.split(':').map(Number);
      aptStart.setHours(aptHours, aptMinutes, 0, 0);
      aptDuration = apt.duration || 30;
    } else {
      continue;
    }

    const aptEnd = new Date(aptStart.getTime() + aptDuration * 60 * 1000);

    // Check for overlap
    if (
      (appointmentStart >= aptStart && appointmentStart < aptEnd) ||
      (appointmentEnd > aptStart && appointmentEnd <= aptEnd) ||
      (appointmentStart <= aptStart && appointmentEnd >= aptEnd)
    ) {
      overlappingCount++;
    }
  }

  // Calculate workload score
  let workload = dayCount * 0.5; // Base score from day count
  workload += overlappingCount * 10; // Heavy penalty for overlaps

  if (dayCount > 10) {
    workload += (dayCount - 10) * 0.5; // Extra penalty for heavy days
    reasons.push(`High daily appointment count: ${dayCount}`);
  }

  if (overlappingCount > 0) {
    workload += overlappingCount * 10;
    reasons.push(`${overlappingCount} overlapping appointment(s)`);
  }

  return { workload, reasons };
}

/**
 * Score doctors for appointment assignment
 */
async function scoreDoctors(
  options: SmartAssignmentOptions
): Promise<DoctorScore[]> {
  const tenantId = options.tenantId ? String(options.tenantId) : undefined;

  const doctors = await prisma.doctor.findMany({
    where: {
      status: 'active',
      ...(tenantId ? { tenantId } : {}),
      ...(options.specialization
        ? { specialization: { name: { contains: options.specialization, mode: 'insensitive' } } }
        : {}),
    },
    include: {
      specialization: { select: { name: true } },
    },
  });

  const scores: DoctorScore[] = [];

  for (const doctor of doctors) {
    let score = 100; // Start with perfect score
    const reasons: string[] = [];

    // Check if this is preferred doctor
    if (options.preferredDoctorId && doctor.id === String(options.preferredDoctorId)) {
      score += 50;
      reasons.push('Preferred doctor');
    }

    // Check specialization match
    if (options.specialization) {
      const doctorSpecialization = doctor.specialization?.name ?? '';
      const hasSpecialization = doctorSpecialization.toLowerCase().includes(options.specialization.toLowerCase());

      if (hasSpecialization) {
        score += 30;
        reasons.push(`Specialization match: ${options.specialization}`);
      } else {
        score -= 20;
        reasons.push('No specialization match');
      }
    }

    // Check workload
    if (options.appointmentDate && options.appointmentTime) {
      const workloadResult = await calculateWorkloadScore(
        doctor.id,
        options.appointmentDate,
        options.appointmentTime,
        30, // Default duration
        tenantId
      );

      score -= workloadResult.workload;
      if (workloadResult.reasons.length > 0) {
        reasons.push(...workloadResult.reasons);
      }
    }

    // Check if doctor has recent visits with this patient (preference)
    if (options.patientId) {
      const patientId = String(options.patientId);

      const recentVisits = await prisma.visit.findMany({
        where: {
          patientId,
          providerId: doctor.id,
          status: 'closed',
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: { date: 'desc' },
        take: 5,
      });

      if (recentVisits.length > 0) {
        score += 20;
        reasons.push(`Has ${recentVisits.length} recent visit(s) with patient`);
      }
    }

    scores.push({
      doctorId: doctor.id,
      doctor,
      score: Math.max(0, score), // Ensure non-negative
      reasons,
    });
  }

  // Sort by score (highest first)
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
  doctorId?: string;
  doctor?: any;
  score?: number;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ? String(options.tenantId) : undefined;

    return await run(tenantId, async () => {
      const settings = await getSettings(tenantId);
      const autoSmartAssignment = (settings.automationSettings as any)?.autoSmartAssignment !== false;

      if (!autoSmartAssignment) {
        return { success: false, error: 'Smart assignment is disabled' };
      }

      if (!options.appointmentId) {
        return { success: false, error: 'Appointment ID is required' };
      }

      const appointmentId = String(options.appointmentId);
      const appointment = await getAppointmentById(appointmentId);

      if (!appointment) {
        return { success: false, error: 'Appointment not found' };
      }

      // If already assigned, skip
      if (appointment.doctor || appointment.provider) {
        return {
          success: true,
          assigned: false,
          error: 'Appointment already has a doctor assigned'
        };
      }

      // Get patient for preference checking
      const patient = appointment.patient as any;
      if (patient) {
        options.patientId = patient.id;
      }

      // Get appointment date/time
      if (appointment.appointmentDate) {
        options.appointmentDate = new Date(appointment.appointmentDate as any);
      } else if (appointment.scheduledAt) {
        options.appointmentDate = new Date(appointment.scheduledAt as any);
      }

      if (appointment.appointmentTime) {
        options.appointmentTime = appointment.appointmentTime as any;
      }

      if (appointment.reason) {
        options.reason = appointment.reason as any;
      }

      // Score doctors
      const scores = await scoreDoctors(options);

      if (scores.length === 0) {
        return { success: false, error: 'No available doctors found' };
      }

      // Assign top scoring doctor
      const topDoctor = scores[0];

      await updateAppointment(appointmentId, {
        doctor: { connect: { id: topDoctor.doctorId } },
        provider: { connect: { id: topDoctor.doctorId } },
      } as any);

      return {
        success: true,
        assigned: true,
        doctorId: topDoctor.doctorId,
        doctor: topDoctor.doctor,
        score: topDoctor.score,
      };
    });
  } catch (error: any) {
    console.error('Error in smart appointment assignment:', error);
    return {
      success: false,
      error: error.message || 'Failed to assign doctor',
    };
  }
}

/**
 * Process all unassigned appointments and assign doctors
 * This should be called by a cron job
 */
export async function processUnassignedAppointments(
  tenantId?: string
): Promise<{
  success: boolean;
  processed: number;
  assigned: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; doctorId?: string; error?: string }>;
}> {
  try {
    const tId = tenantId ? String(tenantId) : undefined;

    return await run(tId, async () => {
      const settings = await getSettings(tId);
      const autoSmartAssignment = (settings.automationSettings as any)?.autoSmartAssignment !== false;

      if (!autoSmartAssignment) {
        return { success: true, processed: 0, assigned: 0, errors: 0, results: [] };
      }

      // Find appointments without assigned doctors
      const unassignedAppointments = await prisma.appointment.findMany({
        where: {
          doctorId: null,
          providerId: null,
          status: { in: ['pending', 'scheduled', 'confirmed'] as any },
          appointmentDate: { gte: new Date() }, // Only future appointments
          ...(tId ? { tenantId: tId } : {}),
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
        take: 50, // Limit batch size
      });

      const results: Array<{ appointmentId: string; success: boolean; doctorId?: string; error?: string }> = [];
      let assigned = 0;
      let errors = 0;

      for (const appointment of unassignedAppointments) {
        const result = await assignDoctorToAppointment({
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          appointmentDate: appointment.appointmentDate || appointment.scheduledAt || undefined,
          appointmentTime: appointment.appointmentTime || '09:00',
          reason: appointment.reason ?? undefined,
          tenantId: appointment.tenantId ?? undefined,
        });

        results.push({
          appointmentId: appointment.id,
          success: result.success,
          doctorId: result.doctorId,
          error: result.error,
        });

        if (result.success && result.assigned) {
          assigned++;
        } else if (!result.success) {
          errors++;
        }
      }

      return {
        success: true,
        processed: unassignedAppointments.length,
        assigned,
        errors,
        results,
      };
    });
  } catch (error: any) {
    console.error('Error processing unassigned appointments:', error);
    return {
      success: false,
      processed: 0,
      assigned: 0,
      errors: 1,
      results: [{ appointmentId: 'unknown', success: false, error: error.message }],
    };
  }
}
