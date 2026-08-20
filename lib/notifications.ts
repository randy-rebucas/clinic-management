// Notification helper functions for creating in-app notifications
//
// Migrated off Mongoose: internals now call lib/data/notification.ts
// (Prisma) instead of models/Notification.ts. Every exported function
// signature below is UNCHANGED — callers throughout the app (automations,
// routes) require no changes and automatically start writing to Postgres.
// Discovered as a gap during the automations-layer migration: this file
// duplicated models/Notification.ts writes independently of the already-
// migrated lib/data/notification.ts (Phase 5 Batch 6), the same class of
// issue lib/audit.ts had before that batch fixed it.

import { createNotification as createNotificationPrisma } from '@/lib/data/notification';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';

export interface CreateNotificationOptions {
  userId: string;
  tenantId?: string; // Tenant ID for multi-tenant support
  type: 'appointment' | 'visit' | 'prescription' | 'lab_result' | 'invoice' | 'reminder' | 'system' | 'broadcast';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  relatedEntity?: {
    type: 'appointment' | 'visit' | 'prescription' | 'lab_result' | 'invoice' | 'patient';
    id: string;
  };
  actionUrl?: string;
  metadata?: { [key: string]: any };
  expiresAt?: Date;
}

/**
 * Create an in-app notification
 */
export async function createNotification(options: CreateNotificationOptions): Promise<any> {
  try {
    // Get tenantId from options or try to get from context
    let tenantId = options.tenantId;
    if (!tenantId) {
      try {
        const { getTenantContext } = await import('./tenant');
        const tenantContext = await getTenantContext();
        tenantId = tenantContext.tenantId || undefined;
      } catch (error) {
        console.warn('Could not get tenant context for notification');
      }
    }

    const input = {
      userId: options.userId,
      type: options.type as any,
      priority: (options.priority || 'normal') as any,
      title: options.title,
      message: options.message,
      relatedEntityType: options.relatedEntity?.type as any,
      relatedEntityId: options.relatedEntity?.id,
      actionUrl: options.actionUrl,
      metadata: options.metadata,
      expiresAt: options.expiresAt,
    };

    // Notification carries a tenantId column and is a directly-scoped model
    // in lib/prisma-tenant-extension.ts — every write needs an active
    // tenant context, same pattern as lib/audit.ts's createAuditLog().
    if (tenantId) {
      return await runWithTenant(tenantId, () => createNotificationPrisma(input));
    }
    return await runAsSystem(() => createNotificationPrisma(input));
  } catch (error: any) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notification for appointment reminder
 */
export async function createAppointmentReminderNotification(
  userId: string,
  appointment: any
): Promise<any> {
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentId = appointment.id ?? appointment._id;

  return createNotification({
    userId,
    type: 'appointment',
    priority: 'normal',
    title: 'Appointment Reminder',
    message: `You have an appointment with ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'your doctor'} on ${appointmentDate.toLocaleDateString()} at ${appointment.appointmentTime || 'TBD'}`,
    relatedEntity: {
      type: 'appointment',
      id: appointmentId,
    },
    actionUrl: `/appointments/${appointmentId}`,
  });
}

/**
 * Create notification for lab result
 */
export async function createLabResultNotification(
  userId: string,
  labResult: any
): Promise<any> {
  const testType = labResult.request?.testType || labResult.requestTestType || 'Lab Test';
  const labResultId = labResult.id ?? labResult._id;

  return createNotification({
    userId,
    type: 'lab_result',
    priority: 'normal',
    title: 'Lab Results Available',
    message: `Your ${testType} results are now available. Please contact your doctor to discuss the results.`,
    relatedEntity: {
      type: 'lab_result',
      id: labResultId,
    },
    actionUrl: `/lab-results/${labResultId}`,
  });
}

/**
 * Create notification for new prescription
 */
export async function createPrescriptionNotification(
  userId: string,
  prescription: any
): Promise<any> {
  const prescriptionId = prescription.id ?? prescription._id;

  return createNotification({
    userId,
    type: 'prescription',
    priority: 'normal',
    title: 'New Prescription',
    message: `A new prescription has been issued. Please review the medications and instructions.`,
    relatedEntity: {
      type: 'prescription',
      id: prescriptionId,
    },
    actionUrl: `/prescriptions/${prescriptionId}`,
  });
}

/**
 * Create notification for invoice/payment
 */
export async function createInvoiceNotification(
  userId: string,
  invoice: any
): Promise<any> {
  const invoiceId = invoice.id ?? invoice._id;

  return createNotification({
    userId,
    type: 'invoice',
    priority: invoice.outstandingBalance > 0 ? 'high' : 'normal',
    title: invoice.outstandingBalance > 0 ? 'Outstanding Balance' : 'Payment Received',
    message: invoice.outstandingBalance > 0
      ? `You have an outstanding balance of ${invoice.outstandingBalance.toFixed(2)}. Please settle your account.`
      : `Payment of ${invoice.totalPaid?.toFixed(2) || '0.00'} has been received. Thank you!`,
    relatedEntity: {
      type: 'invoice',
      id: invoiceId,
    },
    actionUrl: `/invoices/${invoiceId}`,
  });
}
