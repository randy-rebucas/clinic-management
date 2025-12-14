// Notification helper functions for creating in-app notifications

import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { Types } from 'mongoose';

export interface CreateNotificationOptions {
  userId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId; // Tenant ID for multi-tenant support
  type: 'appointment' | 'visit' | 'prescription' | 'lab_result' | 'invoice' | 'reminder' | 'system' | 'broadcast';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  relatedEntity?: {
    type: 'appointment' | 'visit' | 'prescription' | 'lab_result' | 'invoice' | 'patient';
    id: string | Types.ObjectId;
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
    await connectDB();
    
    // Get tenantId from options or try to get from context
    let tenantId = options.tenantId;
    if (!tenantId) {
      try {
        const { getTenantContext } = await import('./tenant');
        const tenantContext = await getTenantContext();
        tenantId = tenantContext.tenantId || undefined;
      } catch (error) {
        // If tenant context can't be retrieved, continue without tenantId
        console.warn('Could not get tenant context for notification');
      }
    }
    
    const notificationData: any = {
      user: options.userId,
      type: options.type,
      priority: options.priority || 'normal',
      title: options.title,
      message: options.message,
      relatedEntity: options.relatedEntity,
      actionUrl: options.actionUrl,
      metadata: options.metadata,
      expiresAt: options.expiresAt,
      read: false,
    };
    
    if (tenantId) {
      notificationData.tenantId = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;
    }
    
    const notification = await Notification.create(notificationData);
    return notification;
  } catch (error: any) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notification for appointment reminder
 */
export async function createAppointmentReminderNotification(
  userId: string | Types.ObjectId,
  appointment: any
): Promise<any> {
  const doctor = appointment.doctor as any;
  const appointmentDate = new Date(appointment.appointmentDate);
  
  return createNotification({
    userId,
    type: 'appointment',
    priority: 'normal',
    title: 'Appointment Reminder',
    message: `You have an appointment with ${doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'your doctor'} on ${appointmentDate.toLocaleDateString()} at ${appointment.appointmentTime || 'TBD'}`,
    relatedEntity: {
      type: 'appointment',
      id: appointment._id,
    },
    actionUrl: `/appointments/${appointment._id}`,
  });
}

/**
 * Create notification for lab result
 */
export async function createLabResultNotification(
  userId: string | Types.ObjectId,
  labResult: any
): Promise<any> {
  const testType = labResult.request?.testType || 'Lab Test';
  
  return createNotification({
    userId,
    type: 'lab_result',
    priority: 'normal',
    title: 'Lab Results Available',
    message: `Your ${testType} results are now available. Please contact your doctor to discuss the results.`,
    relatedEntity: {
      type: 'lab_result',
      id: labResult._id,
    },
    actionUrl: `/lab-results/${labResult._id}`,
  });
}

/**
 * Create notification for new prescription
 */
export async function createPrescriptionNotification(
  userId: string | Types.ObjectId,
  prescription: any
): Promise<any> {
  return createNotification({
    userId,
    type: 'prescription',
    priority: 'normal',
    title: 'New Prescription',
    message: `A new prescription has been issued. Please review the medications and instructions.`,
    relatedEntity: {
      type: 'prescription',
      id: prescription._id,
    },
    actionUrl: `/prescriptions/${prescription._id}`,
  });
}

/**
 * Create notification for invoice/payment
 */
export async function createInvoiceNotification(
  userId: string | Types.ObjectId,
  invoice: any
): Promise<any> {
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
      id: invoice._id,
    },
    actionUrl: `/invoices/${invoice._id}`,
  });
}

