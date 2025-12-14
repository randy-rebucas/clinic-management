// Middleware to automatically log API requests for audit trail
// This can be integrated into API routes

import { NextRequest } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { createAuditLog, logDataAccess, logAccessDenied } from '@/lib/audit';

export interface AuditMiddlewareOptions {
  resource: 'patient' | 'visit' | 'appointment' | 'prescription' | 'lab_result' | 'invoice' | 'document' | 'user' | 'doctor' | 'room' | 'service' | 'notification' | 'system';
  action?: 'create' | 'read' | 'update' | 'delete';
  extractResourceId?: (request: NextRequest) => string | null;
  extractDataSubject?: (request: NextRequest) => string | null; // Patient ID for PH DPA
  isSensitive?: boolean;
}

/**
 * Create audit log for API request
 */
export async function auditRequest(
  request: NextRequest,
  options: AuditMiddlewareOptions
): Promise<void> {
  try {
    const session = await verifySession();
    
    if (!session) {
      return;
    }

    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const method = request.method;
    const path = request.nextUrl.pathname;

    const resourceId = options.extractResourceId ? options.extractResourceId(request) : null;
    const dataSubject = options.extractDataSubject ? options.extractDataSubject(request) : null;

    const action = options.action || 
      (method === 'GET' ? 'read' : 
       method === 'POST' ? 'create' : 
       method === 'PUT' || method === 'PATCH' ? 'update' : 
       method === 'DELETE' ? 'delete' : 'read');

    // Get tenantId from session
    const tenantId = session.tenantId;
    
    if (dataSubject && action === 'read') {
      // Log data access for PH DPA compliance
      await logDataAccess(
        session.userId,
        session.email,
        session.role,
        options.resource,
        resourceId || '',
        dataSubject,
        ipAddress,
        userAgent,
        path
      );
    } else {
      await createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId: tenantId,
        action,
        resource: options.resource,
        resourceId: resourceId || undefined,
        dataSubject: dataSubject || undefined,
        ipAddress,
        userAgent,
        requestMethod: method,
        requestPath: path,
        isSensitive: options.isSensitive || !!dataSubject,
      });
    }
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error('Error in audit middleware:', error);
  }
}

