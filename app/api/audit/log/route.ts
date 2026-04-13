import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession() as any;
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();
    const {
      action,
      resource,
      resourceId,
      description,
      metadata,
      changes,
    } = body;

    // Get tenant context
    const tenantContext = await getTenantContext();

    // Get user IP and user agent from request
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Log the audit event
    await createAuditLog({
      userId: session.userId,
      userEmail: session.user?.email || undefined,
      userRole: typeof session.user?.role === 'object' ? session.user?.role?.name : session.user?.role,
      tenantId: tenantContext.tenantId || undefined,
      action: action || 'view',
      resource: resource || 'system',
      resourceId,
      description,
      metadata,
      changes,
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
    // Don't expose the error details to client
    return NextResponse.json(
      { success: false, message: 'Error logging audit' },
      { status: 500 }
    );
  }
}
