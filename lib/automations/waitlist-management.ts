// Waitlist Management Automation
// Automatically fills cancelled appointment slots from waitlist

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAppointmentById, createAppointment, getMaxAppointmentCodeNumber } from '@/lib/data/appointment';
import { getPatientById } from '@/lib/data/patient';
import prisma from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Some call sites (e.g. app/api/waitlist/route.ts) have not yet been updated
 * to pass a plain string tenantId/doctorId and still construct a Mongoose
 * `Types.ObjectId` — accept anything string-coercible here and normalize
 * with String() below so this module has no ODM dependency.
 */
type IdLike = string | { toString(): string };

export interface WaitlistEntry {
  patientId: string;
  preferredDate?: Date;
  preferredTime?: string;
  doctorId?: string;
  priority?: number; // Higher number = higher priority
  createdAt: Date;
}

// In-memory waitlist (in production, consider using Redis or database)
const waitlist: Map<string, WaitlistEntry[]> = new Map();

/**
 * Add patient to waitlist
 */
export async function addToWaitlist(
  patientId: string,
  options: {
    tenantId?: IdLike;
    doctorId?: IdLike;
    preferredDate?: Date;
    preferredTime?: string;
    priority?: number;
  } = {}
): Promise<{
  success: boolean;
  added: boolean;
  error?: string;
}> {
  try {
    const patientIdStr = String(patientId);
    const tenantId = options.tenantId ? String(options.tenantId) : undefined;

    return await run(tenantId, async () => {
      const patient = await getPatientById(patientIdStr);
      if (!patient) {
        return { success: false, added: false, error: 'Patient not found' };
      }

      const effectiveTenantId = tenantId ?? (patient as any).tenantIds?.[0];

      const waitlistKey = effectiveTenantId ? String(effectiveTenantId) : 'default';

      if (!waitlist.has(waitlistKey)) {
        waitlist.set(waitlistKey, []);
      }

      const entries = waitlist.get(waitlistKey)!;

      // Check if patient is already on waitlist
      const existingIndex = entries.findIndex(
        entry => entry.patientId === patientIdStr
      );

      const entry: WaitlistEntry = {
        patientId: patientIdStr,
        preferredDate: options.preferredDate,
        preferredTime: options.preferredTime,
        doctorId: options.doctorId ? String(options.doctorId) : undefined,
        priority: options.priority || 0,
        createdAt: new Date(),
      };

      if (existingIndex >= 0) {
        // Update existing entry
        entries[existingIndex] = entry;
      } else {
        // Add new entry
        entries.push(entry);
      }

      // Sort by priority (descending) and creation date (ascending)
      entries.sort((a, b) => {
        if (b.priority !== a.priority) {
          return (b.priority || 0) - (a.priority || 0);
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return { success: true, added: true };
    });
  } catch (error: any) {
    console.error('Error adding to waitlist:', error);
    return {
      success: false,
      added: false,
      error: error.message || 'Failed to add to waitlist'
    };
  }
}

/**
 * Remove patient from waitlist
 */
export async function removeFromWaitlist(
  patientId: string,
  tenantId?: IdLike
): Promise<{
  success: boolean;
  removed: boolean;
  error?: string;
}> {
  try {
    const patientIdStr = String(patientId);
    const tenantIdStr = tenantId ? String(tenantId) : undefined;

    const waitlistKey = tenantIdStr ?? 'default';

    if (!waitlist.has(waitlistKey)) {
      return { success: true, removed: false };
    }

    const entries = waitlist.get(waitlistKey)!;
    const index = entries.findIndex(
      entry => entry.patientId === patientIdStr
    );

    if (index >= 0) {
      entries.splice(index, 1);
      return { success: true, removed: true };
    }

    return { success: true, removed: false };
  } catch (error: any) {
    console.error('Error removing from waitlist:', error);
    return {
      success: false,
      removed: false,
      error: error.message || 'Failed to remove from waitlist'
    };
  }
}

/**
 * Find matching waitlist entry for cancelled appointment
 */
function findMatchingWaitlistEntry(
  cancelledAppointment: any,
  tenantId?: string
): WaitlistEntry | null {
  const waitlistKey = tenantId ?? 'default';

  if (!waitlist.has(waitlistKey)) {
    return null;
  }

  const entries = waitlist.get(waitlistKey)!;
  const appointmentDate = cancelledAppointment.appointmentDate
    ? new Date(cancelledAppointment.appointmentDate)
    : cancelledAppointment.scheduledAt
    ? new Date(cancelledAppointment.scheduledAt)
    : null;

  // Find best matching entry
  for (const entry of entries) {
    // Check doctor match
    if (cancelledAppointment.doctor || cancelledAppointment.provider) {
      const appointmentDoctorId = cancelledAppointment.doctor?.id ?? cancelledAppointment.provider?.id;
      if (entry.doctorId && entry.doctorId !== appointmentDoctorId) {
        continue;
      }
    }

    // Check date match (within 7 days)
    if (appointmentDate && entry.preferredDate) {
      const daysDiff = Math.abs(
        (appointmentDate.getTime() - new Date(entry.preferredDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > 7) {
        continue;
      }
    }

    // Found a match
    return entry;
  }

  return null;
}

/**
 * Fill cancelled appointment slot from waitlist
 */
export async function fillCancelledSlot(
  appointmentId: string,
  tenantId?: string
): Promise<{
  success: boolean;
  filled: boolean;
  newAppointment?: any;
  error?: string;
}> {
  try {
    const appointmentIdStr = String(appointmentId);
    const tId = tenantId ? String(tenantId) : undefined;

    return await run(tId, async () => {
      const settings = await getSettings(tId);
      const autoWaitlistManagement = (settings.automationSettings as any)?.autoWaitlistManagement !== false;

      if (!autoWaitlistManagement) {
        return { success: true, filled: false };
      }

      const appointment = await getAppointmentById(appointmentIdStr);

      if (!appointment) {
        return { success: false, filled: false, error: 'Appointment not found' };
      }

      // Only fill if appointment is cancelled
      if (appointment.status !== 'cancelled') {
        return { success: true, filled: false };
      }

      const effectiveTenantId = tId ?? (appointment.tenantId ?? undefined);

      // Find matching waitlist entry
      const waitlistEntry = findMatchingWaitlistEntry(appointment, effectiveTenantId);

      if (!waitlistEntry) {
        return { success: true, filled: false };
      }

      // Get patient
      const patient = await getPatientById(waitlistEntry.patientId);
      if (!patient) {
        return { success: false, filled: false, error: 'Waitlist patient not found' };
      }

      // Create new appointment with same slot
      const appointmentDate = appointment.appointmentDate
        ? new Date(appointment.appointmentDate as any)
        : appointment.scheduledAt
        ? new Date(appointment.scheduledAt as any)
        : new Date();

      const appointmentTime = appointment.appointmentTime
        || (appointment.scheduledAt
          ? `${new Date(appointment.scheduledAt as any).getHours().toString().padStart(2, '0')}:${new Date(appointment.scheduledAt as any).getMinutes().toString().padStart(2, '0')}`
          : waitlistEntry.preferredTime || '09:00');

      // Generate appointment code
      const nextNumber = (await getMaxAppointmentCodeNumber()) + 1;
      const appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;

      const doctorId = (appointment.doctor as any)?.id ?? (appointment.provider as any)?.id ?? undefined;

      // Create new appointment
      const newAppointment = await createAppointment({
        patient: { connect: { id: patient.id } },
        doctor: doctorId ? { connect: { id: doctorId } } : undefined,
        provider: doctorId ? { connect: { id: doctorId } } : undefined,
        appointmentCode,
        appointmentDate,
        appointmentTime,
        scheduledAt: appointment.scheduledAt ?? appointmentDate,
        status: 'scheduled',
        reason: 'Waitlist fill',
        notes: `Appointment filled from waitlist (replacing cancelled appointment ${appointment.appointmentCode})`,
        duration: appointment.duration || 30,
        ...(effectiveTenantId ? { tenant: { connect: { id: effectiveTenantId } } } : {}),
      } as any);

      // Remove from waitlist
      await removeFromWaitlist(patient.id, effectiveTenantId);

      // Notify patient
      const patientObj = newAppointment.patient as any;
      if (patientObj) {
        // Send SMS
        if (patientObj.phone) {
          try {
            let phoneNumber = patientObj.phone.trim();
            if (!phoneNumber.startsWith('+')) {
              phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
            }

            const message = `Great news! An appointment slot has become available. Your appointment is scheduled for ${appointmentDate.toLocaleDateString()} at ${appointmentTime}. Appointment Code: ${appointmentCode}. Please confirm by replying YES.`;

            await sendSMS({
              to: phoneNumber,
              message,
            });
          } catch (error) {
            console.error('Error sending waitlist fill SMS:', error);
          }
        }

        // Send email
        if (patientObj.email) {
          try {
            const emailContent = generateWaitlistFillEmail(newAppointment);
            await sendEmail({
              to: patientObj.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });
          } catch (error) {
            console.error('Error sending waitlist fill email:', error);
          }
        }

        // Send notification
        try {
          await createNotification({
            userId: patient.id,
            type: 'appointment',
            priority: 'high',
            title: 'Appointment Available from Waitlist',
            message: `An appointment slot has become available. Your appointment is scheduled for ${appointmentDate.toLocaleDateString()} at ${appointmentTime}.`,
            relatedEntityType: 'appointment',
            relatedEntityId: newAppointment.id,
            actionUrl: `/appointments/${newAppointment.id}`,
          });
        } catch (error) {
          console.error('Error creating waitlist fill notification:', error);
        }
      }

      return { success: true, filled: true, newAppointment };
    });
  } catch (error: any) {
    console.error('Error filling cancelled slot:', error);
    return {
      success: false,
      filled: false,
      error: error.message || 'Failed to fill cancelled slot'
    };
  }
}

/**
 * Process cancelled appointments and fill from waitlist
 * This should be called by a cron job or when appointment is cancelled
 */
export async function processWaitlistFills(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  filled: number;
  errors: number;
  results: Array<{ appointmentId: string; success: boolean; filled: boolean; error?: string }>;
}> {
  try {
    const tId = tenantId ? String(tenantId) : undefined;

    return await run(tId, async () => {
      const settings = await getSettings(tId);
      const autoWaitlistManagement = (settings.automationSettings as any)?.autoWaitlistManagement !== false;

      if (!autoWaitlistManagement) {
        return { success: true, processed: 0, filled: 0, errors: 0, results: [] };
      }

      // Find recently cancelled appointments (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const cancelledAppointments = await prisma.appointment.findMany({
        where: {
          ...(tId ? { tenantId: tId } : {}),
          status: 'cancelled',
          updatedAt: { gte: oneHourAgo },
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      const results: Array<{ appointmentId: string; success: boolean; filled: boolean; error?: string }> = [];
      let filled = 0;
      let errors = 0;

      for (const appointment of cancelledAppointments) {
        const result = await fillCancelledSlot(appointment.id, appointment.tenantId ?? undefined);

        results.push({
          appointmentId: appointment.id,
          success: result.success,
          filled: result.filled,
          error: result.error,
        });

        if (result.success && result.filled) {
          filled++;
        } else if (!result.success) {
          errors++;
        }
      }

      return {
        success: true,
        processed: cancelledAppointments.length,
        filled,
        errors,
        results,
      };
    });
  } catch (error: any) {
    console.error('Error processing waitlist fills:', error);
    return {
      success: false,
      processed: 0,
      filled: 0,
      errors: 1,
      results: [{ appointmentId: 'unknown', success: false, filled: false, error: error.message }],
    };
  }
}

/**
 * Generate waitlist fill email
 */
function generateWaitlistFillEmail(appointment: any): { subject: string; html: string } {
  const patient = appointment.patient as any;
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate || appointment.scheduledAt).toLocaleDateString();
  const appointmentTime = appointment.appointmentTime || 'TBD';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
  const confirmUrl = `${baseUrl}/api/appointments/${appointment.id}/confirm?action=yes`;

  const subject = `Appointment Available - ${appointmentDate}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4CAF50; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Available!</h1>
        </div>
        <div class="content">
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p><strong>Great news!</strong> An appointment slot has become available and we've scheduled it for you:</p>
          <div class="info-box">
            <p><strong>Date:</strong> ${appointmentDate}</p>
            <p><strong>Time:</strong> ${appointmentTime}</p>
            ${doctor ? `<p><strong>Doctor:</strong> Dr. ${doctor.firstName} ${doctor.lastName}</p>` : ''}
            <p><strong>Appointment Code:</strong> ${appointment.appointmentCode}</p>
          </div>
          <p>Please confirm this appointment by clicking the button below or replying to this email.</p>
          <p style="text-align: center;">
            <a href="${confirmUrl}" class="button">Confirm Appointment</a>
          </p>
          <p>If this time doesn't work for you, please contact us to reschedule.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}
