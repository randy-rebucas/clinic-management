import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
    const updateQuery: any = { user: session.userId, read: false };
    if (tenantId) {
      updateQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      updateQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const result = await Notification.updateMany(
      updateQuery,
      { read: true, readAt: new Date() }
    );

    return NextResponse.json({
      success: true,
      data: { updatedCount: result.modifiedCount },
    });
  } catch (error: any) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}

