import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

// Client-reported events only. Privileged actions (data_deletion, permission_change, ...)
// are logged server-side by the routes that perform them and must not be forgeable here.
const clientAuditSchema = z.object({
  action: z.enum(['view', 'read', 'print', 'download', 'export']).optional(),
  resource: z
    .enum(['patient', 'visit', 'appointment', 'prescription', 'lab_result', 'invoice', 'document', 'user', 'doctor', 'room', 'service', 'notification', 'system'])
    .optional(),
  resourceId: zObjectId.optional(),
  description: z.string().max(500).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= 4000, 'Metadata too large')
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    const parsed = await parseBody(request, clientAuditSchema);
    if (isValidationError(parsed)) return parsed;
    const { action, resource, resourceId, description, metadata } = parsed.data;

    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: action || 'view',
      resource: resource || 'system',
      resourceId,
      description,
      metadata: { ...(metadata || {}), clientReported: true },
      ipAddress,
      userAgent,
      requestMethod: request.method,
      requestPath: request.nextUrl.pathname,
      success: true,
    });

    return NextResponse.json(
      { success: true, message: 'Audit logged' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error logging audit:', error);
    return NextResponse.json(
      { success: false, message: 'Error logging audit' },
      { status: 500 }
    );
  }
}
