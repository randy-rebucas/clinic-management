import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Use tenantId from session directly; avoid extra DB lookup via getTenantContext()
    const tenantId = session.tenantId;
    
    const unreadQuery: any = {
      user: session.userId,
      read: false,
    };
    if (tenantId) {
      unreadQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      unreadQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const unreadCount = await Notification.countDocuments(unreadQuery);

    return NextResponse.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unread count' },
      { status: 500 }
    );
  }
}

