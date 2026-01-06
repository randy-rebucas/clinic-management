// Smart Appointment Assignment Automation
// Auto-assigns doctors based on workload, specialization, availability, and patient preferences

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';

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

/**
 * Calculate doctor workload score (lower is better)
 */
async function calculateWorkloadScore(
  doctorId: Types.ObjectId,
  appointmentDate: Date,
  appointmentTime: string,
  duration: number,
  tenantId?: Types.ObjectId
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
  const dayAppointmentsQuery: any = {
    $or: [{ doctor: doctorId }, { provider: doctorId }],
    appointmentDate: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ['scheduled', 'confirmed'] },
  };
  
  if (tenantId) {
    dayAppointmentsQuery.tenantId = tenantId;
  }
  
  const dayAppointments = await Appointment.find(dayAppointmentsQuery);
  const dayCount = dayAppointments.length;
  
  // Check for overlapping appointments
  const overlappingQuery: any = {
    $and: [
      {
        $or: [{ doctor: doctorId }, { provider: doctorId }],
      },
      {
        $or: [
          {
            appointmentDate: { $exists: true },
            appointmentTime: { $exists: true },
          },
          {
            scheduledAt: { $exists: true },
          },
        ],
      },
    ],
    status: { $in: ['scheduled', 'confirmed'] },
  };
  
  if (tenantId) {
    overlappingQuery.tenantId = tenantId;
  }
  
  const allAppointments = await Appointment.find(overlappingQuery)
    .populate('doctor', 'firstName lastName')
    .populate('provider', 'name');
  
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
  const query: any = { active: true };
  
  if (options.tenantId) {
    query.tenantId = typeof options.tenantId === 'string' 
      ? new Types.ObjectId(options.tenantId)
      : options.tenantId;
  }
  
  // Filter by specialization if provided
  if (options.specialization) {
    query.$or = [
      { specialization: { $regex: options.specialization, $options: 'i' } },
      { 'specializations.name': { $regex: options.specialization, $options: 'i' } },
    ];
  }
  
  const doctors = await Doctor.find(query)
    .populate('specializationId', 'name')
    .populate('specializations.specializationId', 'name');
  
  const scores: DoctorScore[] = [];
  
  for (const doctor of doctors) {
    let score = 100; // Start with perfect score
    const reasons: string[] = [];
    
    // Check if this is preferred doctor
    if (options.preferredDoctorId && doctor._id.toString() === options.preferredDoctorId.toString()) {
      score += 50;
      reasons.push('Preferred doctor');
    }
    
    // Check specialization match
    if (options.specialization) {
      const doctorSpecializations: string[] = [];
      if (doctor.specialization) {
        doctorSpecializations.push(doctor.specialization);
      }
      if (doctor.specializations && Array.isArray(doctor.specializations)) {
        doctorSpecializations.push(...doctor.specializations.map((s: any) => 
          s.name || (s.specializationId?.name) || ''
        ));
      }
      
      const hasSpecialization = doctorSpecializations.some(spec => 
        spec.toLowerCase().includes(options.specialization!.toLowerCase())
      );
      
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
        doctor._id,
        options.appointmentDate,
        options.appointmentTime,
        30, // Default duration
        options.tenantId ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId) : undefined
      );
      
      score -= workloadResult.workload;
      if (workloadResult.reasons.length > 0) {
        reasons.push(...workloadResult.reasons);
      }
    }
    
    // Check if doctor has recent visits with this patient (preference)
    if (options.patientId) {
      const patientId = typeof options.patientId === 'string' 
        ? new Types.ObjectId(options.patientId)
        : options.patientId;
      
      const recentVisitsQuery: any = {
        patient: patientId,
        provider: doctor._id,
        status: 'closed',
      };
      
      if (options.tenantId) {
        recentVisitsQuery.tenantId = typeof options.tenantId === 'string' 
          ? new Types.ObjectId(options.tenantId)
          : options.tenantId;
      }
      
      const recentVisits = await Visit.find(recentVisitsQuery)
        .sort({ date: -1 })
        .limit(5);
      
      if (recentVisits.length > 0) {
        score += 20;
        reasons.push(`Has ${recentVisits.length} recent visit(s) with patient`);
      }
    }
    
    scores.push({
      doctorId: doctor._id,
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
  doctorId?: Types.ObjectId;
  doctor?: any;
  score?: number;
  error?: string;
}> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const autoSmartAssignment = (settings.automationSettings as any)?.autoSmartAssignment !== false;
    
    if (!autoSmartAssignment) {
      return { success: false, error: 'Smart assignment is disabled' };
    }
    
    if (!options.appointmentId) {
      return { success: false, error: 'Appointment ID is required' };
    }
    
    const appointmentId = typeof options.appointmentId === 'string'
      ? new Types.ObjectId(options.appointmentId)
      : options.appointmentId;
    
    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');
    
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
      options.patientId = patient._id;
    }
    
    // Get appointment date/time
    if (appointment.appointmentDate) {
      options.appointmentDate = appointment.appointmentDate;
    } else if (appointment.scheduledAt) {
      options.appointmentDate = appointment.scheduledAt;
    }
    
    if (appointment.appointmentTime) {
      options.appointmentTime = appointment.appointmentTime;
    }
    
    if (appointment.reason) {
      options.reason = appointment.reason;
    }
    
    // Score doctors
    const scores = await scoreDoctors(options);
    
    if (scores.length === 0) {
      return { success: false, error: 'No available doctors found' };
    }
    
    // Assign top scoring doctor
    const topDoctor = scores[0];
    
    appointment.doctor = topDoctor.doctorId;
    appointment.provider = topDoctor.doctorId; // Also set provider for compatibility
    await appointment.save();
    
    return {
      success: true,
      assigned: true,
      doctorId: topDoctor.doctorId,
      doctor: topDoctor.doctor,
      score: topDoctor.score,
    };
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
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  processed: number;
  assigned: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; doctorId?: string; error?: string }>;
}> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const autoSmartAssignment = (settings.automationSettings as any)?.autoSmartAssignment !== false;
    
    if (!autoSmartAssignment) {
      return { success: true, processed: 0, assigned: 0, errors: 0, results: [] };
    }
    
    // Find appointments without assigned doctors
    const query: any = {
      $or: [
        { doctor: { $exists: false } },
        { doctor: null },
        { provider: { $exists: false } },
        { provider: null },
      ],
      status: { $in: ['pending', 'scheduled', 'confirmed'] },
      appointmentDate: { $gte: new Date() }, // Only future appointments
    };
    
    if (tenantId) {
      query.tenantId = typeof tenantId === 'string'
        ? new Types.ObjectId(tenantId)
        : tenantId;
    }
    
    const unassignedAppointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName')
      .limit(50); // Limit batch size
    
    const results: Array<{ appointmentId: string; success: boolean; doctorId?: string; error?: string }> = [];
    let assigned = 0;
    let errors = 0;
    
    for (const appointment of unassignedAppointments) {
      const result = await assignDoctorToAppointment({
        appointmentId: appointment._id,
        patientId: appointment.patient as any,
        appointmentDate: appointment.appointmentDate || appointment.scheduledAt,
        appointmentTime: appointment.appointmentTime || '09:00',
        reason: appointment.reason,
        tenantId: appointment.tenantId,
      });
      
      results.push({
        appointmentId: appointment._id.toString(),
        success: result.success,
        doctorId: result.doctorId?.toString(),
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
