/**
 * WebSocket Emit Helpers
 * 
 * These functions emit WebSocket events from API routes when data changes.
 * Use these in your API routes (PUT, POST, DELETE) to notify connected clients.
 */

import { Server as SocketIOServer } from 'socket.io';

/**
 * Get the Socket.IO server instance
 * Set by server.ts as a global variable
 */
function getIO(): SocketIOServer | null {
  return (global as any).io || null;
}

interface EmitOptions {
  tenantId?: string;
  userId?: string;
}

/**
 * Emit queue update event
 */
export function emitQueueUpdate(queueItem: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `queue:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('queue:updated', {
      queueItem,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit queue update:', error);
  }
}

/**
 * Emit appointment update event
 */
export function emitAppointmentUpdate(appointment: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `appointments:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('appointment:updated', {
      appointment,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit appointment update:', error);
  }
}

/**
 * Emit visit update event
 */
export function emitVisitUpdate(visit: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `visits:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('visit:updated', {
      visit,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit visit update:', error);
  }
}

/**
 * Emit prescription creation event
 */
export function emitPrescriptionCreated(prescription: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `prescriptions:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('prescription:created', {
      prescription,
      timestamp: Date.now(),
    });

    // Also emit to visits room (prescriptions are linked to visits)
    const visitsRoom = `visits:${options?.tenantId || 'default'}`;
    io.to(visitsRoom).emit('visit:prescription-created', {
      prescription,
      visitId: prescription.visit,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit prescription creation:', error);
  }
}

/**
 * Emit invoice creation/update event
 */
export function emitInvoiceUpdate(invoice: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `invoices:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('invoice:updated', {
      invoice,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit invoice update:', error);
  }
}

/**
 * Emit patient update event
 */
export function emitPatientUpdate(patient: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `patients:${options?.tenantId || 'default'}`;
    
    io.to(room).emit('patient:updated', {
      patient,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit patient update:', error);
  }
}

/**
 * Emit a generic notification to specific user
 */
export function emitUserNotification(userId: string, notification: any, options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `user:${userId}`;
    
    io.to(room).emit('notification', {
      ...notification,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit user notification:', error);
  }
}

/**
 * Emit bulk update event (e.g., when multiple records change)
 */
export function emitBulkUpdate(type: 'queue' | 'appointments' | 'visits' | 'prescriptions' | 'invoices', options?: EmitOptions) {
  try {
    const io = getIO();
    if (!io) {
      console.warn('[WS Emit] Socket.IO not initialized');
      return;
    }

    const room = `${type}:${options?.tenantId || 'default'}`;
    
    io.to(room).emit(`${type}:bulk-update`, {
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[WS Emit] ❌ Failed to emit bulk update:', error);
  }
}
