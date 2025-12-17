import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { sendBroadcastMessage } from '@/lib/automations/broadcast-messaging';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Send broadcast message to patient group
 * Requires admin or manager permissions
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission - only admins and managers can send broadcasts
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();

    if (!body.message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await sendBroadcastMessage({
      message: body.message,
      subject: body.subject,
      targetGroup: body.targetGroup,
      tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
      sendSMS: body.sendSMS !== false,
      sendEmail: body.sendEmail !== false,
      sendNotification: body.sendNotification !== false,
    });

    return NextResponse.json({
      success: true,
      message: 'Broadcast message sent',
      data: result,
    });
  } catch (error: any) {
    console.error('Error sending broadcast message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send broadcast message' },
      { status: 500 }
    );
  }
}

